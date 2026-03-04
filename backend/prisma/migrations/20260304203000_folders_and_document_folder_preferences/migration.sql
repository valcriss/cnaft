CREATE TABLE "Folder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "parentId" TEXT,
  "name" TEXT NOT NULL,
  "sortIndex" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Folder_userId_parentId_sortIndex_idx"
  ON "Folder"("userId", "parentId", "sortIndex");

CREATE INDEX "Folder_parentId_idx"
  ON "Folder"("parentId");

ALTER TABLE "Folder"
  ADD CONSTRAINT "Folder_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "Folder"
  ADD CONSTRAINT "Folder_parentId_fkey"
  FOREIGN KEY ("parentId")
  REFERENCES "Folder"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE TABLE "DocumentFolderPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "folderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentFolderPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentFolderPreference_userId_documentId_key"
  ON "DocumentFolderPreference"("userId", "documentId");

CREATE INDEX "DocumentFolderPreference_userId_folderId_idx"
  ON "DocumentFolderPreference"("userId", "folderId");

CREATE INDEX "DocumentFolderPreference_documentId_userId_idx"
  ON "DocumentFolderPreference"("documentId", "userId");

ALTER TABLE "DocumentFolderPreference"
  ADD CONSTRAINT "DocumentFolderPreference_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "DocumentFolderPreference"
  ADD CONSTRAINT "DocumentFolderPreference_documentId_fkey"
  FOREIGN KEY ("documentId")
  REFERENCES "Document"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "DocumentFolderPreference"
  ADD CONSTRAINT "DocumentFolderPreference_folderId_fkey"
  FOREIGN KEY ("folderId")
  REFERENCES "Folder"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
