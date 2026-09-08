-- AlterEnum
ALTER TYPE "WhatsAppProvider" ADD VALUE IF NOT EXISTS 'BAILEYS';

-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "leadId" DROP NOT NULL;
