-- Relatório da última carga. Usado para conferir os números reportados.
\pset border 2

SELECT "fileName",
       status,
       "totalRows"     AS linhas,
       "insertedRows"  AS inseridos,
       "skippedRows"   AS ja_existiam,
       "failedRows"    AS rejeitados,
       "inactiveRows"  AS ignorados_situacao,
       "duplicateRows" AS duplicados_arquivo,
       source
  FROM import_jobs
 ORDER BY "createdAt";

SELECT count(*) AS total_leads FROM leads;

SELECT "situacaoCadastral" AS situacao, count(*) AS total
  FROM leads
 GROUP BY 1
 ORDER BY 2 DESC;

SELECT estado, count(*) AS total FROM leads GROUP BY 1 ORDER BY 2 DESC;

SELECT count(*) AS com_whatsapp FROM leads WHERE whatsapp IS NOT NULL;
SELECT count(*) AS com_email FROM leads WHERE email IS NOT NULL;

SELECT field AS campo, reason AS motivo, count(*) AS total
  FROM import_errors
 GROUP BY 1, 2
 ORDER BY 3 DESC
 LIMIT 20;
