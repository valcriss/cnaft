import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import authRouter from "./routes/auth.js";
import documentsRouter from "./routes/documents.js";
import { requireAuth } from "./middleware/auth.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN === "*" ? true : config.CORS_ORIGIN }));
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "backend", now: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/documents", requireAuth, documentsRouter);

  if (config.FRONTEND_DIST_DIR) {
    const distDir = path.resolve(config.FRONTEND_DIST_DIR);
    const indexPath = path.join(distDir, "index.html");
    if (fs.existsSync(indexPath)) {
      app.use(express.static(distDir));
      app.use((req, res, next) => {
        if (req.method !== "GET") {
          next();
          return;
        }
        if (req.path.startsWith("/api/") || req.path === "/api" || req.path === "/health" || req.path.startsWith("/ws")) {
          next();
          return;
        }
        res.sendFile(indexPath);
      });
    }
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
