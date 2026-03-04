import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const router = Router();

const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().min(1).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const moveFolderSchema = z.object({
  parentId: z.string().min(1).nullable(),
  beforeId: z.string().min(1).nullable().optional(),
});

const updateFolderSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

router.get("/", async (req, res) => {
  const userId = req.auth!.userId;
  const folders = await prisma.folder.findMany({
    where: { userId },
    orderBy: [{ parentId: "asc" }, { sortIndex: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      color: true,
      parentId: true,
      sortIndex: true,
    },
  });
  res.json({ folders });
});

router.post("/", async (req, res) => {
  const userId = req.auth!.userId;
  const parsed = createFolderSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const parentId = parsed.data.parentId ?? null;
  if (parentId) {
    const parent = await prisma.folder.findFirst({
      where: { id: parentId, userId },
      select: { id: true },
    });
    if (!parent) {
      res.status(404).json({ error: "Parent folder not found" });
      return;
    }
  }

  const sibling = await prisma.folder.findFirst({
    where: { userId, parentId },
    orderBy: { sortIndex: "desc" },
    select: { sortIndex: true },
  });
  const nextSortIndex = (sibling?.sortIndex ?? -1) + 1;

  const folder = await prisma.folder.create({
    data: {
      userId,
      parentId,
      name: parsed.data.name,
      color: parsed.data.color ?? "#64748b",
      sortIndex: nextSortIndex,
    },
    select: { id: true, name: true, color: true, parentId: true, sortIndex: true },
  });

  res.status(201).json({ folder });
});

router.patch("/:id", async (req, res) => {
  const userId = req.auth!.userId;
  const folderId = req.params.id;
  const parsed = updateFolderSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  if (!parsed.data.name && !parsed.data.color) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const folder = await prisma.folder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  });
  if (!folder) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }

  const updated = await prisma.folder.update({
    where: { id: folderId },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.color ? { color: parsed.data.color } : {}),
    },
    select: { id: true, name: true, color: true, parentId: true, sortIndex: true },
  });

  res.json({ folder: updated });
});

function isDescendant(nodesByParent: Map<string | null, string[]>, sourceId: string, possibleDescendantId: string): boolean {
  const stack = [...(nodesByParent.get(sourceId) ?? [])];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === possibleDescendantId) return true;
    stack.push(...(nodesByParent.get(current) ?? []));
  }
  return false;
}

router.patch("/:id/move", async (req, res) => {
  const userId = req.auth!.userId;
  const folderId = req.params.id;
  const parsed = moveFolderSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const folder = await prisma.folder.findFirst({
    where: { id: folderId, userId },
    select: { id: true, parentId: true },
  });
  if (!folder) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }

  const targetParentId = parsed.data.parentId;
  const beforeId = parsed.data.beforeId ?? null;
  if (targetParentId === folderId) {
    res.status(400).json({ error: "Cannot move folder into itself" });
    return;
  }
  if (beforeId === folderId) {
    res.status(400).json({ error: "Cannot place folder before itself" });
    return;
  }
  if (targetParentId) {
    const targetParent = await prisma.folder.findFirst({
      where: { id: targetParentId, userId },
      select: { id: true },
    });
    if (!targetParent) {
      res.status(404).json({ error: "Target parent folder not found" });
      return;
    }

    const allFolders = await prisma.folder.findMany({
      where: { userId },
      select: { id: true, parentId: true },
    });
    const byParent = new Map<string | null, string[]>();
    for (const item of allFolders) {
      const list = byParent.get(item.parentId ?? null) ?? [];
      list.push(item.id);
      byParent.set(item.parentId ?? null, list);
    }
    if (isDescendant(byParent, folderId, targetParentId)) {
      res.status(400).json({ error: "Cannot move folder into its subtree" });
      return;
    }
  }

  if (beforeId) {
    const beforeFolder = await prisma.folder.findFirst({
      where: { id: beforeId, userId },
      select: { id: true, parentId: true },
    });
    if (!beforeFolder) {
      res.status(404).json({ error: "Target position folder not found" });
      return;
    }
    if ((beforeFolder.parentId ?? null) !== (targetParentId ?? null)) {
      res.status(400).json({ error: "Invalid target position" });
      return;
    }
  }

  const moved = await prisma.$transaction(async (tx) => {
    const siblings = await tx.folder.findMany({
      where: { userId, parentId: targetParentId },
      orderBy: [{ sortIndex: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });

    const orderedIds = siblings.map((s) => s.id).filter((id) => id !== folderId);
    const insertIndex = beforeId ? orderedIds.indexOf(beforeId) : -1;
    if (insertIndex >= 0) {
      orderedIds.splice(insertIndex, 0, folderId);
    } else {
      orderedIds.push(folderId);
    }

    await tx.folder.update({
      where: { id: folderId },
      data: {
        parentId: targetParentId,
      },
    });

    for (let i = 0; i < orderedIds.length; i += 1) {
      await tx.folder.update({
        where: { id: orderedIds[i] },
        data: { sortIndex: i },
      });
    }

    return tx.folder.findUniqueOrThrow({
      where: { id: folderId },
      select: { id: true, name: true, color: true, parentId: true, sortIndex: true },
    });
  });

  res.json({ folder: moved });
});

router.delete("/:id", async (req, res) => {
  const userId = req.auth!.userId;
  const folderId = req.params.id;

  const folder = await prisma.folder.findFirst({
    where: { id: folderId, userId },
    select: { id: true, parentId: true },
  });
  if (!folder) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }

  const [childrenCount, assignedDocsCount] = await Promise.all([
    prisma.folder.count({
      where: { userId, parentId: folderId },
    }),
    prisma.documentFolderPreference.count({
      where: { userId, folderId },
    }),
  ]);

  if (childrenCount > 0) {
    res.status(400).json({ error: "Cannot delete a folder that has subfolders" });
    return;
  }
  if (assignedDocsCount > 0) {
    res.status(400).json({ error: "Cannot delete a folder that contains documents" });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.folder.delete({
      where: { id: folderId },
    });

    const siblings = await tx.folder.findMany({
      where: { userId, parentId: folder.parentId ?? null },
      orderBy: [{ sortIndex: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });

    for (let i = 0; i < siblings.length; i += 1) {
      await tx.folder.update({
        where: { id: siblings[i].id },
        data: { sortIndex: i },
      });
    }
  });

  res.status(204).send();
});

export default router;
