// Minimal Node 'ws' module declarations to satisfy TypeScript when @types/ws is not installed
// This keeps Docker production builds lightweight while allowing compilation in production images.

declare module 'ws' {
  type WSRawData = any;

  interface WebSocketHeaders {
    [key: string]: string;
  }

  interface WebSocketOptions {
    headers?: WebSocketHeaders;
    perMessageDeflate?: boolean | object;
    handshakeTimeout?: number;
    maxPayload?: number;
  }

  export default class WebSocket {
    static readonly CONNECTING: number;
    static readonly OPEN: number;
    static readonly CLOSING: number;
    static readonly CLOSED: number;

    static readonly WebSocket: typeof WebSocket;

    readyState: number;

    constructor(address: string, protocols?: string | string[], options?: WebSocketOptions);

    on(event: 'open', listener: () => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: WSRawData, isBinary: boolean) => void): this;

    once(event: 'open', listener: () => void): this;
    once(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    once(event: 'error', listener: (err: Error) => void): this;
    once(event: 'message', listener: (data: WSRawData, isBinary: boolean) => void): this;

    send(data: string | ArrayBufferLike | ArrayBufferView, cb?: (err?: Error) => void): void;
    close(code?: number, reason?: string): void;
    terminate(): void;
  }

  namespace WebSocket {
    export type RawData = WSRawData;
  }
}
