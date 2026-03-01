import { prisma } from "../lib/prisma.js";

export async function getDocumentRole(documentId: string, userId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { ownerId: true },
  });
  if (!document) return null;
  if (document.ownerId === userId) return "owner" as const;

  const member = await prisma.documentMember.findUnique({
    where: {
      documentId_userId: {
        documentId,
        userId,
      },
    },
    select: { role: true },
  });
  if (!member) return null;
  if (member.role === "editor") return "editor" as const;
  if (member.role === "viewer") return "viewer" as const;
  return null;
}

export function canRead(role: "owner" | "editor" | "viewer" | null) {
  return role === "owner" || role === "editor" || role === "viewer";
}

export function canWrite(role: "owner" | "editor" | "viewer" | null) {
  return role === "owner" || role === "editor";
}
