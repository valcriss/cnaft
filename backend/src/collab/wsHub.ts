import type { IncomingMessage } from "node:http";
import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { verifyAccessToken } from "../lib/jwt.js";
import { canRead, getDocumentRole } from "../services/documentAccess.js";

type ClientContext = {
  socket: WebSocket;
  documentId: string;
  userId: string;
};

const MAX_MESSAGE_SIZE = 1_000_000;

function parseConnectionParams(request: IncomingMessage) {
  if (!request.url) return null;
  const url = new URL(request.url, "http://localhost");
  if (url.pathname !== "/ws") return null;
  const token = url.searchParams.get("token") || "";
  const documentId = url.searchParams.get("documentId") || "";
  if (!token || !documentId) return null;
  return { token, documentId };
}

function isOperationLike(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const op = value as Record<string, unknown>;
  return typeof op.opId === "string" && typeof op.clientId === "string" && typeof op.type === "string";
}

export function attachCollabWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_SIZE,
  });

  const rooms = new Map<string, Set<ClientContext>>();
  const socketToContext = new Map<WebSocket, ClientContext>();

  function joinRoom(context: ClientContext) {
    const set = rooms.get(context.documentId) ?? new Set<ClientContext>();
    set.add(context);
    rooms.set(context.documentId, set);
    socketToContext.set(context.socket, context);
  }

  function leaveRoom(socket: WebSocket) {
    const context = socketToContext.get(socket);
    if (!context) return;
    const set = rooms.get(context.documentId);
    if (set) {
      set.delete(context);
      if (set.size === 0) {
        rooms.delete(context.documentId);
      }
    }
    socketToContext.delete(socket);
  }

  function broadcast(context: ClientContext, raw: string) {
    const set = rooms.get(context.documentId);
    if (!set) return;
    for (const client of set) {
      if (client.socket === context.socket) continue;
      if (client.socket.readyState !== WebSocket.OPEN) continue;
      client.socket.send(raw);
    }
  }

  wss.on("connection", (socket) => {
    socket.on("message", (raw, isBinary) => {
      if (isBinary) return;
      const context = socketToContext.get(socket);
      if (!context) return;
      const text = typeof raw === "string" ? raw : raw.toString("utf8");
      if (text.length > MAX_MESSAGE_SIZE) return;
      try {
        const parsed = JSON.parse(text) as unknown;
        if (!isOperationLike(parsed)) return;
        broadcast(context, JSON.stringify(parsed));
      } catch {
        // ignore malformed message
      }
    });

    socket.on("close", () => {
      leaveRoom(socket);
    });

    socket.on("error", () => {
      leaveRoom(socket);
    });
  });

  server.on("upgrade", async (request, socket, head) => {
    try {
      const params = parseConnectionParams(request);
      if (!params) {
        socket.destroy();
        return;
      }
      const payload = verifyAccessToken(params.token);
      if (!payload) {
        socket.destroy();
        return;
      }
      const role = await getDocumentRole(params.documentId, payload.sub);
      if (!canRead(role)) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        const context: ClientContext = {
          socket: ws,
          documentId: params.documentId,
          userId: payload.sub,
        };
        joinRoom(context);
        wss.emit("connection", ws, request);
      });
    } catch {
      socket.destroy();
    }
  });
}
