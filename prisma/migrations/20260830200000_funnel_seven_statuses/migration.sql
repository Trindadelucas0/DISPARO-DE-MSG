-- Recorta LeadStatus de 10 para 7 valores de funil.
-- RESPONDED / NO_INTEREST / INVALID_NUMBER saem do funil e passam a existir
-- só como InteractionResult. Leads nesses status antigos viram CONTACTED;
-- o histórico de Interaction não é reescrito.

UPDATE "leads"
SET status = 'CONTACTED'
WHERE status IN ('RESPONDED', 'NO_INTEREST', 'INVALID_NUMBER');

CREATE TYPE "LeadStatus_new" AS ENUM (
  'NEW',
  'READY_TO_CONTACT',
  'CONTACTED',
  'QUALIFIED',
  'NEGOTIATION',
  'CUSTOMER',
  'LOST'
);

ALTER TABLE "leads" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "leads"
  ALTER COLUMN "status" TYPE "LeadStatus_new"
  USING (status::text::"LeadStatus_new");

DROP TYPE "LeadStatus";

ALTER TYPE "LeadStatus_new" RENAME TO "LeadStatus";

ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'NEW'::"LeadStatus";
