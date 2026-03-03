import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { canRead, canWrite, getDocumentRole } from "../services/documentAccess.js";

const router = Router();

type JsonPrimitive = string | number | boolean;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return false;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }
  return false;
}

const jsonValueSchema = z.custom<JsonValue>((value) => isJsonValue(value), {
  error: "Invalid JSON value",
});

type ListedDocument = {
  id: string;
  title: string;
  thumbnailJson: unknown;
  updatedAt: Date;
  ownerId: string;
};

type Membership = {
  documentId: string;
  role: string;
};

const createDocumentSchema = z.object({
  title: z.string().min(1).max(120).default("Nouveau document"),
  contentJson: jsonValueSchema.default({}),
  thumbnailJson: jsonValueSchema.optional(),
});

const updateDocumentSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  contentJson: jsonValueSchema.optional(),
  thumbnailJson: jsonValueSchema.optional(),
});

const shareSchema = z.object({
  role: z.enum(["viewer", "editor"]).default("viewer"),
  expiresAt: z.string().datetime().optional(),
});

router.get("/", async (req, res) => {
  const userId = req.auth!.userId;
  const owned = (await prisma.document.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      thumbnailJson: true,
      updatedAt: true,
      ownerId: true,
    },
  })) as ListedDocument[];

  const memberships = (await prisma.documentMember.findMany({
    where: { userId },
    select: { documentId: true, role: true },
  })) as Membership[];
  const memberIds = memberships.map((m) => m.documentId);
  const shared: ListedDocument[] = memberIds.length
    ? await prisma.document.findMany({
        where: { id: { in: memberIds } },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          thumbnailJson: true,
          updatedAt: true,
          ownerId: true,
        },
      })
    : [];
  const roleByDocument = new Map(memberships.map((m) => [m.documentId, m.role] as const));
  const documents = [
    ...owned.map((d) => ({ ...d, role: "owner" as const })),
    ...shared.map((d) => ({ ...d, role: (roleByDocument.get(d.id) ?? "viewer") as "viewer" | "editor" })),
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  res.json({ documents });
});

router.post("/", async (req, res) => {
  const parsed = createDocumentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const payload = parsed.data;
  const createData = {
    owner: { connect: { id: req.auth!.userId } },
    title: payload.title,
    contentJson: payload.contentJson,
    ...(typeof payload.thumbnailJson !== "undefined"
      ? {
          thumbnailJson: payload.thumbnailJson,
        }
      : {}),
  };
  const created = await prisma.document.create({
    data: createData,
  });
  res.status(201).json({ document: created });
});

router.get("/:id", async (req, res) => {
  const role = await getDocumentRole(req.params.id, req.auth!.userId);
  if (!canRead(role)) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const document = await prisma.document.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      ownerId: true,
      title: true,
      contentJson: true,
      thumbnailJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json({ document, role });
});

router.patch("/:id", async (req, res) => {
  const role = await getDocumentRole(req.params.id, req.auth!.userId);
  if (!canWrite(role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = updateDocumentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const payload = parsed.data;
  if (!Object.keys(payload).length) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  const updateData = {
    ...(typeof payload.title !== "undefined" ? { title: payload.title } : {}),
    ...(typeof payload.contentJson !== "undefined" ? { contentJson: payload.contentJson } : {}),
    ...(typeof payload.thumbnailJson !== "undefined"
      ? { thumbnailJson: payload.thumbnailJson }
      : {}),
  };
  const updated = await prisma.document.update({
    where: { id: req.params.id },
    data: updateData,
  });
  res.json({ document: updated });
});

router.delete("/:id", async (req, res) => {
  const role = await getDocumentRole(req.params.id, req.auth!.userId);
  if (role !== "owner") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await prisma.document.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

router.post("/:id/share-links", async (req, res) => {
  const role = await getDocumentRole(req.params.id, req.auth!.userId);
  if (role !== "owner") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = shareSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const token = crypto.randomBytes(24).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;

  await prisma.documentShareLink.create({
    data: {
      documentId: req.params.id,
      tokenHash,
      role: parsed.data.role,
      expiresAt,
      createdById: req.auth!.userId,
    },
  });
  res.status(201).json({
    shareLink: {
      token,
      role: parsed.data.role,
      expiresAt,
    },
  });
});

router.post("/join-by-share-token", async (req, res) => {
  const bodySchema = z.object({ token: z.string().min(1) });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
  const link = await prisma.documentShareLink.findUnique({
    where: { tokenHash },
    select: {
      documentId: true,
      role: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt.getTime() < Date.now())) {
    res.status(404).json({ error: "Invalid or expired share link" });
    return;
  }
  const existingRole = await getDocumentRole(link.documentId, req.auth!.userId);
  if (!existingRole) {
    await prisma.documentMember.create({
      data: {
        documentId: link.documentId,
        userId: req.auth!.userId,
        role: link.role,
      },
    });
  }
  res.json({ ok: true, documentId: link.documentId, role: link.role });
});

export default router;
