-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "followUpTemplateId" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "followUpDelayHours" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "campaigns" ADD COLUMN "followUpStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "campaign_recipients" ADD COLUMN "followUpStatus" "CampaignRecipientStatus";
ALTER TABLE "campaign_recipients" ADD COLUMN "followUpError" TEXT;
ALTER TABLE "campaign_recipients" ADD COLUMN "followUpProcessedAt" TIMESTAMP(3);
ALTER TABLE "campaign_recipients" ADD COLUMN "followUpQueuedAt" TIMESTAMP(3);
ALTER TABLE "campaign_recipients" ADD COLUMN "followUpIdempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_followUpIdempotencyKey_key" ON "campaign_recipients"("followUpIdempotencyKey");
CREATE INDEX "campaign_recipients_campaignId_followUpStatus_idx" ON "campaign_recipients"("campaignId", "followUpStatus");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_followUpTemplateId_fkey" FOREIGN KEY ("followUpTemplateId") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
