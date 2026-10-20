CREATE TYPE "AutoReplyMatchMode" AS ENUM ('EQUALS', 'CONTAINS', 'ANY_OF');

ALTER TABLE "campaigns" ADD COLUMN "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "autoReplyFallbackTemplateId" TEXT,
ADD COLUMN "autoReplyFallbackBody" TEXT;

CREATE TABLE "campaign_auto_reply_rules" (
  "id" TEXT NOT NULL, "campaignId" TEXT NOT NULL, "position" INTEGER NOT NULL,
  "matchMode" "AutoReplyMatchMode" NOT NULL, "matchValues" TEXT[] NOT NULL,
  "responseTemplateId" TEXT, "responseBody" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "campaign_auto_reply_rules_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "campaign_auto_reply_executions" (
  "id" TEXT NOT NULL, "campaignId" TEXT NOT NULL, "recipientId" TEXT NOT NULL, "ruleId" TEXT,
  "inboundMessageId" TEXT NOT NULL, "outboundMessageId" TEXT, "matchedFallback" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL, "error" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3), CONSTRAINT "campaign_auto_reply_executions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "campaign_auto_reply_rules_campaignId_position_key" ON "campaign_auto_reply_rules"("campaignId", "position");
CREATE INDEX "campaign_auto_reply_rules_campaignId_idx" ON "campaign_auto_reply_rules"("campaignId");
CREATE INDEX "campaign_auto_reply_rules_responseTemplateId_idx" ON "campaign_auto_reply_rules"("responseTemplateId");
CREATE UNIQUE INDEX "campaign_auto_reply_executions_recipientId_key" ON "campaign_auto_reply_executions"("recipientId");
CREATE UNIQUE INDEX "campaign_auto_reply_executions_inboundMessageId_key" ON "campaign_auto_reply_executions"("inboundMessageId");
CREATE UNIQUE INDEX "campaign_auto_reply_executions_outboundMessageId_key" ON "campaign_auto_reply_executions"("outboundMessageId");
CREATE INDEX "campaign_auto_reply_executions_campaignId_createdAt_idx" ON "campaign_auto_reply_executions"("campaignId", "createdAt");
CREATE INDEX "campaign_auto_reply_executions_ruleId_idx" ON "campaign_auto_reply_executions"("ruleId");
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_autoReplyFallbackTemplateId_fkey" FOREIGN KEY ("autoReplyFallbackTemplateId") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaign_auto_reply_rules" ADD CONSTRAINT "campaign_auto_reply_rules_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_auto_reply_rules" ADD CONSTRAINT "campaign_auto_reply_rules_responseTemplateId_fkey" FOREIGN KEY ("responseTemplateId") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaign_auto_reply_executions" ADD CONSTRAINT "campaign_auto_reply_executions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_auto_reply_executions" ADD CONSTRAINT "campaign_auto_reply_executions_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "campaign_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_auto_reply_executions" ADD CONSTRAINT "campaign_auto_reply_executions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "campaign_auto_reply_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaign_auto_reply_executions" ADD CONSTRAINT "campaign_auto_reply_executions_inboundMessageId_fkey" FOREIGN KEY ("inboundMessageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_auto_reply_executions" ADD CONSTRAINT "campaign_auto_reply_executions_outboundMessageId_fkey" FOREIGN KEY ("outboundMessageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
