ALTER TABLE "leads"
  ADD COLUMN "whatsappConsentAt" TIMESTAMP(3),
  ADD COLUMN "whatsappConsentSource" TEXT;

ALTER TABLE "whatsapp_accounts"
  ADD COLUMN "campaignSafetyDay" TEXT,
  ADD COLUMN "campaignDailyAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "campaignBurstAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "campaignCooldownUntil" TIMESTAMP(3),
  ADD COLUMN "campaignConsecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "campaignSafetyPausedAt" TIMESTAMP(3),
  ADD COLUMN "campaignSafetyPauseReason" TEXT;

ALTER TABLE "campaigns"
  ADD COLUMN "followUpEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "unconsentedConfirmedAt" TIMESTAMP(3);

UPDATE "campaigns" SET "excludeOptOut" = true WHERE "excludeOptOut" = false;
