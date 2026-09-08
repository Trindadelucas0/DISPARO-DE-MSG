# CRM de prospecção — disparo de mensagens

Repositório para **clonar numa VPS** e hospedar o CRM (leads, campanhas WhatsApp, Inbox, QR).

Este README é o runbook de hospedagem. Se você é um agente de IA, leia a seção seguinte **inteira** antes de instalar qualquer pacote.

Comportamento do produto (telas, regras, RBAC): [`DOCUMENTACAO-SISTEMA.md`](DOCUMENTACAO-SISTEMA.md).  
Guia do dia a dia (vendedor/gestor): [`docs/como-usar-o-sistema.md`](docs/como-usar-o-sistema.md).

---

## Leia isto primeiro (agente)

Este **não** é um microserviço de disparo. É um monólito Next.js 15. Campanha, Inbox e WhatsApp dependem de auth, Prisma, leads e workers. Não extraia pastas. Não reescreva a stack.

O que sobe em produção:

| Processo | Onde | Porta | Papel |
| --- | --- | --- | --- |
| `crm-postgres` | Docker Compose | `127.0.0.1:5432` | Banco |
| `crm-redis` | Docker Compose | `127.0.0.1:6379` | Fila BullMQ, cache, pub/sub do QR |
| `crm-worker` | Docker Compose | — | Baileys (sessão WhatsApp) + filas |
| Next.js | systemd (`npm start`) | `127.0.0.1:3001` | UI + API |
| Nginx | host | `80` / `443` | Único serviço público |

Regras que, se ignoradas, o sistema “sobe” mas não dispara:

1. **Baileys no `crm-worker` é o envio real.** Evolution API **não** é obrigatória. Não instale Evolution “por padrão”.
2. **Campanha exige Redis + worker.** Sem os dois, a API recusa iniciar campanha.
3. **Nunca** rode `npm run worker` no host **e** o container `crm-worker` juntos (lock Redis).
4. **Nunca** versionar nem copiar de outra máquina: `.env`, `node_modules/`, `.next/`, `data/whatsapp-auth/`, `data/media/`.
5. `AUTH_URL` tem que ser a URL **pública HTTPS** (a que o usuário abre). Errar isso quebra login atrás do Nginx.
6. Senha do Postgres no `.env`: `POSTGRES_PASSWORD` e a senha dentro de `DATABASE_URL` **iguais**. Evite `@ : / # %` na senha.
7. Cadência de campanha: **5 disparos por minuto** (1 a cada 12 s). Duas campanhas ao mesmo tempo **dividem** esse teto.

Caminho típico na VPS: `/opt/disparo-de-msg`. Os templates em `deploy/` usam esse path. Se escolher outro, ajuste `deploy/crm.service`.

---

## O que nunca vai para o git

| Item | Motivo |
| --- | --- |
| `.env` | senhas, `AUTH_SECRET`, URL real |
| `node_modules/` | reinstala com `npm ci` |
| `.next/` | build local |
| `data/whatsapp-auth/` | sessão WhatsApp (perder = escanear QR de novo) |
| `data/media/` | foto/vídeo/áudio enviados |
| `*.pem` `*.key` | certificados |
| `logs/` | logs locais |
| planilhas `.xlsx` / `.xls` / `.zip` | dados de terceiros |

O template versionado é **somente** `.env.example` (placeholders, sem valor real).

---

## Pré-requisitos (Ubuntu 22.04 / 24.04)

Instale **nesta ordem**. Portas **públicas**: só 22, 80, 443. **Não** abra 3001, 5432 nem 6379.

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates nginx

# Docker Engine + Compose plugin (documentação oficial Docker, não o pacote docker.io antigo)
# Node 22 (NodeSource ou nvm). engines: Node >= 20.11. Confirme:
node -v    # v22.x
npm -v
docker --version
docker compose version
```

Crie o usuário do systemd (sem login):

```bash
sudo useradd --system --home /opt/disparo-de-msg --shell /usr/sbin/nologin crm || true
```

Firewall (exemplo UFW): `OpenSSH`, `Nginx Full`. Nada mais.

---

## 1. Clone

```bash
sudo mkdir -p /opt/disparo-de-msg
sudo chown "$USER":"$USER" /opt/disparo-de-msg
git clone https://github.com/Trindadelucas0/DISPARO-DE-MSG.git /opt/disparo-de-msg
cd /opt/disparo-de-msg
mkdir -p data/whatsapp-auth data/media
```

Depois do primeiro `docker compose up`, passe a pasta para o usuário `crm`:

```bash
sudo chown -R crm:crm /opt/disparo-de-msg
```

Quem for atualizar com `git pull` precisa de permissão de escrita (sudo -u crm, ou um usuário no grupo `crm`).

---

## 2. Arquivo `.env`

```bash
cd /opt/disparo-de-msg
cp .env.example .env
nano .env
```

Preencha **antes** de subir o Compose:

| Variável | O que colocar |
| --- | --- |
| `POSTGRES_PASSWORD` | senha forte, **sem** `@ : / # %` |
| `DATABASE_URL` | mesma senha, host `127.0.0.1:5432`, db `crm_prospeccao` |
| `AUTH_URL` | `https://SEU_DOMINIO` (sem barra no final) |
| `AUTH_TRUST_HOST` | `true` |
| `SEED_ADMIN_EMAIL` | e-mail do primeiro admin |
| `SEED_ADMIN_PASSWORD` | senha forte, mínimo 10 caracteres |
| `REDIS_URL` | deixe `redis://127.0.0.1:6379` |

Gere o segredo de sessão **sem imprimir o valor**:

```bash
npm ci
npm run auth:secret
```

**Não** use `npx auth secret`. Esse nome hoje resolve para outro CLI e imprime o segredo no terminal.

Permissão do `.env`:

```bash
chmod 600 .env
```

---

## 3. Infra (Postgres + Redis + worker)

```bash
cd /opt/disparo-de-msg
docker compose up -d
docker compose ps
docker compose logs -f worker
```

Esperado: `crm-postgres`, `crm-redis`, `crm-worker` com status healthy / running.

O worker no Compose **não** usa `DATABASE_URL` de loopback. Ele recebe `postgres:5432` na rede Docker. O Next no host usa `127.0.0.1:5432`. Não “corrija” os dois para o mesmo hostname.

---

## 4. Banco e build

Ainda em `/opt/disparo-de-msg`:

```bash
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run build
```

O seed é idempotente: cria admin, tags e templates. Rodar de novo **não** sobrescreve senha de admin já gravada.

Não rode `prisma migrate dev` na VPS (`dev` é fluxo de desenvolvimento e pode pedir nome de migration).

---

## 5. systemd (Next.js)

```bash
sudo cp /opt/disparo-de-msg/deploy/crm.service /etc/systemd/system/crm.service
# Se o clone não está em /opt/disparo-de-msg, edite WorkingDirectory e EnvironmentFile.
sudo systemctl daemon-reload
sudo systemctl enable --now crm
sudo systemctl status crm
```

Conferir localmente (na própria VPS):

```bash
curl -sI http://127.0.0.1:3001/login
```

Deve responder HTTP (200/302/307). Se recusar conexão, veja `journalctl -u crm -e`.

---

## 6. Nginx + TLS

```bash
sudo cp /opt/disparo-de-msg/deploy/nginx.conf.example /etc/nginx/sites-available/crm
sudo nano /etc/nginx/sites-available/crm   # troque SEU_DOMINIO
sudo ln -sf /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/crm
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d SEU_DOMINIO
```

`AUTH_URL` no `.env` tem que bater com o certificado. Depois de mudar `.env`:

```bash
sudo systemctl restart crm
```

---

## 7. Primeiro uso

1. Abra `https://SEU_DOMINIO/login`.
2. Entre com `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
3. **Configurações → Usuários**: crie gestores e vendedores. Não compartilhe a conta admin.
4. **WhatsApp**: Adicionar conta → **WhatsApp Web (QR)** → **Conectar** → escanear no celular.
5. Status tem que ficar **Conectada**. Sem isso, campanha não inicia e o lead cai em `wa.me`.
6. **Mensagens**: revise os templates (os do seed são rascunho, não copy validada).
7. **Campanhas**: público + template + conta CONNECTED → **Iniciar**. Ritmo: 5/min.
8. Respostas aparecem em **Inbox**.

Código **515** logo após escanear o QR é **esperado** (Baileys pede restart). O worker grava a credencial e reconecta. Não apague `data/whatsapp-auth/` nesse momento.

---

## 8. Atualizar (`git pull`)

Não apague volumes Docker nem as pastas `data/`.

```bash
cd /opt/disparo-de-msg
sudo systemctl stop crm
git pull
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
docker compose up -d --build worker
sudo systemctl start crm
sudo systemctl status crm
docker compose ps
```

Se a migration falhar, **não** continue o `systemctl start` até o `migrate deploy` passar. O banco antigo continua; o código novo pode recusar subir.

---

## 9. Persistência e backup

Backup mínimo, parado ou com Postgres consistente:

1. Dump: `docker compose exec postgres pg_dump -U crm crm_prospeccao`
2. Pasta `data/whatsapp-auth/` (sessão QR)
3. Pasta `data/media/` (arquivos enviados)
4. `.env` (fora do git, em cofre)

Volume Docker do Postgres: `crm_pg_data`. `docker compose down -v` **apaga o banco**. Não use `-v` em produção.

Perder `data/whatsapp-auth/` = telefone desconecta. É preciso escanear o QR de novo.

---

## 10. Falhas comuns

| Sintoma | Causa usual | O que fazer |
| --- | --- | --- |
| Campanha não inicia; API fala de Redis/fila | Redis down ou `REDIS_URL` errada | `docker compose ps`; `.env` com `127.0.0.1:6379` |
| QR não aparece / conecta e cai | `crm-worker` parado, ou `npm run worker` no host junto | `docker compose logs worker`; mate o worker extra |
| Worker não fala com o banco | `DATABASE_URL` de loopback **dentro** do container, senha diferente | Compose já injeta `@postgres`. Confira `POSTGRES_PASSWORD` = senha da URL |
| Login loop / CSRF atrás do Nginx | `AUTH_URL` HTTP, domínio errado, ou `AUTH_TRUST_HOST` ausente | HTTPS público no `.env`; `systemctl restart crm` |
| QR some depois de reboot | volume `data/whatsapp-auth` não persistiu | confira bind mount; não rode Compose de outro diretório |
| 515 no log após o scan | restart exigido pelo WhatsApp | esperado; espere reconectar; não apague a pasta da sessão |
| Dois workers, sessão instável | `npm run worker` + container | um só: o container |
| `npx auth secret` imprimiu um valor | CLI errado (better-auth) | ignore esse valor; use `npm run auth:secret` |
| Porta 5432 / 6379 ocupada | outro Postgres/Redis no host | este Compose publica só em `127.0.0.1`. Pare o serviço nativo ou mude a porta **e** o `.env` |

Scripts `scripts/keep-alive.ps1` (e install/uninstall) são **somente Windows**. Na VPS não instale. O processo é systemd + Docker.

`docker-compose.evolution.yml` é legado/opcional. Não suba na instalação padrão.

---

## 11. Comandos úteis

Todos na **raiz deste repositório** (não existe pasta `CRM/`).

```bash
docker compose ps
docker compose logs -f worker
docker compose restart worker
sudo systemctl status crm
sudo journalctl -u crm -e
npx prisma migrate status
npm run db:seed          # idempotente
npm run typecheck
npm run test
```

---

## 12. Arquitetura (mapa rápido)

```
navegador
  → Nginx :443
    → Next.js 127.0.0.1:3001   (UI + /api)
         → PostgreSQL 127.0.0.1:5432
         → Redis 127.0.0.1:6379  (enfileira jobs)
              → crm-worker         (BullMQ + socket Baileys)
                   → data/whatsapp-auth/<accountId>/
                   → data/media/
```

Camadas de código (não furar): UI → hook TanStack Query → `src/app/api/*` → `src/server/services/*` → `src/server/repositories/*` → Prisma.

Gateway WhatsApp: `src/lib/whatsapp/`. Contas operacionais novas: provider **BAILEYS**. Worker: `workers/index.ts`, envio de campanha: `src/server/queue/processors/campaign-send.ts`.

---

## Licença / origem

Código da aplicação de prospecção. Este repositório existe para deploy em VPS (`git clone` / `git pull`). Não commitar secretos.
