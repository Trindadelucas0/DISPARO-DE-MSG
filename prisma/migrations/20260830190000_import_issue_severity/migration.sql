-- Separa "linha rejeitada" de "campo descartado" no relatório de importação.
--
-- Antes, um e-mail inválido era descartado sem deixar registro: o lead entrava
-- sem e-mail e ninguém sabia por quê. A regra do projeto é que nada desaparece
-- em silêncio, então o descarte passa a ser gravado como WARNING.

CREATE TYPE "ImportIssueSeverity" AS ENUM ('ERROR', 'WARNING');

ALTER TABLE "import_errors"
  ADD COLUMN "severity" "ImportIssueSeverity" NOT NULL DEFAULT 'ERROR';

ALTER TABLE "import_jobs"
  ADD COLUMN "warningRows" INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "import_errors_jobId_rowNumber_idx";

CREATE INDEX "import_errors_jobId_severity_rowNumber_idx"
  ON "import_errors" ("jobId", "severity", "rowNumber");
