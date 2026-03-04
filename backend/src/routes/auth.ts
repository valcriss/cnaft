import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt.js";
import { hashPassword, verifyPassword } from "../lib/security.js";
import { requireAuth } from "../middleware/auth.js";
import { buildAuthorizeUrl, exchangeAuthorizationCode, loadOidcUserProfile } from "../lib/oidc.js";

const router = Router();

const registerSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(80),
});

const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
const avatarUpdateSchema = z.object({
  avatarDataUrl: z.string().max(2_000_000).nullable(),
});
const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
});
const oidcAuthorizeSchema = z.object({
  redirectUri: z.url(),
  state: z.string().min(8).max(512),
  codeChallenge: z.string().min(8).max(256).optional(),
});
const oidcExchangeSchema = z.object({
  code: z.string().min(1),
  redirectUri: z.url(),
  codeVerifier: z.string().min(8).max(256).optional(),
});

function ensureLocalAuthEnabled() {
  return config.AUTH_PROVIDER === "local";
}

router.post("/register", async (req, res) => {
  if (!ensureLocalAuthEnabled()) {
    res.status(403).json({ error: "Local authentication disabled" });
    return;
  }
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { email, password, displayName } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, displayName, passwordHash },
    select: { id: true, email: true, displayName: true, avatarUrl: true },
  });

  const accessToken = signAccessToken({ userId: user.id, email: user.email, provider: "local" });
  const refreshToken = signRefreshToken({ userId: user.id, email: user.email, provider: "local" });
  res.status(201).json({
    user,
    tokens: {
      accessToken,
      refreshToken,
    },
  });
});

router.get("/providers", (_req, res) => {
  res.json({
    provider: config.AUTH_PROVIDER,
    local: config.AUTH_PROVIDER === "local",
    oidc: config.AUTH_PROVIDER === "oidc",
    oidcTransparentLogin: config.OIDC_TRANSPARENT_LOGIN,
  });
});

router.post("/login", async (req, res) => {
  if (!ensureLocalAuthEnabled()) {
    res.status(403).json({ error: "Local authentication disabled" });
    return;
  }
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, displayName: true, avatarUrl: true, passwordHash: true },
  });
  if (!user?.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const accessToken = signAccessToken({ userId: user.id, email: user.email, provider: "local" });
  const refreshToken = signRefreshToken({ userId: user.id, email: user.email, provider: "local" });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
    tokens: {
      accessToken,
      refreshToken,
    },
  });
});

router.post("/refresh", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const payload = verifyRefreshToken(parsed.data.refreshToken);
    if (!payload) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true },
    });
    if (!user) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }
    const accessToken = signAccessToken({ userId: user.id, email: user.email, provider: payload.provider });
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.post("/oidc/authorize-url", async (req, res) => {
  if (config.AUTH_PROVIDER !== "oidc") {
    res.status(403).json({ error: "OIDC authentication disabled" });
    return;
  }
  const parsed = oidcAuthorizeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const authorizeUrl = await buildAuthorizeUrl(parsed.data);
    res.json({ authorizeUrl });
  } catch (error) {
    res.status(500).json({ error: "OIDC discovery failed", details: String(error) });
  }
});

router.post("/oidc/exchange", async (req, res) => {
  if (config.AUTH_PROVIDER !== "oidc") {
    res.status(403).json({ error: "OIDC authentication disabled" });
    return;
  }
  const parsed = oidcExchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const tokenResponse = await exchangeAuthorizationCode(parsed.data);
    const profile = await loadOidcUserProfile(tokenResponse);
    const emailRaw = profile.email;
    const subRaw = profile.sub;
    const nameRaw = profile.name ?? profile.preferred_username ?? profile.email;
    const avatarRaw = profile.picture;

    const email =
      typeof emailRaw === "string" && emailRaw.length > 0
        ? emailRaw.toLowerCase()
        : typeof subRaw === "string" && subRaw.length > 0
          ? `${subRaw}@oidc.local`
          : null;

    if (!email) {
      res.status(400).json({ error: "OIDC profile missing email/sub" });
      return;
    }

    const displayName = typeof nameRaw === "string" && nameRaw.trim().length > 0 ? nameRaw.trim() : "Utilisateur";
    const avatarUrl = typeof avatarRaw === "string" ? avatarRaw : null;

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        displayName,
        avatarUrl,
      },
      create: {
        email,
        displayName,
        avatarUrl,
        passwordHash: null,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    const accessToken = signAccessToken({ userId: user.id, email: user.email, provider: "oidc" });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email, provider: "oidc" });
    res.json({
      user,
      tokens: {
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    res.status(401).json({ error: "OIDC exchange failed", details: String(error) });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: { id: true, email: true, displayName: true, avatarUrl: true, createdAt: true, updatedAt: true },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user });
});

router.patch("/me/avatar", requireAuth, async (req, res) => {
  const parsed = avatarUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { avatarDataUrl } = parsed.data;
  if (avatarDataUrl && !avatarDataUrl.startsWith("data:image/")) {
    res.status(400).json({ error: "Invalid avatar format" });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.auth!.userId },
    data: {
      avatarUrl: avatarDataUrl,
    },
    select: { id: true, email: true, displayName: true, avatarUrl: true },
  });

  res.json({ user });
});

router.patch("/me", requireAuth, async (req, res) => {
  if (req.auth?.provider === "oidc") {
    res.status(403).json({ error: "Profile update disabled with OIDC" });
    return;
  }

  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.auth!.userId },
    data: {
      displayName: parsed.data.displayName,
    },
    select: { id: true, email: true, displayName: true, avatarUrl: true },
  });

  res.json({ user });
});

export default router;
