-- Per-user archive preference for dashboard visibility
CREATE TABLE "DocumentArchivePreference" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DocumentArchivePreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentArchivePreference_documentId_userId_key"
  ON "DocumentArchivePreference"("documentId", "userId");

CREATE INDEX "DocumentArchivePreference_userId_archivedAt_idx"
  ON "DocumentArchivePreference"("userId", "archivedAt");

CREATE INDEX "DocumentArchivePreference_documentId_userId_idx"
  ON "DocumentArchivePreference"("documentId", "userId");

ALTER TABLE "DocumentArchivePreference"
  ADD CONSTRAINT "DocumentArchivePreference_documentId_fkey"
  FOREIGN KEY ("documentId")
  REFERENCES "Document"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "DocumentArchivePreference"
  ADD CONSTRAINT "DocumentArchivePreference_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
