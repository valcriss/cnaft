import type { Operation } from "./operations";
import type { CollabAdapter, OperationListener } from "./collabAdapter";

export class CanvasWebSocketAdapter implements CollabAdapter {
  readonly name = "websocket";

  private readonly listeners = new Set<OperationListener>();
  private readonly clientId: string;
  private readonly documentId: string;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly reconnectDelayMs: number;
  private socket: WebSocket | null = null;
  private disposed = false;
  private reconnectTimer: number | null = null;
  private queue: string[] = [];

  constructor(params: {
    baseUrl: string;
    clientId: string;
    documentId: string;
    token: string;
    reconnectDelayMs?: number;
  }) {
    this.clientId = params.clientId;
    this.documentId = params.documentId;
    this.token = params.token;
    this.baseUrl = params.baseUrl.replace(/\/$/, "");
    this.reconnectDelayMs = Math.max(250, params.reconnectDelayMs ?? 1000);
    this.connect();
  }

  subscribe(listener: OperationListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  send(operation: Operation) {
    const message = JSON.stringify(operation);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(message);
      return;
    }
    this.queue.push(message);
  }

  dispose() {
    this.disposed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.queue = [];
    this.listeners.clear();
  }

  private buildUrl() {
    const url = new URL(`${this.baseUrl}/ws`);
    url.searchParams.set("documentId", this.documentId);
    url.searchParams.set("token", this.token);
    return url.toString();
  }

  private connect() {
    if (this.disposed) return;
    this.socket = new WebSocket(this.buildUrl());

    this.socket.onopen = () => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      for (const message of this.queue) {
        this.socket.send(message);
      }
      this.queue = [];
    };

    this.socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as Operation;
        if (!parsed || parsed.clientId === this.clientId) return;
        for (const listener of this.listeners) {
          listener(parsed);
        }
      } catch {
        // ignore malformed messages
      }
    };

    this.socket.onclose = () => {
      this.socket = null;
      if (this.disposed) return;
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, this.reconnectDelayMs);
    };

    this.socket.onerror = () => {
      // rely on onclose for reconnect
    };
  }
}
