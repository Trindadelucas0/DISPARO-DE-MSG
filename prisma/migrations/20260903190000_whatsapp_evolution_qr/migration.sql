-- AlterEnum
ALTER TYPE "WhatsAppProvider" ADD VALUE IF NOT EXISTS 'EVOLUTION';

-- AlterEnum
ALTER TYPE "WhatsAppSessionStatus" ADD VALUE IF NOT EXISTS 'QR_CODE';

-- AlterTable
ALTER TABLE "whatsapp_accounts" ADD COLUMN IF NOT EXISTS "lastConnectedAt" TIMESTAMP(3);
ALTER TABLE "whatsapp_accounts" ADD COLUMN IF NOT EXISTS "providerInstanceName" TEXT;
ALTER TABLE "whatsapp_accounts" ADD COLUMN IF NOT EXISTS "qrCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_accounts_providerInstanceName_key" ON "whatsapp_accounts"("providerInstanceName");
