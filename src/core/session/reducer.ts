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
        nextState.devices[targetDeviceId].approvalStatus = "revoked";
        nextState.devices[targetDeviceId].status = "offline";
        if (nextState.activeControllerDeviceId === targetDeviceId) {
          nextState.activeControllerDeviceId = nextState.host.hostDeviceId;
        }
      }
      break;
    }

    case "MATERIAL_ADD": {
      const { material } = command.payload;
      const existingIdx = nextState.materials.findIndex((m) => m.id === material.id);
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
        nextState.presentation.materialId = null;
        nextState.presentation.currentSlide = null;
        nextState.presentation.nextSlide = null;
        nextState.presentation.currentPage = 1;
        nextState.presentation.totalPages = 0;
      }
      break;
    }

    case "PRESENTATION_START": {
      const { materialId, startPage = 1 } = command.payload;
      const material = nextState.materials.find((m) => m.id === materialId);
      const totalPages = Math.max(material?.totalPages || 1, material?.slides.length || 1, startPage);
      ensureMaterialSlides(material, totalPages);

      nextState.presentation = {
        isPresenting: true,
        materialId,
        currentPage: startPage,
        totalPages,
        currentSlide: material?.slides[startPage - 1] || { index: startPage, title: `Slide ${startPage}` },
        nextSlide: material?.slides[startPage] || (startPage < totalPages ? { index: startPage + 1, title: `Slide ${startPage + 1}` } : null),
        blanked: false,
        blackoutMode: false,
        startedAt: now,
        updatedAt: now,
      };
      break;
    }

    case "PRESENTATION_EXIT": {
      nextState.presentation.isPresenting = false;
      nextState.presentation.materialId = null;
      nextState.presentation.currentSlide = null;
      nextState.presentation.nextSlide = null;
      nextState.presentation.currentPage = 1;
      nextState.presentation.totalPages = 0;
      nextState.presentation.blanked = false;
      nextState.presentation.updatedAt = now;
      break;
    }

    case "SLIDE_NEXT": {
      if (!nextState.presentation.isPresenting) break;
      const material = nextState.materials.find((m) => m.id === nextState.presentation.materialId);
      const maxPages = Math.max(material?.totalPages || 1, nextState.presentation.totalPages || 1, nextState.presentation.currentPage + 1);
      ensureMaterialSlides(material, maxPages);

      const currentPage = Math.min(nextState.presentation.currentPage + 1, maxPages);

      nextState.presentation.currentPage = currentPage;
      nextState.presentation.totalPages = maxPages;
      nextState.presentation.currentSlide = material?.slides[currentPage - 1] || { index: currentPage, title: `Slide ${currentPage}` };
      nextState.presentation.nextSlide = currentPage < maxPages ? (material?.slides[currentPage] || { index: currentPage + 1, title: `Slide ${currentPage + 1}` }) : null;
      nextState.presentation.updatedAt = now;
      break;
    }

    case "SLIDE_PREVIOUS": {
      if (!nextState.presentation.isPresenting) break;
      const material = nextState.materials.find((m) => m.id === nextState.presentation.materialId);
      const totalPages = Math.max(nextState.presentation.totalPages || 1, material?.totalPages || 1);
      ensureMaterialSlides(material, totalPages);
      const currentPage = Math.max(nextState.presentation.currentPage - 1, 1);

      nextState.presentation.currentPage = currentPage;
      nextState.presentation.totalPages = totalPages;
      nextState.presentation.currentSlide = material?.slides[currentPage - 1] || { index: currentPage, title: `Slide ${currentPage}` };
      nextState.presentation.nextSlide = material?.slides[currentPage] || (currentPage < totalPages ? { index: currentPage + 1, title: `Slide ${currentPage + 1}` } : null);
      nextState.presentation.updatedAt = now;
      break;
    }

    case "SLIDE_GOTO": {
      if (!nextState.presentation.isPresenting) break;
      const material = nextState.materials.find((m) => m.id === nextState.presentation.materialId);
      const knownMax = material?.totalPages || 1;
      const targetPage = Math.max(1, Math.min(command.payload.pageNumber, knownMax));

      ensureMaterialSlides(material, targetPage);

      const totalPages = Math.max(nextState.presentation.totalPages || 1, material?.totalPages || targetPage);
      nextState.presentation.currentPage = targetPage;
      nextState.presentation.totalPages = totalPages;
      nextState.presentation.currentSlide = material?.slides[targetPage - 1] || { index: targetPage, title: `Slide ${targetPage}` };
      nextState.presentation.nextSlide = material?.slides[targetPage] || (targetPage < totalPages ? { index: targetPage + 1, title: `Slide ${targetPage + 1}` } : null);
      nextState.presentation.updatedAt = now;
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

    case "DISPLAY_BLANK": {
      const { targetDisplayId, blank } = command.payload;
      if (targetDisplayId && nextState.displays[targetDisplayId]) {
        nextState.displays[targetDisplayId].isBlanked = blank;
      } else {
        nextState.presentation.blanked = blank;
      }
      break;
    }

    case "DISPLAY_SHOW": {
      const { targetDisplayId } = command.payload;
      if (targetDisplayId && nextState.displays[targetDisplayId]) {
        nextState.displays[targetDisplayId].isBlanked = false;
      } else {
        nextState.presentation.blanked = false;
      }
      break;
    }

    case "CONTROL_TAKEOVER": {
      nextState.activeControllerDeviceId = command.senderDeviceId;
      break;
    }
  }

  return nextState;
}
