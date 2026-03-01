import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  try {
    const payload = verifyAccessToken(token);
    if (!payload) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    req.auth = {
      userId: payload.sub,
      email: payload.email,
      provider: payload.provider,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
