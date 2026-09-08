# Documentação do sistema — CRM de Prospecção

Fonte oficial de comportamento. Se a tela e este documento divergirem, um dos dois está errado
e a divergência precisa ser resolvida na mesma entrega.

**Layout do repositório.** Este git **é** a aplicação (Next.js, Prisma, Compose, `.env.example`
na raiz). Comandos `npm`, Prisma e `docker compose` rodam aqui, sem pasta `CRM/`. Credenciais:
`.env` na raiz (não versionado). Hospedagem na VPS: [`README.md`](README.md).

Requisitos de produto, mapa de telas e fluxos (Mermaid): [`PRD.md`](PRD.md). Este arquivo
continua sendo a fonte de regra, campo e path de código. Tutorial para o cliente:
[`docs/como-usar-o-sistema.md`](docs/como-usar-o-sistema.md).

- Versão: 0.16.10 — Kanban único: admin vê todos; vendedor só o dele
- Fases entregues: 1 a 9 (MVP) + restyle 0.11.0 + identidade 0.12.0 + atendimento 0.13.0 + retorno 0.14.0
- Última atualização: 08/09/2026 — repositório de VPS: Postgres+Redis+worker no Compose; Next no systemd; runbook em README.md

---

## 1. O que o sistema é

Ferramenta operacional de prospecção outbound. O vendedor recebe uma base de empresas importada
de planilha da Receita, filtra quem vale contato, registra o status no funil e agenda o próximo
contato. Em 0.13.0 também dispara **campanhas** (fila Redis/BullMQ) e atende respostas na **Inbox**.

Não é um dashboard de métricas nem um site. É tela de trabalho: densa, orientada a teclado, sem
elemento decorativo. O padrão visual é obrigatório e está em `PRODUCT.md` e `DESIGN.md`.

Com conta **WhatsApp Web (QR)** em `CONNECTED`, o envio do lead e a campanha saem pelo
worker Baileys (container `crm-worker`). Sem sessão CONNECTED, Leads ainda oferece `wa.me`. O QR é gerado no
container `crm-worker` (`docker compose up -d`). Não exige `EVOLUTION_API_KEY`. Mock, Chatwoot e Manual não
aparecem mais em **Adicionar conta**.

## 2. Arquitetura

Monólito modular em Next.js 15 (App Router). Camadas, de fora para dentro:

```
componente React (src/features/*, src/components/*)
  → hook de dados (TanStack Query)
    → rota HTTP (src/app/api/*)
      → serviço, dono da regra de negócio (src/server/services/*)
        → repositório, dono do acesso a dados (src/server/repositories/*)
          → Prisma → PostgreSQL
```

Regras não negociáveis desta separação:

- Componente React nunca chama Prisma nem serviço direto. A fronteira é a API HTTP.
- Autorização é decidida **só no servidor** (`src/lib/auth/rbac.ts`). O cliente não é fonte de
  verdade: `responsavelId` vindo do corpo da requisição é revalidado antes de ser aplicado.
- Repositório não conhece papel de usuário. O recorte por papel chega pronto no parâmetro `scope`.

| Camada | Caminho | Responsabilidade |
| --- | --- | --- |
| UI | `src/components/ui`, `src/components/shell` | Primitivas visuais e casca da aplicação |
| Tela | `src/features/<domínio>` | Tela, formulário, hooks e schema do domínio |
| API | `src/app/api` | Validação de entrada (Zod), RBAC, tradução de erro |
| Serviço | `src/server/services` | Regra de negócio, cache, auditoria |
| Repositório | `src/server/repositories` | Consulta e escrita, `select` explícito |
| Infra | `src/lib` | Prisma, Redis, cache, rate limit, validação, formatação |
| Constantes | `src/constants` | Espelho dos enums com rótulo em português |

## 3. Stack e infraestrutura

| Item | Escolha | Observação |
| --- | --- | --- |
| Framework | Next.js 15 App Router, React 19, TypeScript estrito | `tsc --noEmit` limpo |
| Estilo | Tailwind 3.4 + tokens OKLCH | Sem `shadcn add`: componentes escritos à mão |
| Banco | PostgreSQL 16 no Compose (`crm-postgres`), porta `127.0.0.1:5432`, base `crm_prospeccao` | Volume `crm_pg_data` |
| ORM | Prisma 6 | migrations em `prisma/migrations` |
| Cache / rate limit / filas | Redis 7 `crm-redis` `127.0.0.1:6379` + BullMQ | Campanha exige Redis |
| Autenticação | Auth.js v5, provider Credentials, `bcryptjs` (12 rounds) | JWT, sessão de 8 horas |
| WhatsApp | Gateway: LegacyManual (wa.me), Baileys (QR no worker), Chatwoot, Mock | Sessão em `data/whatsapp-auth/` |
| Planilha | `exceljs` | O pacote `xlsx` do npm **não** é usado (CVE de prototype pollution) |
| Ícones | `lucide-react`, única biblioteca permitida | Regra visual §10 |
| Processo Next | porta **3001** em `127.0.0.1` (`npm start` / systemd `crm.service`) | Worker: container `crm-worker` |

O Next.js escuta **somente** em `127.0.0.1:3001`. Na VPS o Nginx faz o proxy em 443.
`AUTH_URL` é a URL pública HTTPS. Runbook: [`README.md`](README.md).

### Processo na VPS

| Item | Valor |
| --- | --- |
| App | systemd `crm.service` → `npm start` (`127.0.0.1:3001`) |
| Postgres + Redis + worker | `docker compose up -d` (`crm-postgres`, `crm-redis`, `crm-worker`) |
| Proxy | Nginx 80/443 → 3001 |
| Sessão / mídia | `data/whatsapp-auth/`, `data/media/` (gitignored) |

O worker Baileys **não** precisa de segundo terminal. `docker compose up -d` sobe Postgres,
Redis e `crm-worker` (`Dockerfile.worker`). O container fala com o Postgres no serviço
`postgres` da rede Docker e com o Redis em `redis:6379`. Fallback de debug: `npm run worker`
na raiz — **nunca** junto com o container (lock Redis).

Scripts `scripts/keep-alive.ps1` são só Windows. Na VPS não instale.

### Degradação sem Redis

Se `REDIS_URL` estiver ausente ou o Redis cair:
- cache e rate limit degradam (como antes);
- **campanhas não iniciam** (UI e API honestas — `BadRequestError`);
- workers BullMQ (container `crm-worker`) não sobem.

Filas: `campaign-send`, `campaign-retry`, `whatsapp-inbound`, `whatsapp-status`,
`conversation-routing`. Next enfileira; o processo `workers/` executa. Conexão BullMQ usa
`maxRetriesPerRequest: null` (não reutiliza o cliente de cache). JobId customizado **não**
pode ter `:` (BullMQ recusa). A chave do destinatário é `campaignId-leadId`; `toBullJobId`
troca `:` restante por `-` (chaves antigas `campaignId:leadId` entram na mesma fila).

Cadência de campanha: **5 disparos por minuto** (`CAMPAIGN_SENDS_PER_MINUTE`), espaçados em
12 s (`campaignSendIntervalMs`). O teto está no worker (`concurrency: 1` + BullMQ `limiter`
`max: 1` / 12 s) em `campaign-send` e, por defesa, em `campaign-retry`. Duas campanhas ao
mesmo tempo **dividem** os 5/min. O **retorno** (segunda mensagem) entra na **mesma** fila —
não soma 5+5. JobId do retorno: `followup-{campaignId}-{leadId}` (retry de falha ou pausa
acrescenta `-r{timestamp}`). Depois do primeiro `SENT`, o worker agenda o retorno com
`delay` BullMQ = `followUpDelayHours` (padrão 2 h). Sem cron. Pausada: o job delayed que
disparar é ignorado; **Retomar** reagenda com o tempo que ainda falta. Inbox e envio
avulso no lead **não** entram nesse teto.
`enqueueCampaignRetry` existe e não é chamado; se um dia for, o job deve voltar para
`campaign-send` (não somar 5+5). Worker antigo sem restart continua no ritmo anterior:
religar o container `crm-worker` (`docker compose restart worker`).

## 4. Modelo de dados

Modelos em `prisma/schema.prisma`: os 11 do MVP (`User`, `Lead`, `Interaction`, `FollowUp`,
`MessageTemplate`, `Tag`, `LeadTag`, `AuditLog`, `ImportJob`, `ImportError`, `Notification`)
mais, em 0.13.0: `WhatsAppAccount`, `Campaign`, `CampaignRecipient`, `Conversation`, `Message`,
`ConversationAssignment`, `ConversationUserRestriction`, `RoutingRule`, `RoutingRoundRobinState`,
`OptOut`. Em 0.16.0: `MediaAsset` (arquivo em `data/media/`, gitignored). `MessageTemplate.mediaId` e
`Message.mediaId` apontam para o asset. Um arquivo por mensagem.

`Conversation.status` (OPEN / WAITING / RESOLVED) **não** é o funil do Lead. Cores usam
`--conversation-*`. `Conversation.leadId` é **opcional**. Inbound com número conhecido liga ao
lead; número desconhecido cria conversa **sem lead** (Admin e vendedor veem o texto na fila sem dono; não inventa CNPJ da Receita).
O operador liga o número a um contato com **Salvar contato** (`POST /api/conversations/:id/contact`).
Sem CNPJ informado, o banco guarda chave de 14 dígitos que **falha** `isValidCnpj`; a UI mostra "—" no CNPJ.
Histórico antigo do WhatsApp **não** entra: só mensagem com timestamp ≥ `lastConnectedAt`.
O worker retoma sessão `CONNECTED` (e pasta `data/whatsapp-auth/<id>/`) ao subir. Código 515
(restart required após o scan) é **esperado**: o worker espera o `creds.update` gravar,
reconecta **sem** apagar o auth e **sem** novo QR. Close 440 (connection replaced) e outros
closes sem logout 401 também ficam `CONNECTING` e reconectam se `creds.json` existir —
não gravam `DISCONNECTED` (a tela mentia “Desconectada” enquanto o send ainda saía).
`DISCONNECTED` só no logout real (401, apaga auth) ou no botão **Desconectar**.
Envio bem-sucedido e heartbeat a cada 30 s (sem SSE) regravam `CONNECTED`.
Se o reconnect falhar, grava `FAILED`.
`lastConnectedAt` não é zerado no reconnect. JID `@lid` usa `remoteJidAlt` para o telefone.
Sufixo de aparelho (`5538…:2@s.whatsapp.net`) é removido **antes** de extrair dígitos — senão
o `:2` vira dígito extra no telefone da conta.
Envio outbound monta `55…@s.whatsapp.net` (DDI obrigatório). Não reutiliza
`normalizeInboundPhone` no JID de send — essa função **remove** o 55 para casar conversa.
Confirma existência com `onWhatsApp` (variante com e sem o 9 extra do celular BR). Número
inexistente vira `FAILED` na Inbox, não `SENT`.

`CampaignRecipient` tem unique `(campaignId, leadId)` e `idempotencyKey` = `campaignId-leadId`.
Retorno reusa a mesma linha: `followUpStatus`, `followUpIdempotencyKey` = `followup-{campaignId}-{leadId}`.
Métricas de campanha e supervisão vêm de COUNT no banco — nunca inventadas no frontend.

### Enums

| Enum | Valores |
| --- | --- |
| `Role` | ADMIN, MANAGER, USER |
| `LeadStatus` | NEW, READY_TO_CONTACT, CONTACTED, QUALIFIED, NEGOTIATION, CUSTOMER, LOST |
| `InteractionType` | WHATSAPP, PHONE, EMAIL, NOTE, OTHER |
| `InteractionResult` | OPENED (rótulo "Ação iniciada"), SENT ("Mensagem enviada"), RESPONDED, NO_RESPONSE, CALLBACK, NO_INTEREST, INVALID_NUMBER, OTHER |
| `FollowUpStatus` | PENDING, COMPLETED, CANCELLED, OVERDUE |
| `ImportJobStatus` | PENDING, RUNNING, COMPLETED, FAILED, CANCELLED |
| `ImportIssueSeverity` | ERROR (linha rejeitada), WARNING (campo descartado) |
| `WhatsAppProvider` | LEGACY_MANUAL, CHATWOOT, MOCK, EVOLUTION, BAILEYS |
| `WhatsAppSessionStatus` | DISCONNECTED, CONNECTING, QR_CODE, CONNECTED, FAILED |
| `CampaignStatus` | DRAFT, RUNNING, PAUSED, COMPLETED, CANCELLED |
| `CampaignRecipientStatus` | PENDING, QUEUED, SENT, DELIVERED, FAILED, SKIPPED, OPTED_OUT, RESPONDED |
| `CampaignRoutingMode` | MANUAL, CURRENT_OWNER, RULES, ROUND_ROBIN |
| `ConversationStatus` | OPEN, WAITING, RESOLVED |
| `MessageDirection` | INBOUND, OUTBOUND |
| `MessageKind` | TEXT, TEMPLATE, SYSTEM, IMAGE, VIDEO, AUDIO |
| `MediaKind` | IMAGE, VIDEO, AUDIO |
| `MessageDeliveryStatus` | PENDING, SENT, DELIVERED, READ, FAILED |
| `AssignmentReason` | ROUTING_RULE, ROUND_ROBIN, CURRENT_OWNER, MANUAL, TAKE, TRANSFER, UNASSIGNED |
| `OptOutSource` | CAMPAIGN, INBOUND, MANUAL, LEAD |

Nenhuma string de status pode aparecer solta no código. O rótulo em português, a ordem no funil e
a classe de cor vêm de `src/constants/lead-status.ts` (funil) e `src/constants/interactions.ts`
(resultado da interação). Funil e resultado nunca compartilham o mesmo badge.

`lastInteractionResult` / `lastInteractionAt` são derivados no repositório por subquery
`DISTINCT ON ("leadId")` em `interactions` — sem coluna nova em `Lead`. Listagem, detalhe, kanban,
fila de contatos e follow-ups devolvem o par. Filtrar a base em JavaScript continua proibido.

### Índices do `Lead`

- Único: `cnpj`.
- Simples: `status`, `estado`, `cidade`, `responsavelId`, `nextContactAt`, `lastContactAt`,
  `createdAt`, `whatsapp`, `situacaoCadastral`.
- Compostos: `(status, nextContactAt)`, `(responsavelId, nextContactAt)`, `(estado, status)`,
  `(createdAt, status)`.
- GIN trigram (`pg_trgm`, migration `20260830174000_pg_trgm_search`): `razaoSocial`,
  `nomeFantasia`, `cnpj` — servem a busca por trecho (`ILIKE '%termo%'`) da tela de leads.

### Migrations

| Migration | O que faz |
| --- | --- |
| `20260830173530_init` | Cria os 11 modelos, enums e índices |
| `20260830174000_pg_trgm_search` | Habilita `pg_trgm` e cria os 3 índices GIN de busca |
| `20260830190000_import_issue_severity` | Adiciona `ImportIssueSeverity`, `ImportError.severity` e `ImportJob.warningRows` |
| `20260830200000_funnel_seven_statuses` | Recorta `LeadStatus` para 7 valores; leads em RESPONDED/NO_INTEREST/INVALID_NUMBER viram CONTACTED |
| `20260830220000_interaction_opened` | Adiciona `OPENED` ao enum `InteractionResult` |
| `20260903180000_campaigns_inbox` | WhatsApp, campanhas, conversas, mensagens, roteamento, opt-out |
| `20260903190000_whatsapp_evolution_qr` | Provider EVOLUTION, sessão QR_CODE, campos qrCode / providerInstanceName / lastConnectedAt |
| `20260903200000_baileys_optional_lead` | Provider BAILEYS; `Conversation.leadId` opcional |
| `20260903210000_campaign_recipient_limit` | `Campaign.recipientLimit` (limite de destinatários; nulo = todos elegíveis) |
| `20260907180000_campaign_follow_up` | Template, atraso e status de retorno (`followUp*`) na campanha e no destinatário |
| `20260908120000_campaign_follow_up_delay_default` | Default de `followUpDelayHours` de 3 para 2 (linhas antigas não mudam) |
| `20260907190000_whatsapp_media` | `MediaAsset`; `MessageTemplate.mediaId`; `Message.mediaId`; `MessageKind` IMAGE/VIDEO/AUDIO |

## 5. Autenticação e autorização

Login por e-mail e senha. Hash `bcryptjs` com 12 rounds. Sessão JWT de 8 horas (um turno).

Usuário inexistente, inativo e senha errada devolvem **a mesma** resposta: o sistema não confirma
se uma conta existe para quem está tentando adivinhar.

Rate limit de login: 8 tentativas por 5 minutos, contadas **por e-mail** e não por IP — atrás de
NAT o escritório inteiro compartilha o mesmo IP.

### Escopo por papel

| Papel | Enxerga | Escreve | Reatribui | Importa | Campanhas | Inbox | WhatsApp contas | Supervisão |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ADMIN | toda a base | qualquer lead | sim | sim (planilha e agenda WhatsApp) | sim | todas | adicionar/reconectar/importar agenda | sim |
| MANAGER | toda a base | qualquer lead | sim | sim (planilha e agenda WhatsApp) | sim | todas | reconectar/importar agenda | sim |
| USER | só leads atribuídos a ele (mesmo Kanban, só os cards dele) | só funil desses leads | não | não | não | só atribuídas; sem telefone | não | não |

**Limitação conhecida:** MANAGER hoje enxerga o mesmo que ADMIN porque não existe entidade `Team`
no modelo. Quando `Team` for criada, `leadScopeWhere` passa a filtrar
`responsavelId in (membros da equipe)`. Está marcado no código em `src/lib/auth/rbac.ts`.

Webhook Chatwoot (`POST /api/webhooks/chatwoot`) e Evolution (`POST /api/webhooks/evolution`)
não usam sessão de usuário: validam segredo de env com comparação em tempo constante.
O QR padrão **não** passa por esses webhooks: o worker Baileys grava `qrCode` no banco e
enfileira inbound em `whatsapp-inbound`. Evolution permanece só para contas legado.

O middleware (`src/middleware.ts`) só redireciona **páginas** sem sessão; **não** é a camada de
autorização. `/api/*` **não entra no matcher**: se o middleware interceptasse `GET /api/events`
sem cookie, o Auth.js copiava `Set-Cookie` vazio e apagava a sessão — `POST /api/leads`
(Salvar contato) virava 401 e a tela mandava de volta ao login. Cada route handler chama
`requireSession()`. 401 de API é JSON legível, não o HTML do login.

## 6. Mapa tela → campo → código

### `/login`

| Campo | Validação | Código |
| --- | --- | --- |
| E-mail | obrigatório, formato de e-mail, minúsculas | `src/features/auth/login-form.tsx` |
| Senha | obrigatória, 1 a 200 caracteres | `src/lib/auth/index.ts` (`authorize`) |

### `/leads` — listagem

Filtro padrão: **somente situação cadastral ATIVA**. A tela mostra uma faixa informando quantas
empresas ficaram de fora e por qual situação, com botão para mostrar todas. Nada é escondido em
silêncio.

| Controle | Parâmetro na URL | Resolvido em |
| --- | --- | --- |
| Busca (nome, WhatsApp, telefone, CNPJ) | `search` | `buildLeadWhere`, `src/server/repositories/lead.repository.ts` |
| Destinatários escolhidos | `ids` (`id1,id2`) | idem; teto 500; campanha e listagem |
| Status | `status` | idem |
| UF | `state` | idem |
| Cidade / Segmento / Origem / Porte | `city`, `segment`, `source`, `porte` | idem |
| Responsável (inclui "sem responsável") | `responsible` (`none` = sem responsável) | idem |
| Tag | `tag` | idem |
| Situação cadastral | `situacao` (`ATIVA` padrão, `all` = todas) | idem |
| Tem WhatsApp / telefone / e-mail | `hasWhatsapp`, `hasPhone`, `hasEmail` | idem |
| Cadastro, último contato, próximo contato (intervalos) | `createdFrom/To`, `lastContactFrom/To`, `nextContactFrom/To` | idem |
| Último resultado da interação | `lastResult` | subquery `DISTINCT ON` em `interactions` |
| Ordenação | `sort`, `dir` | `buildOrderBy` |
| Paginação | `page`, `limit` (10 a 200, padrão 50) | `findLeadPage` |

Os filtros moram na querystring: o link é compartilhável, o botão voltar funciona e o estado
sobrevive a um F5. **Filtrar no JavaScript sobre a lista é proibido** — todo filtro vira `WHERE`
no banco. A paginação por offset tem desempate por `id` para não repetir nem perder linha entre
páginas.

Colunas: checkbox, Empresa (avatar + razão social + nome fantasia `text-2xs`), CNPJ, Telefone, WhatsApp (número), Cidade/UF, Status (funil), Responsável, Próxima ação, Última interação, Ações (ícone ghost de WhatsApp, desabilitado sem celular). Clique na linha e **Enter** abrem o **drawer**
(`src/features/leads/lead-drawer.tsx`). **E** e o botão Editar do drawer vão para
`/leads/:id?edit=1`. **W** foca Próxima ação no drawer. `/leads/:id` permanece para edição,
deep link e “Abrir página completa”. Sócios não são hidratados na seleção da lista — só no detalhe.

**Adicionar contato** (cabeçalho): Nome, WhatsApp e CNPJ opcional. `POST /api/leads` → `createManualLead`.
Exige WhatsApp ou CNPJ válido. O número entra **ao mesmo tempo** em `whatsapp` e `telefone` (campanha
e filtro "Com celular" leem `whatsapp`; a coluna Telefone lê `telefone`). Planilha da Receita continua
separando celular e fixo na importação. Reusa lead existente no escopo do papel (anti-IDOR: USER não
pega lead de outro vendedor). Sem CNPJ da Receita, `origem=MANUAL`, `situacaoCadastral=ATIVA` só para
aparecer no filtro padrão; CNPJ na tabela é "—". Rate limit `RATE_LIMITS.writeHeavy`. UI:
`src/features/contacts/manual-contact-form.tsx`. Planilha da Receita continua em `/import`.
Em **Campanhas**, o mesmo formulário **Incluir na campanha** grava o contato e o coloca em
`audienceFilter.ids`. Na listagem, Gestor/Admin marca linhas e usa **Disparar campanha**.
Na **Inbox**, **Salvar contato** usa o mesmo `createManualLead` (`origem=WHATSAPP_INBOX`) com o
número da conversa — também grava os dois campos.

A barra de filtros é busca + **Filtro** + **Ordenar** + **Opções**; critérios ativos aparecem
como chips `Campo: valor` (remover o chip zera aquele parâmetro na URL). Mesmo contrato de
querystring. Código: `src/features/leads/filter-bar.tsx`, `src/features/leads/filter-model.ts`.

Ações em lote (com seleção ativa): mudar status, atribuir responsável, e **Disparar campanha**
(ADMIN/MANAGER; cria rascunho com `ids` dos selecionados), no máximo 500 por operação.
O resultado informa quantos foram atualizados e quantos ficaram fora do escopo do papel.

### `/leads/:id` — detalhe

| Bloco | Campos | Origem |
| --- | --- | --- |
| Empresa | CNPJ, situação cadastral, razão social, nome fantasia, natureza jurídica, abertura, capital social, porte, optante Simples/MEI | Receita, leitura |
| Contato | telefone, WhatsApp, e-mail, todos os telefones da planilha | Receita, editável |
| Endereço | logradouro, número, complemento, bairro, cidade, UF, CEP, IBGE | Receita, editável |
| Atividade econômica | CNAE principal (código e descrição), segmento, CNAEs secundários | Receita, leitura |
| Sócios | lista | Receita, leitura |
| Situação no funil | status, próximo contato, responsável | CRM, editável, salva na hora |
| Rastro | cadastrado, atualizado, último contato, origem | sistema, leitura |

Edição pelo botão **Editar** (ou tecla `e` na listagem) usa React Hook Form + Zod
(`leadUpdateSchema`) e envia **apenas os campos alterados**: um PATCH com o objeto inteiro
sobrescreveria campo que outro usuário mudou entre o carregamento e o salvamento.

Status, próximo contato e responsável salvam imediatamente, sem botão de confirmar: são as três
decisões que o vendedor toma dezenas de vezes por dia.

Histórico de interações: canal, resultado, anotação e agendamento de retorno.

Avanço automático do funil (`suggestedStatusFromResult` / `outboundSendSuggestedStatus`): `SENT`,
`NO_RESPONSE` e `CALLBACK` sugerem `CONTACTED` **somente** se o funil atual for `NEW` ou
`READY_TO_CONTACT`. O mesmo `SENT` aplica no disparo da campanha e no Enviar da Inbox (sem
criar interação extra). `OPENED`, `RESPONDED`, `NO_INTEREST`, `INVALID_NUMBER` e `OTHER` **não**
alteram o funil — o vendedor move Qualificado / Perdido no Kanban **ou no
select Funil da Inbox**. Admin/gestor também usam drawer, Editar e lote. Status explícito no payload (Kanban, painel, lote, Inbox) continua
forçando o funil. `NO_RESPONSE` / `CALLBACK` ainda criam follow-up (+2 dias / +1 dia)
se não houver data informada. Terminais do funil: só `CUSTOMER` e `LOST`.

WhatsApp: preview do template com `{{vendedor}}` = nome da sessão. `POST /api/leads/:id/whatsapp`
escolhe o modo no servidor:

- Conta CONNECTED (`provider` ≠ `LEGACY_MANUAL`): envia pelo gateway, cria/reusa conversa
  (`leadId` + conta, status ≠ RESOLVED), grava interação `SENT` e devolve `{ mode: 'connected', conversationId }`.
  Se o template tem foto/vídeo, o servidor resolve o `mediaId` (o cliente não manda o arquivo de novo).
  USER sem dono na conversa é atribuído (`TAKE`) para a Inbox listar. Botão **Enviar**. Sem
  “Marcar enviado”; em seguida os chips de resultado.
- Sem sessão: registra `OPENED` ("Ação iniciada"), devolve `{ mode: 'manual', whatsappUrl }` e a UI
  abre o `wa.me`. Template com mídia **não** abre wa.me (erro: precisa da conta QR). **Marcar enviado** faz `PATCH` da interação para `SENT`.

Sem celular válido o botão fica desabilitado com o motivo visível. Código: `sendLeadWhatsapp` em
`src/server/services/conversation.service.ts`, UI em `src/features/messages/whatsapp-composer.tsx`.

Drawer (lado direito, ~448px): header com avatar + razão + CNPJ `.numeric`; corpo em
`PropertyRow`; timeline; rodapé **Próxima ação** (status, follow-up, composer WhatsApp:
**Enviar** se houver sessão, senão OPENED → SENT no wa.me) e Editar. WhatsApp preenchido só no drawer; na tabela é ghost/ícone.
Paleta Cmd+K: grupo **Empresas** via debounce `GET /api/leads?search=&limit=8` (`leadsApiUrl`);
Enter abre `/leads/:id`. 401 e vazio tratados, sem lista fake. Código: `src/components/shell/command-palette.tsx`.

### `/import` — importação

Quatro passos: **arquivo → mapeamento → prévia → execução**. Só ADMIN e MANAGER acessam.

| Passo | O que acontece | Código |
| --- | --- | --- |
| 1. Arquivo | Upload `.xlsx`/`.xlsm` até 25 MB, guardado em `uploads/<uuid>.xlsx`. Chave "somente empresas ativas" ligada por padrão | `src/app/api/import/upload/route.ts`, `src/server/services/import/storage.ts` |
| 2. Mapeamento | Detecção automática por nome de cabeçalho normalizado (sem acento, sem caixa, sem pontuação), sobrescrevível campo a campo | `src/server/services/import/columns.ts` |
| 3. Prévia | Contadores, situações, duplicados, avisos e 20 primeiras linhas. **Nada é gravado** | `buildPreview` |
| 4. Execução | Responde na hora com o id do job; a carga roda em segundo plano e o progresso fica em `ImportJob` | `src/app/api/import/run/route.ts`, `runImport` |

O arquivo temporário é apagado ao fim da execução, e sobras com mais de 6 horas são limpas no
próximo upload.

### `/dashboard`

`GET /api/dashboard` devolve 8 KPIs de `COUNT` no recorte + funil (`groupBy` status) + atividade
de hoje (`COUNT` de interações) + próximas 8 ações (`take: 8`). Sem gráfico de UF, responsável ou
7 dias nesta tela — isso permanece em Relatórios. Primeiro viewport: FilterBar (chips + Filtro /
Ordenar / Opções); 8 KPIs (Leads,
Com WhatsApp, Para contato hoje = `nextContactAt` no dia, Contatados, Responderam = último
resultado `RESPONDED`, Qualificados, Clientes, Follow-ups atrasados); barras HTML do funil.
Clique no KPI ou na barra aplica o mesmo filtro na URL (`setFilter`) ou abre `/follow-ups?tab=overdue`.
Número de contato é zero até existir `Interaction` — não há mock nem variação percentual inventada.

Código: `src/features/dashboard/dashboard-screen.tsx`, `src/app/api/dashboard/route.ts`.

### `/kanban`

Sete colunas de funil, 40 cards por página, “Carregar mais” incremental. Os filtros da listagem
vão na querystring de `GET /api/kanban` (`column` = status da coluna; `status` e os demais critérios
passam por `buildLeadWhere`). `overdueCount` é `COUNT` no recorte, não derivado dos cards carregados.
Arrastar chama `PATCH /api/leads/:id/status` (RBAC + audit log + invalidação). O mesmo funil
também muda na Inbox (`PATCH /api/conversations/:id/lead-status`, quem pode escrever na
conversa) e avança sozinho Novo/Pronto → Contatado no disparo de campanha e no Enviar da
Inbox (`src/server/services/lead-funnel.ts`). USER só vê cards **atribuídos a ele**, **sem telefone**, sem linha de responsável (todos os cards são dele)
e sem filtro Responsável. Coluna vazia: “Nenhum lead seu em {status}.” Não abre o drawer.
Admin/gestor: **o mesmo quadro** lista a base inteira (os deles e os dos demais). Cada card traz
`mine` e o rótulo **Você** / nome do responsável / Sem responsável — também no modo compacto.
Podem arrastar qualquer card (`canWriteLead` true). Duplo clique abre o drawer; o card expandido
mostra cidade/UF, telefone, ResultBadge, responsável e próxima ação. Compacto/Encerrados são `ghost`
com `aria-pressed`, não `primary`.
Preferência `kanban:compact` e toggle Encerrados (esconde `CUSTOMER`/`LOST`) no IndexedDB.

Código: `src/features/kanban/kanban-screen.tsx`, `src/app/api/kanban/route.ts`.

### `/contacts/today`

Fila priorizada no servidor: atrasado → hoje → lead novo → futuro (`src/lib/priority.ts`).
Resposta `{ items, counts, nextOffset }` com `COUNT` por bucket e página (`limit` 50). Aba na
querystring `bucket`. Popover **Registrar** com os resultados operacionais (mesma mutation
`useRecordInteraction` / `POST /api/leads/:id/interactions`). WhatsApp ghost/ícone, desabilitado sem celular.
Clique no nome abre o drawer. Teclas `j`/`k`/`Enter`. Coluna Empresa = avatar + razão + fantasia.

Código: `src/features/contacts/contacts-today-screen.tsx`, `src/app/api/contacts/today/route.ts`.

### `/follow-ups`

Abas Atrasados / Hoje / Próximos / Todos com `COUNT` SQL + lista paginada (`page`/`limit` 50).
Filtros de status do lead, UF e responsável na querystring. Ações na linha: WhatsApp (ícone), popover
**Registrar** (mesma mutation de interação), reagendar +1/+3/+7, Concluir e Cancelar. Atraso destacado. Nome da empresa abre o drawer.
Abas secundárias Concluídos / Cancelados.

Código: `src/features/follow-ups/follow-ups-screen.tsx`, `src/app/api/follow-ups/route.ts`.

### `/messages`

CRUD de template (ADMIN/MANAGER). USER só lê e usa no envio. Variáveis `{{razaoSocial}}` etc. em
`src/lib/template.ts`, inclusive `{{vendedor}}` (nome da sessão). Preview no editor com valores de
exemplo. Excluir pede confirmação com o **nome** do template. Os três textos do seed continuam rascunho operacional.
Anexo opcional: **uma foto ou um vídeo** (`POST /api/media`, depois `mediaId` no CRUD). O texto vira
legenda. Áudio não entra no template. Limites: foto 5 MB (JPEG/PNG/WebP), vídeo 16 MB (MP4).
Arquivo em `data/media/<uuid>.ext`. Leitura autenticada em `GET /api/media/:id`.

### `/reports`

Produtividade no intervalo (padrão 30 dias): interações, enviados, respostas, taxa. Exportação
CSV/XLSX em `GET /api/export` respeita filtros da listagem e rate limit `RATE_LIMITS.export`.
Leitura por cursor de 500. Ações em lote extras: tag (`POST /api/leads/bulk/tags`) e follow-up
(`POST /api/leads/bulk/follow-ups`).

### `/settings`

ADMIN cria usuário, troca perfil e ativa/desativa. Não dá para rebaixar o último administrador.
Entidade `Team` não existe: MANAGER continua vendo a base inteira. Usuários ficam só aqui —
não há segundo cadastro de contas.

### `/campaigns` e `/campaigns/:id` — Campanhas (ADMIN/MANAGER)

Rascunho em **uma tela** (sem wizard): Público (`FilterBar` + COUNT + amostra 20, com checkbox)
→ cadastro manual no próprio rascunho (entra em `ids`) → Quantidade (`recipientLimit`, vazio =
todos com WhatsApp) → Mensagem (template) → Retorno (outro template + horas, padrão 2) →
Distribuição → Conta WhatsApp (só `sessionStatus=CONNECTED` e `provider` ≠ `LEGACY_MANUAL`)
→ Salvar / Iniciar. Depois do primeiro lote: **Adicionar mais** N do mesmo público, sem
repetir `leadId` já nesta campanha.

QR **não** abre nesta tela: conectar em `/whatsapp`. Iniciar recusa conta desconectada ou manual.

| Aba / seção | Campo | O que é | Obrigatório | De onde vem | Regra / bloqueio | Onde olhar |
| --- | --- | --- | --- | --- | --- | --- |
| Público | Filtros / `ids` | Recorte da base ou lista escolhida | Não | `GET /api/campaigns/audience` | Sem `ids` o filtro inteiro dispara; com `ids` só esses leads. Só WhatsApp entra na fila | `campaign-detail-screen.tsx`, `buildLeadWhere` |
| Público | Incluir na campanha | Cadastro manual no rascunho | Não | `POST /api/leads` | Grava o contato e coloca o id em `audienceFilter.ids` | `manual-contact-form.tsx` |
| Quantidade | Enviar para no máximo | Primeiros N elegíveis do rascunho | Não (vazio = todos) | `Campaign.recipientLimit` | Inteiro 1–100000; ordem por `id`. Só o primeiro lote. UI estima `ceil(N/5)` min | `takeRecipientLimit`, `estimateCampaignMinutes` |
| Próximo lote | Adicionar mais | Novos destinatários na mesma campanha | Não | `POST /api/campaigns/:id/recipients` | Recusa rascunho e cancelada. Exclui `leadId` já materializado (`nextRecipientBatch`). Pausada: cria `PENDING` e espera Retomar. Concluída volta a `RUNNING` | `addCampaignRecipients` |
| Quantidade | Ritmo | 5 disparos/min | — | constante | Worker, não a API. Inbox fora | `CAMPAIGN_SENDS_PER_MINUTE`, `workers/campaign-worker.ts` |
| Mensagem | Template | Texto da campanha | Sim para iniciar (ou mídia) | `GET /api/templates` | Se o template tem foto/vídeo, o disparo manda essa mídia + legenda (uma mensagem por destinatário) | `campaign.service.ts`, `campaign-send.ts` |
| Retorno | Template de retorno | Segunda mensagem, outro template | Sim na UI para iniciar | `GET /api/templates` | Distinto do primeiro. Só quem `SENT`/`DELIVERED`, não respondeu, passou `followUpDelayHours` (1–72, padrão 2). Agenda sozinho no `SENT` | `scheduleAutomaticFollowUp`, `campaign-send.ts` |
| Retorno | Esperar (horas) | Espera após a primeira mensagem | Sim (default 2) | `Campaign.followUpDelayHours` | Delayed job BullMQ. **Disparar retorno agora** é catch-up. Pausada: Retomar reagenda | `campaign-detail-screen.tsx` |
| Distribuição | routingMode | Quem assume resposta | Sim (default Manual) | enum | MANUAL / CURRENT_OWNER / RULES / ROUND_ROBIN | `constants/campaign.ts` |
| Conta WhatsApp | Conta que envia | Sessão do disparo | Sim para iniciar | `GET /api/whatsapp/accounts` | CONNECTED; sem LEGACY_MANUAL | `isConnectedSendableAccount` |

| Ação | API | Código |
| --- | --- | --- |
| Listar / criar | `GET/POST /api/campaigns` | `src/server/services/campaign.service.ts` |
| Contagem de público | `GET /api/campaigns/audience` | idem + `buildLeadWhere` |
| Editar rascunho | `PATCH /api/campaigns/:id` | inclui `recipientLimit` |
| Template / atraso de retorno | `PATCH /api/campaigns/:id` | `followUpTemplateId` e `followUpDelayHours` aceitos depois do rascunho. O template da primeira onda continua congelado. |
| Iniciar / pausar / retomar / cancelar | `POST .../start\|pause\|resume\|cancel` | BullMQ; exige Redis; 0 destinatários = 422. `start` também reenfileira `PENDING`/`QUEUED` se o status já for RUNNING (start anterior falhou no meio). Retomar reagenda retorno automático com o delay restante. |
| Adicionar lote | `POST .../recipients` | ADMIN/MANAGER. `{ count }`. Mesmo rate limit de início. Recusa rascunho e cancelada. Sem lista de IDs no body — o servidor corta quem já está na campanha. |
| Disparar retorno | `POST .../follow-up` | ADMIN/MANAGER. Catch-up. Mesmo rate limit de início. Mesma fila `campaign-send` (não soma 5+5). Recusa rascunho, pausada e cancelada. Template de retorno ≠ primeiro. Recalcula elegíveis no servidor (sem lista de IDs no body). Pausada: **Retomar** antes. |
| Métricas | `GET .../metrics` | COUNT recipients + funil Lead + `remainingEligible` + `followUpEligible` / `followUpWaitingDelay` / `followUpSent` / `followUpFailed` |
| Destinatários | `GET/POST .../recipients` | tabela densa server-side; `GET` aceita `status`; `POST` adiciona lote |

UI: `src/features/campaigns/*`. Worker: `src/server/queue/processors/campaign-send.ts` +
`workers/campaign-worker.ts` (teto 5/min). Em envio, a tela mostra ritmo e minutos restantes
a partir de `metrics.pending`. `wizardStep` permanece no banco por compatibilidade; a UI não
navega por passos.

### `/inbox` e `/inbox/:conversationId` — Inbox

Três colunas: lista, thread, contexto do lead (`PropertyRow` + select **Funil**) — ou formulário
**Salvar contato** se a conversa não tem lead. Status de conversa ≠ funil: o selo (Aguardando /
Em atendimento / Resolvida) não é o Kanban. Quem pode escrever na conversa altera o funil do
lead na hora (`PATCH /api/conversations/:id/lead-status`). Sem permissão o select explica:
“Assuma a conversa para alterar o funil.”
Atalhos: `j`/`k`, `r` responder, `a` assumir, `t` transferir, `c` resolver.

USER só lista conversa com `assignedUserId` dele. **Não vê telefone** (API devolve `phone: null`).
Não vê fila sem dono, não vê conversa de outro vendedor, não transfere, não salva contato,
não abre a ficha do lead. Responde e move o funil. ADMIN/MANAGER vê tudo, transfere e vê o número.

| Ação | API |
| --- | --- |
| Lista / detalhe | `GET /api/conversations`, `GET /api/conversations/:id` |
| Mensagens | `GET/POST .../messages` |
| Mídia | `POST /api/media`, `GET /api/media/:id` |
| Assumir / transferir / resolver / reabrir | `POST .../take\|transfer\|resolve\|reopen` |
| Funil do lead | `PATCH .../lead-status` |
| Ligar contato (conversa sem lead) | `POST .../contact` |

UI: `src/features/inbox/*`. Roteamento: `src/lib/routing/*` + worker `conversation-routing`.
Bolha outbound: data + `messageDeliveryLabel` (Enviada / Entregue / Lida / Falhou) — nunca o enum cru.
Composer: texto e/ou foto, vídeo, áudio (gravação `MediaRecorder` → `audio/webm`). Enviar habilitado
com texto **ou** mídia. Bolha mostra `<img>` / `<video>` / `<audio>` via `GET /api/media/:id` (sessão).
Inbound Baileys baixa a mídia, grava `MediaAsset` e deixa de mostrar só o rótulo "Imagem".
Evolution/Chatwoot/wa.me **não** enviam arquivo (erro honesto). Worker: `workers/baileys-session.ts`.

### `/whatsapp` — contas

Lista densa só de contas **BAILEYS** (WhatsApp Web QR). Adicionar conta só ADMIN: nome + telefone
opcional. Sem select de provedor. MOCK, CHATWOOT e LEGACY_MANUAL continuam no enum Prisma para
registros antigos, mas **não** entram na lista nem no POST de criar.

Envio do lead (`POST /api/leads/:id/whatsapp`) escolhe a conta BAILEYS `CONNECTED` com heartbeat
mais recente. Sem essa conta, cai no `wa.me`. Se o worker não tem o socket aberto (`sock.user`),
tenta reabrir a sessão (~12 s) antes de recusar. Inbox (`POST /api/conversations/:id/messages`)
não exige `CONNECTED` no banco: manda o comando e o worker reabre se houver credencial; o send
ok grava `CONNECTED`.

| Ação | API | Código |
| --- | --- | --- |
| Listar / criar | `GET/POST /api/whatsapp/accounts` | `whatsapp.service.ts` |
| Conectar (QR no worker) | `POST .../connect` | `BaileysGateway` → Redis `crm:whatsapp:session` → `workers/baileys-session.ts` |
| Novo QR | `POST .../qr` | mesmo fluxo de connect |
| Desconectar | `POST .../disconnect` | logout Baileys + apaga `data/whatsapp-auth/<id>/` |
| Importar agenda como leads | `POST .../import-contacts` | `whatsapp-contacts.service.ts` → comando Redis `list-contacts` (sem `send`) |

**Importar contatos** (ADMIN/MANAGER, sessão `CONNECTED`): no clique o worker sincroniza a
agenda da conta (`resyncAppState`) e junta chats 1:1, histórico, bloqueados e `lid-mapping`.
**Não envia mensagem.** Cada número BR vira lead (`origem=WHATSAPP`, `NEW`) ou casa com a
planilha pelo telefone — sem duplicar. Grupos e broadcast ficam de fora. Sem telefone BR: erro.
Timeout ~90 s se o worker não responder (`npm run dev` + container `crm-worker`). Cache
`data/whatsapp-auth/<id>/contact-cache.json`. Teto 10_000. Código: `src/lib/whatsapp/contacts.ts`.
Número da agenda do celular **sem WhatsApp** não entra (o Web só vê quem tem conta).

O Next **não** abre socket WhatsApp. Sem o container `crm-worker` + Redis (`crm-redis` na 6379),
Conectar devolve erro legível e **não** marca a conta como Falhou só porque o Redis estava
desligado no boot. O cliente Redis do Next reconecta se o container subir depois.
Sessão em disco gitignored. No boot o worker reabre socket se a conta está CONNECTED/CONNECTING/QR_CODE
ou se `creds.json` ainda existe — senão o celular continua pareado e a Inbox não recebe nada.
Dois workers não abrem o mesmo aparelho: lock Redis `crm:whatsapp:owner:<conta>` (TTL 45 s).
Não rode `npm run worker` na máquina junto com `crm-worker`. O segundo processo ignora a sessão; o send pub/sub fica com o dono.
Após o scan, Baileys manda 515: o worker reconecta sozinho, sem novo QR. A tela mostra
“Pareamento ok. Reiniciando sessão…” em `CONNECTING` depois de ter exibido o QR — não é falha.
Polling da UI: 2,5 s enquanto `QR_CODE` / `CONNECTING`; **8 s** nos demais status (Conectada e
Desconectada), inclusive no botão Enviar do lead (`useHasConnectedWhatsApp`). Se o SSE estiver
`idle` (sem sessão), o poll ainda atualiza o status. O segundo worker não abre outro socket (lock Redis).
Mapeamento close → status: `src/lib/whatsapp/session-status.ts`.

UI: `src/features/whatsapp/whatsapp-screen.tsx` — ajuda no topo (“QR → Conectar → escanear”);
copy do QR “Escaneie no WhatsApp → Aparelhos conectados”. Sem campo de API key. Sem rodapé
que mistura status da primeira conta da lista.

### `/admin/atendimento` — Supervisão (MANAGER/ADMIN)

KPIs COUNT de todas as conversas (`Abertas` = OPEN+WAITING, `Em atendimento` = OPEN,
`Sem responsável` = sem `assignedUserId` e não RESOLVED, `Resolvidas` = RESOLVED).

Tabela por responsável: **qualquer usuário ativo**, inclusive ADMIN, e inativo que ainda
tenha conversa atribuída. Não filtra `USER`/`MANAGER` — Inbox **Assumir** aceita o
administrador, e o seed padrão só cria ADMIN. Clique no nome abre
`/admin/atendimento/:userId`. Sem linhas: estado vazio + link para Configurações.

API: `GET /api/admin/atendimento`, `GET /api/admin/atendimento/:userId`.
Código: `src/features/admin/supervision-screen.tsx`,
`src/server/services/supervision.service.ts`, `src/lib/supervision.ts`.

## 7. Regras da importação

| Campo | Regra |
| --- | --- |
| CNPJ | só dígitos, 14 posições, dígito verificador conferido. Inválido rejeita a linha |
| `phones` | string separada por vírgula no formato `DDD-numero`, cada um validado |
| `whatsapp` | primeiro celular da lista (DDD válido + 9 dígitos começando em 9). Contato Inbox/manual grava o mesmo número em `whatsapp` e `telefone`. |
| `telefone` | primeiro telefone válido da lista |
| `email` | minúsculas, formato validado. Inválido é **descartado com aviso**, não rejeita a linha |
| `dataAbertura` | convertida para data. Formato irreconhecível fica nulo |
| `capitalSocial` | decimal |
| `socios`, `cnaeSecundarios` | arrays |
| `segmento` | recebe a descrição do CNAE principal |
| `porte` | normalizado para Micro Empresa / Empresa de Pequeno Porte / Demais |
| colunas sem campo correspondente | vão inteiras para `rawImport` (JSON), nada é perdido |

Comportamento do job:

- **Linha inválida não derruba a importação.** Vira registro em `ImportError` com número da linha,
  campo e motivo.
- **Duas severidades.** `ERROR` = a linha foi rejeitada e o lead não entrou. `WARNING` = o lead
  entrou, mas um campo inválido foi descartado. Sem essa distinção, um e-mail com espaço no meio
  desapareceria sem deixar rastro.
- **Deduplicação por CNPJ.** Dentro do arquivo, só a primeira ocorrência entra e as linhas
  repetidas aparecem na prévia. Contra o banco, `createMany` com `skipDuplicates`: reimportar a
  mesma planilha não duplica lead nem gera erro.
- **Inserção em lote** de 500 em 500. Insert linha a linha é proibido.
- **Retomada.** `ImportJob.offset` guarda quantas linhas já entraram. Se o processo cair no meio,
  a execução seguinte não reprocessa o que já foi gravado.
- **Filtro de ativas.** Ligado por padrão. O resumo mostra quantas empresas ficaram de fora e por
  qual situação cadastral.

## 8. Cache, auditoria e limites

| Recurso | Configuração | Código |
| --- | --- | --- |
| Cache de listagem | 45 s, chave por papel + usuário + hash dos filtros | `src/lib/cache/index.ts` |
| Cache de detalhe | 60 s, invalidado na escrita por tag do lead | idem |
| Cache de dashboard/relatórios | 60 s | idem |
| Cache de facetas | 5 min | idem |
| Rate limit de login | 8 / 5 min por e-mail | `RATE_LIMITS.login` |
| Rate limit de importação | 5 / 10 min por usuário + IP | `RATE_LIMITS.import` |
| Rate limit de exportação | 10 / 10 min por usuário + IP | `RATE_LIMITS.export` |
| Rate limit de início de campanha | 8 / 10 min por usuário | `RATE_LIMITS.campaignStart` (também `POST .../follow-up` e `POST .../recipients`) |
| Cadência de disparo de campanha | 5 / min (1 a cada 12 s), fila inteira | `CAMPAIGN_SENDS_PER_MINUTE`, `workers/campaign-worker.ts` |
| Rate limit de webhook | 120 / min por IP | `RATE_LIMITS.webhook` |
| Rate limit de escrita comum | 60 / min por usuário | `RATE_LIMITS.writeHeavy` (`POST /api/leads`, `POST /api/conversations/:id/contact`) |
| Rate limit de upload de mídia | 20 / 10 min por usuário + IP | `RATE_LIMITS.mediaUpload` (`POST /api/media`) |
| Auditoria | `lead.*`, `interaction.*`, `followup.*`, `template.*`, `user.*`, `import.*`, `campaign.*`, `conversation.*`, `whatsapp.*` | `src/server/services/audit.service.ts` |
| SSE | `GET /api/events`, canal Redis `crm:events` (subscriber único por processo; tags: leads, campaigns, conversations, whatsapp, import-jobs, …) | `src/lib/events.ts`, `src/lib/events-bus.ts`, `src/lib/event-query-keys.ts` |

A auditoria grava o diff campo a campo (`{ campo: { from, to } }`), não o registro inteiro. Falha
ao gravar auditoria é logada mas não desfaz a operação do usuário: perder o log é problema de
observabilidade, não motivo para reverter escrita já confirmada.

TanStack Query no cliente com `refetchOnWindowFocus` desligado. Mutação publica evento Redis; o
`EventsBridge` (só no AppShell logado) lê `GET /api/events` com **fetch + cookie**, não
`EventSource`. Sem sessão o handler devolve SSE `idle` **200** com `retry: 30000` — nunca 401
JSON, que reconectava em loop e lotava o terminal. Evento `idle` espera 30 s antes de tentar
de novo. 401 residual também espera 30 s e **não** vira toast.
O subscriber Redis é **um por processo** (`src/lib/events-bus.ts`) e só chama `SUBSCRIBE`
depois do socket `ready`. Assinar na hora do `new Redis` (com `enableOfflineQueue: false`)
descartava o comando: o SSE ficava pingando e as outras telas não atualizavam.
O mapa tag → query (`src/lib/event-query-keys.ts`) cobre Leads, Kanban, timeline, Dashboard,
Contatos, Follow-ups, Campanhas, Inbox, Supervisão (`admin`), WhatsApp e Importar.
A mesma aba também invalida essas keys no `onSuccess` da mutação, sem esperar o eco SSE.
Importação de planilha publica `notifyChange` (não só apaga cache Redis). Mudar o funil na
Inbox publica tag de conversa **e** de lead.
Sem Redis o SSE só manda heartbeat e o cliente segue com o `staleTime` de cada hook.
**Polling** permanece só no job de importação (1 s enquanto `PENDING`/`RUNNING`).

Templates e último template usado podem ir para IndexedDB (`src/lib/idb.ts`); falha local não
quebra o fluxo.

## 9. O que não está implementado

| Item | Situação |
| --- | --- |
| Entidade `Team` | MANAGER vê a base inteira, igual ADMIN. Marcado em `leadScopeWhere`. |
| Push / e-mail de follow-up | A fila e a lista mostram atraso; não há disparo externo. |
| Fórmula de `score` | Campo existe, permanece 0. |
| Playwright E2E do funil completo | Vitest cobre parser, CNPJ, telefone, template e fila. Playwright está na dependência, sem spec estável neste ambiente. |
| Fila BullMQ | Job de importação ainda roda no processo do Next. |

Nenhum botão finge funcionar. Preferências de notificação em Configurações continuam declaradas
como não implementadas.

## 10. Teclado

| Tecla | Ação |
| --- | --- |
| `Ctrl/Cmd + K` | Paleta de comandos (busca empresa via API, telas, status, tema) |
| `/` | Focar a busca |
| `j` / `k` (ou setas) | Próxima / anterior linha |
| `Enter` | Abrir o drawer do lead da linha |
| `e` | Abrir `/leads/:id?edit=1` |
| `x` | Marcar a linha para ação em lote |
| `w` | Focar Próxima ação no drawer |
| `Esc` | Fechar a camada do topo |

Contrato em `src/constants/shortcuts.ts`. Atalho de linha nunca dispara com foco em campo de
texto (`isTypingTarget`).

## Como usar no dia a dia

Tutorial botão a botão para o cliente (Administrador, Vendedor e Gestor):
[`docs/como-usar-o-sistema.md`](docs/como-usar-o-sistema.md). Setup de TI fica no apêndice
desse arquivo. Senha e e-mail de seed **não** entram no guia.

Jornada curta por perfil (espelho do guia; se divergir, o guia e esta fonte precisam
fechar juntos):

1. **Todos.** Login em `/login` (e-mail + senha + Entrar). Admin/gestor abre em `/leads`; vendedor em `/kanban`. Sessão de 8 h.
   Sair: iniciais no canto superior direito → Sair. Paleta: Ctrl/Cmd+K (vendedor só navega telas).
2. **Administrador.** Configurações → Usuários → Criar usuário (único cadastro de pessoa).
   Importar planilha em quatro passos. WhatsApp → conta **WhatsApp Web (QR)** (telefone
   opcional) → **Conectar** → escanear QR (`docker compose up -d`: Redis + `crm-worker`). Com a sessão
   Conectada, **Importar contatos** grava todos os números da conta (agenda + 1:1) como leads
   (não envia mensagem; casa telefone com a planilha). Evolution não
   é o fluxo. MOCK para teste sem enviar. Campanhas → uma tela (público, quantidade, template,
   retorno 2 h, distribuição, conta CONNECTED) → Iniciar (Redis + worker). Ritmo fixo: 5
   contatos/min (100 ≈ 20 min). Depois: **Adicionar mais** no mesmo público; retorno sai sozinho.
3. **Vendedor.** Só **Kanban** e **Inbox**. No Kanban só os cards atribuídos a ele (não vê os dos
   outros no mesmo quadro). Arrasta o funil; responde na conversa. Não vê telefone,
   não vê a lista de leads, não vê fila sem dono, não transfere, não salva contato, não acessa
   Contatos, Follow-ups, Dashboard, Relatórios, Mensagens, WhatsApp, Importar, Supervisão nem
   Configurações. Funil ≠ selo da conversa.
4. **Gestor.** Campanhas, Inbox, Supervisão, importação (planilha e agenda WhatsApp), reatribuição. Sem bloco Usuários.
   Sem entidade Team: vê a base inteira.

## 11. Segredos

`.env` está no `.gitignore`. O arquivo local é `.env` na raiz deste repositório.
Apenas `.env.example` é versionado, sem valores reais. Nenhuma variável usa prefixo
`NEXT_PUBLIC_`, então nenhuma credencial chega ao navegador.

`AUTH_SECRET` é gerado por `npm run auth:secret`, que grava direto no `.env` **sem imprimir o
valor**. Não use `npx auth secret`: hoje esse nome resolve para o CLI de outro projeto
(`better-auth`) e imprime o segredo no terminal.

## 12. Verificação

Na raiz deste repositório:

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run design:check  # impeccable detect src/
npm run test          # Vitest
npm run db:status     # estado das migrations
npm run build         # build de produção
```

Resultado na entrega 0.16.10 — **Kanban único**: ADMIN/MANAGER veem todos os leads no mesmo
quadro e atualizam qualquer card; o responsável aparece no card (**Você** vs nome). USER só vê
e move os atribuídos a ele; coluna vazia diz “Nenhum lead seu”.
Resultado na entrega 0.16.9 — **Lotes e retorno automático**: **Adicionar mais** N na
mesma campanha (quem já recebeu fica de fora). Template de retorno no rascunho; depois do
primeiro envio o retorno sai sozinho em 2 h se não houver resposta. Destinatários filtram
por status. **Disparar retorno agora** é catch-up.
Resultado na entrega 0.16.8 — **Vendedor** só opera **Kanban** e **Inbox**: leads atribuídos,
sem telefone na API/UI, sem lista da base, sem o restante do menu. Middleware e serviços recusam o resto.
0.16.7 — **Telas ao vivo**: SSE assina Redis depois de `ready`
(antes o `SUBSCRIBE` falhava e Inbox/Leads/Kanban/Campanhas pareciam isolados). Importação
e funil da Inbox avisam as outras telas; Supervisão escuta conversas.
Resultado na entrega 0.16.6 — Worker Baileys no container `crm-worker` (`docker compose up -d`
com o Redis). `npm run worker` no terminal só como fallback de debug; os dois juntos brigam pelo lock.
0.16.5 — Inbox do **vendedor** lista as conversas dele **e** a fila
sem responsável (`Todas` / `Sem responsável`). `Minhas` continua só as atribuídas. Responder
exige **Assumir**. Conversa de outro vendedor segue só na Supervisão.
0.16.3 — **Importar contatos** puxa a agenda da conta WhatsApp
(app state) + conversas 1:1 no clique; grupos ficam de fora.
0.16.2 — Importar agenda exige **dois** terminais (`dev` + `worker`);
histórico completo e cache da agenda no disco do worker.
0.16.1 — **Importar contatos** resolve telefone de JID `@lid` (Baileys 7)
e recusa agenda vazia em vez de gravar 0 leads. Religue o worker.
0.16.0 — Template e campanha enviam **uma** foto ou vídeo; Inbox envia foto,
vídeo e áudio (gravação no navegador). Arquivos em `data/media/`. `GET /api/media/:id` exige sessão
e escopo da conversa (USER não baixa mídia de outro vendedor). wa.me recusa template com mídia.
0.15.0 — **Importar contatos** na tela WhatsApp grava a agenda/chats 1:1
como leads (`origem=WHATSAPP`), sem enviar mensagem; casa telefone com a planilha e não duplica.
0.14.1 — Salvar contato (Inbox, Leads, campanha) grava o número em
`telefone` e `whatsapp` juntos; campanha e filtro "Com celular" passam a enxergar o contato.
0.14.0 — Retorno de campanha: segunda mensagem, outro template, botão
**Disparar retorno**, só quem não respondeu e já passou o intervalo (padrão 3 h). Mesma fila
5/min. 0.13.17 — Inbox altera o funil do lead; disparo e Enviar na conversa
avançam Novo/Pronto → Contatado (`markLeadContactedOnOutbound`). Selo da conversa continua
separado do Kanban. 0.13.16 — `GET /api/events` sem sessão responde idle 200 (não 401 em loop
no terminal). 0.13.15 — Iniciar campanha não usa `:` no jobId do BullMQ (o 500
`Custom Id cannot contain :` travava o rascunho e a toast “Só o rascunho aceita…”). Start
reenfileira destinatários QUEUED presos; se o enfileirar falhar sem nenhum envio, o rascunho
volta. 0.13.14 — middleware não intercepta `/api`; SSE sem cookie não apaga
mais o login e Salvar contato deixa de voltar 401. 0.13.13 — SSE de eventos usa fetch autenticado; 401 do EventSource não
aparece mais como “sessão expirada” ao salvar contato. 0.13.12 — close transitório do WhatsApp não marca Desconectada; a tela
poll a cada 8 s e o envio ok regrava Conectada. 0.13.11 — campanha dispara no máximo 5/min (1 a cada 12 s) no worker
BullMQ; a tela estima o tempo restante. Inbox e Enviar no lead ficam fora do teto.
0.13.10 — campanha escolhe destinatários (`ids`) e busca por WhatsApp;
contato novo no rascunho entra no disparo. Em **Leads**, seleção + **Disparar campanha**.
0.13.9 — Supervisão lista ADMIN e inativo com conversa (KPIs e tabela deixam de divergir).
0.13.8 — só WhatsApp Web na tela e no envio do lead. 0.13.7 — QR: 515 reconecta com credencial já gravada; copy pós-scan;
JID `:device` não entra no telefone. 0.13.6 — JID de envio com DDI 55 e `onWhatsApp` (número
inexistente não marca Enviada). 0.13.5 — Campanha em tela única + `recipientLimit`. WhatsApp
do lead: `POST /api/leads/:id/whatsapp` envia pela conta CONNECTED (gateway + conversa +
`SENT`) e só abre `wa.me` sem sessão. 0.13.4: Inbox retoma sessão QR. 0.13.2: contato manual.

## 13. Deploy VPS

Runbook completo (clone, `.env`, Compose, systemd, Nginx, backup, falhas): [`README.md`](README.md).
Não copiar secrets para o git. Templates sem credencial: `deploy/crm.service` e
`deploy/nginx.conf.example`.

| Serviço | Bind |
| --- | --- |
| Nginx | 80 / 443 públicos |
| Next.js | `127.0.0.1:3001` |
| Postgres | `127.0.0.1:5432` (Compose) |
| Redis | `127.0.0.1:6379` (Compose) |
| Worker Baileys | container `crm-worker` |

Evolution (`docker-compose.evolution.yml`) é opcional/legado. Instalação padrão = Baileys.

