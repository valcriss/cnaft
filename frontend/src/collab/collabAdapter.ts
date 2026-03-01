import type { Operation } from "./operations";

export type OperationListener = (operation: Operation) => void;

export interface CollabAdapter {
  readonly name: string;
  send: (operation: Operation) => void;
  subscribe: (listener: OperationListener) => () => void;
  dispose?: () => void;
}

export class LocalLoopbackAdapter implements CollabAdapter {
  readonly name = "local-loopback";
  private listeners = new Set<OperationListener>();

  send(operation: Operation) {
    queueMicrotask(() => {
      for (const listener of this.listeners) {
        listener(operation);
      }
    });
  }

  subscribe(listener: OperationListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
