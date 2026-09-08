-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO');

-- AlterEnum
ALTER TYPE "MessageKind" ADD VALUE 'IMAGE';
ALTER TYPE "MessageKind" ADD VALUE 'VIDEO';
ALTER TYPE "MessageKind" ADD VALUE 'AUDIO';

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storageKey_key" ON "media_assets"("storageKey");

-- CreateIndex
CREATE INDEX "media_assets_createdById_idx" ON "media_assets"("createdById");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "message_templates" ADD COLUMN "mediaId" TEXT;

-- CreateIndex
CREATE INDEX "message_templates_mediaId_idx" ON "message_templates"("mediaId");

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "mediaId" TEXT;

-- CreateIndex
CREATE INDEX "messages_mediaId_idx" ON "messages"("mediaId");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
