CREATE TYPE "TemplateVisibility" AS ENUM ('PRIVATE', 'SHARED');

CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "visibility" "TemplateVisibility" NOT NULL DEFAULT 'PRIVATE',
    "contentJson" JSONB NOT NULL,
    "thumbnailJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentTemplate_createdById_updatedAt_idx" ON "DocumentTemplate"("createdById", "updatedAt");
CREATE INDEX "DocumentTemplate_visibility_updatedAt_idx" ON "DocumentTemplate"("visibility", "updatedAt");

ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
