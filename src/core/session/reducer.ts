import { StageCommand, StageSessionState } from "../types";
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

      nextState.devices[deviceId] = {
        id: deviceId,
        name: deviceName,
        userAgent,
        role: requestedRole,
        approvalStatus: autoApprove ? "approved" : "pending",
        status: "online",
        permissions: {
          canControlPresentation: requestedRole === "host" || requestedRole === "control",
          canControlTimer: requestedRole === "host" || requestedRole === "control",
          canControlBrief: requestedRole === "host" || requestedRole === "control",
          canBlankDisplay: requestedRole === "host" || requestedRole === "control",
          canManageDevices: requestedRole === "host",
          canManageRoom: requestedRole === "host",
          canTakeoverControl: requestedRole === "host" || requestedRole === "control",
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

      if (existingIdx >= 0) {
        nextState.materials[existingIdx] = material;
      } else {
        nextState.materials.push(material);
      }
      break;
    }

    case "MATERIAL_REMOVE": {
      const { materialId } = command.payload;
      nextState.materials = nextState.materials.filter((m) => m.id !== materialId);
      if (nextState.presentation.materialId === materialId) {
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

      nextState.presentation = {
        isPresenting: true,
        status: "live",
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

    case "SLIDE_NEXT": {
      if (!nextState.presentation.isPresenting) break;
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
      if (!nextState.presentation.isPresenting) break;
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
      if (!nextState.presentation.isPresenting) break;
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
      const scale = Math.max(1.0, Math.min(Number(command.payload.scale) || 1.0, 3.0));
      const panX = scale === 1.0 ? 0 : Math.max(-100, Math.min(Number(command.payload.panX) || 0, 100));
      const panY = scale === 1.0 ? 0 : Math.max(-100, Math.min(Number(command.payload.panY) || 0, 100));

      nextState.presentation.zoom = {
        scale,
        panX,
        panY,
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
  }

  return nextState;
}
