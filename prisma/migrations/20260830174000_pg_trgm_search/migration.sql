-- Busca por razão social e nome fantasia.
--
-- Sem isto, `ILIKE '%termo%'` faz sequential scan em toda a tabela de leads.
-- O índice GIN trigram atende busca por substring no meio da palavra, que é o
-- comportamento que a barra de busca da tela /leads promete.
--
-- Escrita à mão porque o Prisma não modela extensão nem operator class de índice.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "leads_razao_social_trgm_idx"
  ON "leads" USING GIN ("razaoSocial" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "leads_nome_fantasia_trgm_idx"
  ON "leads" USING GIN ("nomeFantasia" gin_trgm_ops);

-- CNPJ é buscado por prefixo/substring de dígitos; o índice único de igualdade
-- não serve para `LIKE '%1234%'`.
CREATE INDEX IF NOT EXISTS "leads_cnpj_trgm_idx"
  ON "leads" USING GIN ("cnpj" gin_trgm_ops);
