import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "../config.js";

type TokenPayload = JwtPayload & {
  sub: string;
  email: string;
  provider: "local" | "oidc";
};

export function signAccessToken(payload: { userId: string; email: string; provider: "local" | "oidc" }) {
  return jwt.sign(
    {
      sub: payload.userId,
      email: payload.email,
      provider: payload.provider,
      type: "access",
    },
    config.JWT_ACCESS_SECRET,
    { expiresIn: config.JWT_ACCESS_TTL_SEC },
  );
}

export function signRefreshToken(payload: { userId: string; email: string; provider: "local" | "oidc" }) {
  return jwt.sign(
    {
      sub: payload.userId,
      email: payload.email,
      provider: payload.provider,
      type: "refresh",
    },
    config.JWT_REFRESH_SECRET,
    { expiresIn: config.JWT_REFRESH_TTL_SEC },
  );
}

function parseTokenPayload(raw: string | JwtPayload): TokenPayload | null {
  if (!raw || typeof raw === "string") return null;
  if (typeof raw.sub !== "string") return null;
  if (typeof raw.email !== "string") return null;
  if (raw.provider !== "local" && raw.provider !== "oidc") return null;
  return raw as TokenPayload;
}

export function verifyAccessToken(token: string) {
  const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET);
  const payload = parseTokenPayload(decoded);
  if (!payload || payload.type !== "access") {
    return null;
  }
  return payload;
}

export function verifyRefreshToken(token: string) {
  const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET);
  const payload = parseTokenPayload(decoded);
  if (!payload || payload.type !== "refresh") {
    return null;
  }
  return payload;
}
