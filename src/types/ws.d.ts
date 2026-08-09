declare module "ws" {
  import { EventEmitter } from "events";
  import { IncomingMessage } from "http";

  export class WebSocket extends EventEmitter {
    static OPEN: number;
    readyState: number;
    send(data: string | ArrayBuffer): void;
    close(): void;
    on(event: "message", listener: (data: Buffer | string) => void): this;
    on(event: "close", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: { noServer?: boolean });
    handleUpgrade(
      request: IncomingMessage,
      socket: unknown,
      head: unknown,
      callback: (ws: WebSocket) => void
    ): void;
    on(event: "connection", listener: (ws: WebSocket, req: IncomingMessage) => void): this;
  }
}
