import type { Operation } from "./operations";
import type { CollabAdapter, OperationListener } from "./collabAdapter";

type MockMessage = {
  room: string;
  operation: Operation;
};

export class MockWebSocketAdapter implements CollabAdapter {
  readonly name = "mock-websocket";
  private readonly channel: BroadcastChannel | null;
  private readonly listeners = new Set<OperationListener>();
  private readonly onMessageBound: (event: MessageEvent<MockMessage>) => void;
  private readonly room: string;
  private readonly clientId: string;
  private readonly baseLatencyMs: number;
  private readonly jitterMs: number;
  private readonly nextDeliveryByClient = new Map<string, number>();

  constructor(params: { room: string; clientId: string; baseLatencyMs?: number; jitterMs?: number }) {
    this.room = params.room;
    this.clientId = params.clientId;
    this.baseLatencyMs = Math.max(0, params.baseLatencyMs ?? 80);
    this.jitterMs = Math.max(0, params.jitterMs ?? 50);

    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      this.channel = new BroadcastChannel(`canvas-framework:${this.room}`);
      this.onMessageBound = (event) => this.onMessage(event);
      this.channel.addEventListener("message", this.onMessageBound);
    } else {
      this.channel = null;
      this.onMessageBound = () => {};
    }
  }

  send(operation: Operation) {
    if (!this.channel) return;
    const payload: MockMessage = {
      room: this.room,
      operation,
    };
    this.channel.postMessage(payload);
  }

  subscribe(listener: OperationListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose() {
    if (!this.channel) return;
    this.channel.removeEventListener("message", this.onMessageBound);
    this.channel.close();
  }

  private onMessage(event: MessageEvent<MockMessage>) {
    const message = event.data;
    if (!message || message.room !== this.room) return;
    if (message.operation.clientId === this.clientId) return;

    const now = Date.now();
    const randomDelay = this.baseLatencyMs + Math.round(Math.random() * this.jitterMs);
    const previous = this.nextDeliveryByClient.get(message.operation.clientId) ?? now;
    const deliverAt = Math.max(now + randomDelay, previous + 1);
    this.nextDeliveryByClient.set(message.operation.clientId, deliverAt);
    const timeout = Math.max(0, deliverAt - now);

    window.setTimeout(() => {
      for (const listener of this.listeners) {
        listener(message.operation);
      }
    }, timeout);
  }
}
