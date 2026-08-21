import { StageCommand, StageSessionState, Material } from "../types";
import { PermissionPolicy } from "../permissions/policy";

function ensureMaterialSlides(material: StageSessionState["materials"][number] | undefined, targetPage: number) {
  if (!material || !Array.isArray(material.slides)) return;

  const desiredCount = Math.max(material.totalPages || 1, material.slides.length || 1, targetPage);
  if (desiredCount <= material.slides.length) {
    material.totalPages = Math.max(material.totalPages || 1, desiredCount);
    return;
  }

  material.totalPages = desiredCount;
  while (material.slides.length < desiredCount) {
    const idx = material.slides.length + 1;
    material.slides.push({
      index: idx,
      title: `Slide ${idx}`,
      url: material.url,
      contentUrl: material.url,
    });
  }
}

export function stageSessionReducer(
  state: StageSessionState,
  command: StageCommand
): StageSessionState {
  // Validate authorization
  PermissionPolicy.assertCanExecute(state, command.senderDeviceId, command);

  const now = command.timestamp || Date.now();
  const nextState: StageSessionState = JSON.parse(JSON.stringify(state));
  nextState.version += 1;
  nextState.session.updatedAt = now;

  switch (command.type) {
    case "DEVICE_REQUEST_JOIN": {
      const { deviceName, requestedRole, userAgent } = command.payload;
      const deviceId = command.senderDeviceId;

      const isHostRole = requestedRole === "host";
      const isRoomHostUser = nextState.host.hostUserId === deviceId;
      const autoApprove = isHostRole && isRoomHostUser;

      const isOperator = requestedRole === "operator" || requestedRole === "control";
      const isSpeaker = requestedRole === "speaker";

      nextState.devices[deviceId] = {
        id: deviceId,
        name: deviceName,
        userAgent,
        role: requestedRole,
        approvalStatus: autoApprove ? "approved" : "pending",
        status: "online",
        permissions: {
          canControlPresentation: isHostRole || isOperator || isSpeaker,
          canControlTimer: isHostRole || isOperator,
          canControlBrief: isHostRole || isOperator,
          canBlankDisplay: isHostRole || isOperator,
          canManageDevices: isHostRole,
          canManageRoom: isHostRole,
          canTakeoverControl: isHostRole || isOperator,
        },
        connectedAt: now,
        lastSeenAt: now,
        isHostDevice: isRoomHostUser,
      };

      if (autoApprove) {
        nextState.host.hostDeviceId = deviceId;
        nextState.host.isHostConnected = true;
        nextState.activeControllerDeviceId = deviceId;
      }
      break;
    }

    case "DEVICE_APPROVE": {
      const { targetDeviceId } = command.payload;
      if (nextState.devices[targetDeviceId]) {
        nextState.devices[targetDeviceId].approvalStatus = "approved";
        nextState.devices[targetDeviceId].status = "online";
        nextState.devices[targetDeviceId].lastSeenAt = now;
      }
      break;
    }

    case "DEVICE_REJECT": {
      const { targetDeviceId } = command.payload;
      if (nextState.devices[targetDeviceId]) {
        nextState.devices[targetDeviceId].approvalStatus = "rejected";
        nextState.devices[targetDeviceId].status = "offline";
      }
      break;
    }

    case "DEVICE_REMOVE": {
      const { targetDeviceId } = command.payload;
      if (nextState.devices[targetDeviceId]) {
        delete nextState.devices[targetDeviceId];
        if (nextState.activeControllerDeviceId === targetDeviceId) {
          nextState.activeControllerDeviceId = nextState.host.hostDeviceId;
        }
      }
      break;
    }

    case "MATERIAL_UPDATE":
    case "MATERIAL_ADD": {
      const { material } = command.payload;
      const existingIdx = nextState.materials.findIndex(
        (m) => m.id === material.id || (material.externalUrl && m.externalUrl === material.externalUrl)
      );

      const senderDevice = nextState.devices[command.senderDeviceId];
      const isHostSender =
        senderDevice?.role === "host" ||
        senderDevice?.isHostDevice ||
        nextState.host?.hostDeviceId === command.senderDeviceId;
      const isSpeakerSender = senderDevice?.role === "speaker";

      // Authoritative Server-Side Live Material Protection:
      // If the presentation is currently live and using this material,
      // reject updating the material to prevent live mutation/desynchronization.
      const isTargetLive =
        (nextState.presentation.isPresenting || nextState.presentation.status === "live") &&
        (nextState.presentation.materialId === material.id ||
          (existingIdx >= 0 && nextState.presentation.materialId === nextState.materials[existingIdx].id));

      if (isTargetLive && existingIdx >= 0) {
        throw new Error("MATERIAL_LIVE_UPDATE_BLOCKED: Active presentation material cannot be modified while presenting");
      }

      const existingMaterial = existingIdx >= 0 ? nextState.materials[existingIdx] : null;

      // Authoritative ownership resolution:
      // If material already has an established owner, preserve it unless modified by host
      const ownerDeviceId = existingMaterial?.ownerDeviceId || (isHostSender ? (nextState.host?.hostDeviceId || command.senderDeviceId) : command.senderDeviceId);
      const ownerRole = existingMaterial?.ownerRole || (isHostSender ? "host" : isSpeakerSender ? "speaker" : "operator");
      const ownerName = existingMaterial?.ownerName || (senderDevice?.name || (isHostSender ? "Host" : isSpeakerSender ? "Speaker" : "Operator"));
      const ownerUserId = existingMaterial?.ownerUserId || (isHostSender ? nextState.host?.hostUserId : undefined);

      const enrichedMaterial: Material = {
        ...material,
        ownerDeviceId,
        ownerRole,
        ownerName,
        ownerUserId,
      };

      if (existingIdx >= 0) {
        nextState.materials[existingIdx] = enrichedMaterial;
      } else {
        nextState.materials.push(enrichedMaterial);
      }
      break;
    }

    case "MATERIAL_REMOVE": {
      const { materialId } = command.payload;
      const targetMaterial = nextState.materials.find((m) => m.id === materialId);
      const senderDevice = nextState.devices[command.senderDeviceId];
      const isHostSender =
        senderDevice?.role === "host" ||
        senderDevice?.isHostDevice ||
        nextState.host?.hostDeviceId === command.senderDeviceId;

      // Non-host participants can only delete materials they own
      if (targetMaterial && !isHostSender) {
        if (targetMaterial.ownerRole === "host" || (!targetMaterial.ownerDeviceId && targetMaterial.ownerUserId) || targetMaterial.ownerDeviceId === nextState.host?.hostDeviceId) {
          throw new Error("UNAUTHORIZED_MATERIAL_REMOVE: Cannot delete Host-owned material");
        }
        if (targetMaterial.ownerDeviceId && targetMaterial.ownerDeviceId !== command.senderDeviceId) {
          throw new Error("UNAUTHORIZED_MATERIAL_REMOVE: Cannot delete material owned by another participant");
        }
      }

      nextState.materials = nextState.materials.filter((m) => m.id !== materialId);
      if (nextState.presentation.materialId === materialId || (nextState.liveSource?.type === "material" && nextState.liveSource.id === materialId)) {
        nextState.liveSource = null;
        nextState.presentation.isPresenting = false;
        nextState.presentation.status = "ended";
        nextState.presentation.materialId = null;
        nextState.presentation.currentSlide = 1;
        nextState.presentation.totalSlides = 0;
        nextState.presentation.totalPages = 0;
        nextState.presentation.currentSlideMetadata = null;
        nextState.presentation.nextSlideMetadata = null;
        nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
        nextState.presentation.updatedAt = now;
      }
      break;
    }

    case "PRESENTATION_START": {
      const { materialId, startPage = 1 } = command.payload;
      const material = nextState.materials.find((m) => m.id === materialId);
      const totalSlides = Math.max(material?.totalPages || 1, material?.slides?.length || 1, startPage);
      ensureMaterialSlides(material, totalSlides);

      const isVideoMaterial = material?.type === "video" || material?.mediaType === "video";
      const senderDevice = nextState.devices[command.senderDeviceId];
      const isHostOrOperator =
        senderDevice?.role === "host" ||
        senderDevice?.role === "operator" ||
        senderDevice?.role === "control" ||
        senderDevice?.isHostDevice ||
        nextState.host?.hostDeviceId === command.senderDeviceId;

      // Host, Operator, and Control starting presentation sets liveSource authoritatively
      if (isHostOrOperator && material) {
        nextState.liveSource = {
          type: "material",
          id: material.id,
          ownerDeviceId: material.ownerDeviceId,
          ownerName: material.ownerName,
          ownerRole: material.ownerRole,
          title: material.name,
          takenLiveAt: now,
        };
      }

      // If this was initiated by a Speaker:
      // 1. Starting material presentation stops/supersedes active screen share for this speaker
      if (!isHostOrOperator) {
        if (nextState.screenShareSources?.[command.senderDeviceId]) {
          delete nextState.screenShareSources[command.senderDeviceId];
        }
        // 2. If this Speaker was currently LIVE on stage via Screen Share, switch live to this material
        if (nextState.liveSource?.type === "screen_share" && nextState.liveSource.id === command.senderDeviceId && material) {
          nextState.liveSource = {
            type: "material",
            id: material.id,
            ownerDeviceId: material.ownerDeviceId,
            ownerName: material.ownerName,
            ownerRole: material.ownerRole,
            title: material.name,
            takenLiveAt: now,
          };
        }
      }

      const isLiveNow = Boolean(
        isHostOrOperator ||
        (nextState.liveSource?.type === "material" && nextState.liveSource.id === materialId)
      );

      nextState.presentation = {
        isPresenting: isLiveNow,
        status: isLiveNow ? "live" : "ready",
        materialId,
        currentSlide: startPage,
        totalSlides,
        totalPages: totalSlides,
        revision: (nextState.presentation.revision || 0) + 1,
        currentSlideMetadata: material?.slides[startPage - 1] || { index: startPage, title: `Slide ${startPage}` },
        nextSlideMetadata: material?.slides[startPage] || (startPage < totalSlides ? { index: startPage + 1, title: `Slide ${startPage + 1}` } : null),
        blanked: false,
        blackoutMode: false,
        mediaState: isVideoMaterial
          ? {
              status: "playing",
              currentTime: 0,
              playbackRate: 1.0,
              updatedAt: now,
            }
          : undefined,
        zoom: { scale: 1.0, panX: 0, panY: 0, updatedAt: now },
        startedAt: now,
        updatedAt: now,
      };
      break;
    }

    case "PRESENTATION_EXIT": {
      nextState.liveSource = null;
      nextState.presentation.isPresenting = false;
      nextState.presentation.status = "ended";
      nextState.presentation.materialId = null;
      nextState.presentation.currentSlide = 1;
      nextState.presentation.totalSlides = 0;
      nextState.presentation.totalPages = 0;
      nextState.presentation.currentSlideMetadata = null;
      nextState.presentation.nextSlideMetadata = null;
      nextState.presentation.blanked = false;
      nextState.presentation.zoom = { scale: 1.0, panX: 0, panY: 0, updatedAt: now };
      nextState.presentation.mediaState = undefined;
      nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
      nextState.presentation.updatedAt = now;
      break;
    }

    case "SLIDE_NEXT": {
      if (!nextState.presentation.materialId) break;
      const material = nextState.materials.find((m) => m.id === nextState.presentation.materialId);
      const totalSlides = Math.max(nextState.presentation.totalSlides || 1, material?.totalPages || 1, material?.slides?.length || 1);
      ensureMaterialSlides(material, totalSlides);

      if (nextState.presentation.currentSlide >= totalSlides) {
        break;
      }

      const nextSlideNum = Math.min(nextState.presentation.currentSlide + 1, totalSlides);

      nextState.presentation.currentSlide = nextSlideNum;
      nextState.presentation.totalSlides = totalSlides;
      nextState.presentation.totalPages = totalSlides;
      nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
      nextState.presentation.currentSlideMetadata = material?.slides[nextSlideNum - 1] || { index: nextSlideNum, title: `Slide ${nextSlideNum}` };
      nextState.presentation.nextSlideMetadata = nextSlideNum < totalSlides ? (material?.slides[nextSlideNum] || { index: nextSlideNum + 1, title: `Slide ${nextSlideNum + 1}` }) : null;
      nextState.presentation.zoom = { scale: 1.0, panX: 0, panY: 0, updatedAt: now };
      nextState.presentation.updatedAt = now;
      if (material?.type === "video") {
        nextState.presentation.mediaState = {
          status: "playing",
          currentTime: 0,
          playbackRate: 1.0,
          updatedAt: now,
        };
      }
      break;
    }

    case "SLIDE_PREVIOUS": {
      if (!nextState.presentation.materialId) break;
      if (nextState.presentation.currentSlide <= 1) {
        break;
      }
      const material = nextState.materials.find((m) => m.id === nextState.presentation.materialId);
      const totalSlides = Math.max(nextState.presentation.totalSlides || 1, material?.totalPages || 1, material?.slides?.length || 1);
      ensureMaterialSlides(material, totalSlides);
      const prevSlideNum = Math.max(nextState.presentation.currentSlide - 1, 1);

      nextState.presentation.currentSlide = prevSlideNum;
      nextState.presentation.totalSlides = totalSlides;
      nextState.presentation.totalPages = totalSlides;
      nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
      nextState.presentation.currentSlideMetadata = material?.slides[prevSlideNum - 1] || { index: prevSlideNum, title: `Slide ${prevSlideNum}` };
      nextState.presentation.nextSlideMetadata = material?.slides[prevSlideNum] || (prevSlideNum < totalSlides ? { index: prevSlideNum + 1, title: `Slide ${prevSlideNum + 1}` } : null);
      nextState.presentation.zoom = { scale: 1.0, panX: 0, panY: 0, updatedAt: now };
      nextState.presentation.updatedAt = now;
      if (material?.type === "video") {
        nextState.presentation.mediaState = {
          status: "playing",
          currentTime: 0,
          playbackRate: 1.0,
          updatedAt: now,
        };
      }
      break;
    }

    case "SLIDE_GOTO": {
      if (!nextState.presentation.materialId) break;
      const material = nextState.materials.find((m) => m.id === nextState.presentation.materialId);
      const knownMax = Math.max(material?.totalPages || 1, material?.slides?.length || 1, nextState.presentation.totalSlides || 1);
      const targetSlideNum = Math.max(1, Math.min(command.payload.pageNumber, knownMax));

      ensureMaterialSlides(material, targetSlideNum);

      const totalSlides = Math.max(nextState.presentation.totalSlides || 1, material?.totalPages || targetSlideNum, material?.slides?.length || targetSlideNum);
      nextState.presentation.currentSlide = targetSlideNum;
      nextState.presentation.totalSlides = totalSlides;
      nextState.presentation.totalPages = totalSlides;
      nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
      nextState.presentation.currentSlideMetadata = material?.slides[targetSlideNum - 1] || { index: targetSlideNum, title: `Slide ${targetSlideNum}` };
      nextState.presentation.nextSlideMetadata = material?.slides[targetSlideNum] || (targetSlideNum < totalSlides ? { index: targetSlideNum + 1, title: `Slide ${targetSlideNum + 1}` } : null);
      nextState.presentation.zoom = { scale: 1.0, panX: 0, panY: 0, updatedAt: now };
      nextState.presentation.updatedAt = now;
      if (material?.type === "video") {
        nextState.presentation.mediaState = {
          status: "playing",
          currentTime: 0,
          playbackRate: 1.0,
          updatedAt: now,
        };
      }
      break;
    }

    case "TIMER_SET": {
      const { duration, mode, label } = command.payload;
      nextState.timer = {
        ...nextState.timer,
        duration,
        remaining: duration,
        mode: mode || nextState.timer.mode,
        label: label || nextState.timer.label,
        status: "idle",
        startedAt: null,
        pausedAt: null,
        updatedAt: now,
      };
      break;
    }

    case "TIMER_START": {
      if (nextState.timer.status === "paused" && nextState.timer.pausedAt && nextState.timer.startedAt) {
        // Resuming: shift startedAt by paused duration
        const pauseDuration = now - nextState.timer.pausedAt;
        nextState.timer.startedAt += pauseDuration;
      } else {
        nextState.timer.startedAt = now;
      }
      nextState.timer.status = "running";
      nextState.timer.pausedAt = null;
      nextState.timer.updatedAt = now;
      break;
    }

    case "TIMER_PAUSE": {
      if (nextState.timer.status === "running" && nextState.timer.startedAt) {
        const elapsedSeconds = Math.floor((now - nextState.timer.startedAt) / 1000);
        nextState.timer.remaining = nextState.timer.duration - elapsedSeconds;
      }
      nextState.timer.status = "paused";
      nextState.timer.pausedAt = now;
      nextState.timer.updatedAt = now;
      break;
    }

    case "TIMER_RESET": {
      nextState.timer.status = "idle";
      nextState.timer.startedAt = null;
      nextState.timer.pausedAt = null;
      nextState.timer.remaining = nextState.timer.duration;
      nextState.timer.updatedAt = now;
      break;
    }

    case "BRIEF_UPDATE": {
      const newMessage = {
        id: `brief-${now}`,
        text: command.payload.text,
        urgency: command.payload.urgency,
        createdAt: now,
        authorDeviceId: command.senderDeviceId,
      };
      nextState.brief.activeMessage = newMessage;
      nextState.brief.history.unshift(newMessage);
      nextState.brief.updatedAt = now;
      break;
    }

    case "BRIEF_CLEAR": {
      nextState.brief.activeMessage = null;
      nextState.brief.updatedAt = now;
      break;
    }

    case "DISPLAY_BLANK": {
      const { targetDisplayId, blank } = command.payload;
      if (targetDisplayId && nextState.displays[targetDisplayId]) {
        nextState.displays[targetDisplayId].isBlanked = blank;
      } else {
        nextState.presentation.blanked = blank;
        nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
        nextState.presentation.updatedAt = now;
      }
      break;
    }

    case "DISPLAY_SHOW": {
      const { targetDisplayId } = command.payload;
      if (targetDisplayId && nextState.displays[targetDisplayId]) {
        nextState.displays[targetDisplayId].isBlanked = false;
      } else {
        nextState.presentation.blanked = false;
        nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
        nextState.presentation.updatedAt = now;
      }
      break;
    }

    case "MEDIA_PLAY": {
      const currentTime = command.payload?.currentTime ?? nextState.presentation.mediaState?.currentTime ?? 0;
      nextState.presentation.mediaState = {
        status: "playing",
        currentTime,
        duration: nextState.presentation.mediaState?.duration,
        playbackRate: 1.0,
        seekSequence: nextState.presentation.mediaState?.seekSequence,
        updatedAt: now,
      };
      nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
      nextState.presentation.updatedAt = now;
      break;
    }

    case "MEDIA_PAUSE": {
      const currentTime = command.payload?.currentTime ?? nextState.presentation.mediaState?.currentTime ?? 0;
      nextState.presentation.mediaState = {
        status: "paused",
        currentTime,
        duration: nextState.presentation.mediaState?.duration,
        playbackRate: 1.0,
        seekSequence: nextState.presentation.mediaState?.seekSequence,
        updatedAt: now,
      };
      nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
      nextState.presentation.updatedAt = now;
      break;
    }

    case "MEDIA_SEEK": {
      const { targetTime } = command.payload;
      const isCurrentlyPlaying = nextState.presentation.mediaState?.status === "playing";
      const currentSeq = nextState.presentation.mediaState?.seekSequence || 0;
      nextState.presentation.mediaState = {
        status: isCurrentlyPlaying ? "playing" : "paused",
        currentTime: Math.max(0, targetTime),
        duration: nextState.presentation.mediaState?.duration,
        playbackRate: 1.0,
        seekSequence: currentSeq + 1,
        updatedAt: now,
      };
      nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
      nextState.presentation.updatedAt = now;
      break;
    }

    case "MEDIA_STOP": {
      const currentSeq = nextState.presentation.mediaState?.seekSequence || 0;
      nextState.presentation.mediaState = {
        status: "stopped",
        currentTime: 0,
        duration: nextState.presentation.mediaState?.duration,
        playbackRate: 1.0,
        seekSequence: currentSeq + 1,
        updatedAt: now,
      };
      nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
      nextState.presentation.updatedAt = now;
      break;
    }

    case "MEDIA_DURATION_UPDATE": {
      const { duration } = command.payload;
      if (duration > 0) {
        if (nextState.presentation.mediaState) {
          nextState.presentation.mediaState.duration = duration;
        } else {
          nextState.presentation.mediaState = {
            status: "paused",
            currentTime: 0,
            duration,
            playbackRate: 1.0,
            updatedAt: now,
          };
        }
        nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
        nextState.presentation.updatedAt = now;
      }
      break;
    }

    case "CONTROL_TAKEOVER": {
      nextState.activeControllerDeviceId = command.senderDeviceId;
      break;
    }

    case "ZOOM_SET": {
      const scale = Math.max(1.0, Math.min(Number(command.payload.scale) || 1.0, 5.0));
      const maxPan = 50 * (1 - 1 / scale);
      const panX = scale === 1.0 ? 0 : Math.max(-maxPan, Math.min(Number(command.payload.panX) || 0, maxPan));
      const panY = scale === 1.0 ? 0 : Math.max(-maxPan, Math.min(Number(command.payload.panY) || 0, maxPan));

      nextState.presentation.zoom = {
        scale: Math.round(scale * 100) / 100,
        panX: Math.round(panX * 100) / 100,
        panY: Math.round(panY * 100) / 100,
        region: command.payload.region,
        updatedAt: now,
      };
      nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
      nextState.presentation.updatedAt = now;
      break;
    }

    case "ZOOM_RESET": {
      nextState.presentation.zoom = {
        scale: 1.0,
        panX: 0,
        panY: 0,
        updatedAt: now,
      };
      nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
      nextState.presentation.updatedAt = now;
      break;
    }

    case "SCREEN_SHARE_START": {
      const senderDevice = nextState.devices[command.senderDeviceId];
      if (!nextState.screenShareSources) {
        nextState.screenShareSources = {};
      }
      nextState.screenShareSources[command.senderDeviceId] = {
        deviceId: command.senderDeviceId,
        speakerName: senderDevice?.name || "Speaker",
        status: "active",
        startedAt: now,
        stoppedAt: null,
        updatedAt: now,
      };

      // If this speaker's material was currently LIVE on stage, auto-switch the stage broadcast to their screen share
      if (nextState.liveSource?.type === "material" && nextState.liveSource.ownerDeviceId === command.senderDeviceId) {
        nextState.liveSource = {
          type: "screen_share",
          id: command.senderDeviceId,
          ownerDeviceId: command.senderDeviceId,
          ownerName: senderDevice?.name || "Speaker",
          ownerRole: "speaker",
          title: `${senderDevice?.name || "Speaker"}'s Screen`,
          takenLiveAt: now,
        };
      }
      break;
    }

    case "SCREEN_SHARE_STOP": {
      if (!nextState.screenShareSources) {
        nextState.screenShareSources = {};
      }
      const targetDeviceId = command.payload?.targetDeviceId || command.senderDeviceId;
      const senderDevice = nextState.devices[command.senderDeviceId];
      const isHostSender =
        senderDevice?.role === "host" ||
        senderDevice?.isHostDevice ||
        nextState.host?.hostDeviceId === command.senderDeviceId;

      // Only the owner or host can stop a screen share
      if (!isHostSender && targetDeviceId !== command.senderDeviceId) {
        throw new Error("UNAUTHORIZED_SCREEN_SHARE_STOP: Cannot stop another Speaker's screen share");
      }

      if (nextState.screenShareSources[targetDeviceId]) {
        nextState.screenShareSources[targetDeviceId] = {
          ...nextState.screenShareSources[targetDeviceId],
          status: "stopped",
          stoppedAt: now,
          updatedAt: now,
        };
        // Remove stopped sources to keep state clean
        delete nextState.screenShareSources[targetDeviceId];
      }

      // If the stopped screen share was LIVE, clear live source and end presentation
      if (nextState.liveSource?.type === "screen_share" && nextState.liveSource.id === targetDeviceId) {
        nextState.liveSource = null;
        nextState.presentation.isPresenting = false;
        nextState.presentation.status = "ended";
        nextState.presentation.materialId = null;
        nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
        nextState.presentation.updatedAt = now;
      }
      break;
    }

    case "SOURCE_TAKE_LIVE": {
      const { sourceType, sourceId } = command.payload;

      if (sourceType === "material") {
        const material = nextState.materials.find((m) => m.id === sourceId);
        if (!material) {
          throw new Error("SOURCE_NOT_FOUND: Material does not exist");
        }
        if (material.status === "error" || material.status === "deleted") {
          throw new Error("SOURCE_UNAVAILABLE: Material is unavailable");
        }

        const totalSlides = Math.max(material.totalPages || 1, material.slides?.length || 1, 1);
        ensureMaterialSlides(material, totalSlides);
        const isVideoMaterial = material.type === "video" || material.mediaType === "video";

        nextState.liveSource = {
          type: "material",
          id: material.id,
          ownerDeviceId: material.ownerDeviceId,
          ownerName: material.ownerName,
          ownerRole: material.ownerRole,
          title: material.name,
          takenLiveAt: now,
        };

        nextState.presentation = {
          isPresenting: true,
          status: "live",
          materialId: material.id,
          currentSlide: 1,
          totalSlides,
          totalPages: totalSlides,
          revision: (nextState.presentation.revision || 0) + 1,
          currentSlideMetadata: material.slides[0] || { index: 1, title: "Slide 1" },
          nextSlideMetadata: material.slides[1] || (totalSlides > 1 ? { index: 2, title: "Slide 2" } : null),
          blanked: false,
          blackoutMode: false,
          mediaState: isVideoMaterial
            ? {
                status: "playing",
                currentTime: 0,
                playbackRate: 1.0,
                updatedAt: now,
              }
            : undefined,
          zoom: { scale: 1.0, panX: 0, panY: 0, updatedAt: now },
          startedAt: now,
          updatedAt: now,
        };
      } else if (sourceType === "screen_share") {
        const screenSource = nextState.screenShareSources?.[sourceId];
        if (!screenSource || screenSource.status !== "active") {
          throw new Error("SOURCE_NOT_FOUND: Screen share source does not exist or is inactive");
        }

        nextState.liveSource = {
          type: "screen_share",
          id: sourceId,
          ownerDeviceId: sourceId,
          ownerName: screenSource.speakerName,
          ownerRole: "speaker",
          title: `${screenSource.speakerName}'s Screen`,
          takenLiveAt: now,
        };

        nextState.presentation = {
          isPresenting: true,
          status: "live",
          materialId: null,
          currentSlide: 1,
          totalSlides: 1,
          totalPages: 1,
          revision: (nextState.presentation.revision || 0) + 1,
          currentSlideMetadata: null,
          nextSlideMetadata: null,
          blanked: false,
          blackoutMode: false,
          zoom: { scale: 1.0, panX: 0, panY: 0, updatedAt: now },
          startedAt: now,
          updatedAt: now,
        };
      }
      break;
    }

    case "SOURCE_TAKE_OFFLINE": {
      nextState.liveSource = null;
      nextState.presentation.isPresenting = false;
      nextState.presentation.status = "ended";
      nextState.presentation.materialId = null;
      nextState.presentation.currentSlide = 1;
      nextState.presentation.totalSlides = 0;
      nextState.presentation.totalPages = 0;
      nextState.presentation.currentSlideMetadata = null;
      nextState.presentation.nextSlideMetadata = null;
      nextState.presentation.blanked = false;
      nextState.presentation.zoom = { scale: 1.0, panX: 0, panY: 0, updatedAt: now };
      nextState.presentation.revision = (nextState.presentation.revision || 0) + 1;
      nextState.presentation.updatedAt = now;
      break;
    }
  }

  return nextState;
}
