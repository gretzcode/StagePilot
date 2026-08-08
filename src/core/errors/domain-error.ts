export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Authentication required") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "Insufficient permissions for operation") {
    super(message, "FORBIDDEN", 403);
    this.name = "ForbiddenError";
  }
}

export class RoomNotFoundError extends DomainError {
  constructor(code: string) {
    super(`Room code '${code}' not found`, "ROOM_NOT_FOUND", 404);
    this.name = "RoomNotFoundError";
  }
}

export class InvalidCommandError extends DomainError {
  constructor(message: string) {
    super(message, "INVALID_COMMAND", 422);
    this.name = "InvalidCommandError";
  }
}

export class DeviceRejectedError extends DomainError {
  constructor(message = "Device join request was rejected or revoked") {
    super(message, "DEVICE_REJECTED", 403);
    this.name = "DeviceRejectedError";
  }
}
