import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

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

const visibilitySchema = z.enum(["private", "shared"]).transform((value) => (value === "shared" ? "SHARED" : "PRIVATE"));

const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  visibility: visibilitySchema.optional(),
  contentJson: jsonValueSchema.optional(),
  thumbnailJson: jsonValueSchema.optional(),
});

const createDocumentFromTemplateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  folderId: z.string().min(1).nullable().optional(),
});

function mapVisibility(visibility: "PRIVATE" | "SHARED") {
  return visibility === "SHARED" ? "shared" : "private";
}

function mapTemplate(template: {
  id: string;
  name: string;
  description: string;
  visibility: "PRIVATE" | "SHARED";
  contentJson?: unknown;
  thumbnailJson: unknown;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: { id: string; displayName: string; email: string };
}, userId: string) {
  return {
    ...template,
    visibility: mapVisibility(template.visibility),
    canEdit: template.createdById === userId,
  };
}

async function findVisibleTemplate(templateId: string, userId: string) {
  return prisma.documentTemplate.findFirst({
    where: {
      id: templateId,
      OR: [{ createdById: userId }, { visibility: "SHARED" }],
    },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });
}

router.get("/", async (req, res) => {
  const userId = req.auth!.userId;
  const templates = await prisma.documentTemplate.findMany({
    where: {
      OR: [{ createdById: userId }, { visibility: "SHARED" }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  res.json({ templates: templates.map((template) => mapTemplate(template, userId)) });
});

router.get("/:id", async (req, res) => {
  const userId = req.auth!.userId;
  const template = await findVisibleTemplate(req.params.id, userId);
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json({ template: mapTemplate(template, userId) });
});

router.patch("/:id", async (req, res) => {
  const userId = req.auth!.userId;
  const parsed = updateTemplateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const payload = parsed.data;
  if (!Object.keys(payload).length) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const existing = await prisma.documentTemplate.findUnique({
    where: { id: req.params.id },
    select: { id: true, createdById: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  if (existing.createdById !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const updated = await prisma.documentTemplate.update({
    where: { id: req.params.id },
    data: {
      ...(typeof payload.name !== "undefined" ? { name: payload.name } : {}),
      ...(typeof payload.description !== "undefined" ? { description: payload.description } : {}),
      ...(typeof payload.visibility !== "undefined" ? { visibility: payload.visibility } : {}),
      ...(typeof payload.contentJson !== "undefined" ? { contentJson: payload.contentJson } : {}),
      ...(typeof payload.thumbnailJson !== "undefined" ? { thumbnailJson: payload.thumbnailJson } : {}),
    },
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  res.json({ template: mapTemplate(updated, userId) });
});

router.delete("/:id", async (req, res) => {
  const userId = req.auth!.userId;
  const existing = await prisma.documentTemplate.findUnique({
    where: { id: req.params.id },
    select: { id: true, createdById: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  if (existing.createdById !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await prisma.documentTemplate.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

router.post("/:id/create-document", async (req, res) => {
  const userId = req.auth!.userId;
  const parsed = createDocumentFromTemplateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const template = await findVisibleTemplate(req.params.id, userId);
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const folderId = parsed.data.folderId ?? null;
  if (folderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, userId },
      select: { id: true },
    });
    if (!folder) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }
  }

  const document = await prisma.document.create({
    data: {
      owner: { connect: { id: userId } },
      title: parsed.data.title ?? template.name,
      contentJson: template.contentJson as Prisma.InputJsonValue,
      ...(typeof template.thumbnailJson !== "undefined" && template.thumbnailJson !== null
        ? { thumbnailJson: template.thumbnailJson }
        : {}),
    },
    select: { id: true, title: true, updatedAt: true },
  });

  if (folderId) {
    await prisma.documentFolderPreference.create({
      data: {
        userId,
        documentId: document.id,
        folderId,
      },
    });
  }

  res.status(201).json({ document });
});

export default router;
