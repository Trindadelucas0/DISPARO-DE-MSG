# CRM de prospecção (leads, campanhas, Inbox)

CRM e disparo de mensagens **são o mesmo sistema**. Não existe um segundo app para copiar.
Edite só esta pasta no Cursor (`dash/CRM/`). O GitHub
[`DISPARO-DE-MSG`](https://github.com/Trindadelucas0/DISPARO-DE-MSG) recebe o **mesmo** código
na raiz (`npm run publish:github`). A VPS clona esse GitHub em `/opt/disparo-de-msg`.

Comportamento (telas, regras, RBAC): [`DOCUMENTACAO-SISTEMA.md`](DOCUMENTACAO-SISTEMA.md).
Guia do dia a dia: [`docs/como-usar-o-sistema.md`](docs/como-usar-o-sistema.md).

---

## Windows local (Cursor)

```powershell
cd CRM
copy .env.example .env   # se ainda não existir
npm install
docker compose up -d     # Redis em 127.0.0.1:6380 + crm-worker
npm run db:deploy
npm run db:seed
npm run dev              # http://localhost:3001
```

Postgres neste ambiente é o serviço nativo (porta 5432), não o container. A porta 3000 fica
livre para outros sistemas. `AUTH_URL` local: `http://localhost:3001`.

Não rode `npm run worker` no terminal junto com o container `crm-worker` (lock Redis).

Publicar no GitHub (depois de editar aqui):

```powershell
npm run publish:github
# depois, no clone ../DISPARO DE MSG/: git add / commit / push
```

Não edite código em `../DISPARO DE MSG/` à mão.

---

## Leia isto primeiro (agente / VPS)

Este **não** é um microserviço de disparo. É um monólito Next.js 15. Campanha, Inbox e WhatsApp
dependem de auth, Prisma, leads e workers. Não extraia pastas. Não reescreva a stack.

O que sobe em produção:

| Processo | Onde | Porta | Papel |
| --- | --- | --- | --- |
| `crm-postgres` | `docker-compose.vps.yml` | `127.0.0.1:5432` | Banco (volume `crm_pg_data`) |
| `crm-redis` | `docker-compose.vps.yml` | `127.0.0.1:6379` | Fila BullMQ, cache, pub/sub do QR |
| `crm-worker` | `docker-compose.vps.yml` | — | Baileys (sessão WhatsApp) + filas |
| Next.js | systemd ou PM2 (`npm start`) | `127.0.0.1:3001` | UI + API |
| Nginx | host | `80` / `443` | Único serviço público |

Regras que, se ignoradas, o sistema “sobe” mas não dispara:

1. **Baileys no `crm-worker` é o envio real.** Evolution API **não** é obrigatória.
2. **Campanha exige Redis + worker.** Sem os dois, a API recusa iniciar campanha.
3. **Nunca** rode `npm run worker` no host **e** o container `crm-worker` juntos (lock Redis).
4. **Nunca** versionar nem copiar de outra máquina: `.env`, `node_modules/`, `.next/`, `data/whatsapp-auth/`, `data/media/`.
5. `AUTH_URL` tem que ser a URL **pública HTTPS** (a que o usuário abre).
6. Senha do Postgres no `.env`: `POSTGRES_PASSWORD` e a senha dentro de `DATABASE_URL` **iguais**. Evite `@ : / # %` na senha.
7. Cadência de campanha: **5 disparos por minuto** (1 a cada 12 s). Duas campanhas ao mesmo tempo **dividem** esse teto.
8. Na VPS use **`docker-compose.vps.yml`**. `docker-compose.yml` é Windows (Redis 6380). `docker-compose.postgres.yml` usa outro nome de volume e **apaga o banco** se você trocar.

Caminho típico na VPS: `/opt/disparo-de-msg`. Os templates em `deploy/` usam esse path.

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

## Pré-requisitos VPS (Ubuntu 22.04 / 24.04)

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

## 1. Clone (VPS)

```bash
sudo mkdir -p /opt/disparo-de-msg
sudo chown "$USER":"$USER" /opt/disparo-de-msg
git clone https://github.com/Trindadelucas0/DISPARO-DE-MSG.git /opt/disparo-de-msg
cd /opt/disparo-de-msg
mkdir -p data/whatsapp-auth data/media
```

Depois do primeiro Compose, passe a pasta para o usuário `crm`:

```bash
sudo chown -R crm:crm /opt/disparo-de-msg
```

Quem for atualizar com `git pull` precisa de permissão de escrita.

---

## 2. Arquivo `.env` (VPS)

```bash
cd /opt/disparo-de-msg
cp .env.example .env
nano .env
```

Descomente o bloco VPS do `.env.example` e preencha **antes** de subir o Compose:

| Variável | O que colocar |
| --- | --- |
| `COMPOSE_FILE` | `docker-compose.vps.yml` (para `docker compose up -d` não subir o compose Windows) |
| `POSTGRES_PASSWORD` | senha forte, **sem** `@ : / # %` |
| `DATABASE_URL` | mesma senha, host `127.0.0.1:5432`, db `crm_prospeccao` |
| `AUTH_URL` | `https://SEU_DOMINIO` (sem barra no final) |
| `AUTH_TRUST_HOST` | `true` |
| `SEED_ADMIN_EMAIL` | e-mail do primeiro admin |
| `SEED_ADMIN_PASSWORD` | senha forte, mínimo 10 caracteres |
| `REDIS_URL` | `redis://127.0.0.1:6379` |

Gere o segredo de sessão **sem imprimir o valor**:

```bash
npm ci
npm run auth:secret
chmod 600 .env
```

**Não** use `npx auth secret`.

---

## 3. Infra VPS (Postgres + Redis + worker)

```bash
cd /opt/disparo-de-msg
docker compose -f docker-compose.vps.yml up -d
docker compose -f docker-compose.vps.yml ps
docker compose -f docker-compose.vps.yml logs -f worker
```

Se o `.env` tiver `COMPOSE_FILE=docker-compose.vps.yml`, `docker compose up -d` basta.

Esperado: `crm-postgres`, `crm-redis`, `crm-worker` healthy / running.

O worker no Compose **não** usa `DATABASE_URL` de loopback. Ele recebe `postgres:5432` na rede Docker. O Next no host usa `127.0.0.1:5432`.

`docker compose down -v` **apaga o banco** (volume `crm_pg_data`). Não use `-v` em produção.

---

## 4. Banco e build (VPS)

```bash
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run build
```

O seed é idempotente. Não rode `prisma migrate dev` na VPS.

---

## 5. systemd (Next.js)

```bash
sudo cp /opt/disparo-de-msg/deploy/crm.service /etc/systemd/system/crm.service
sudo systemctl daemon-reload
sudo systemctl enable --now crm
sudo systemctl status crm
curl -sI http://127.0.0.1:3001/login
```

Se esta VPS ainda usa PM2 (`pm2 status` → `crm`) em vez de systemd, `pm2 restart crm` depois do build. O `ecosystem.config.cjs` escuta `127.0.0.1:3001`.

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

`AUTH_URL` no `.env` tem que bater com o certificado. Depois de mudar `.env`: `sudo systemctl restart crm` (ou `pm2 restart crm`).

---

## 7. Primeiro uso

1. Abra `https://SEU_DOMINIO/login`.
2. Entre com `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
3. **Configurações → Usuários**: crie gestores e vendedores.
4. **WhatsApp**: Adicionar conta → **WhatsApp Web (QR)** → **Conectar** → escanear.
5. Status **Conectada**. Sem isso, campanha não inicia e o lead cai em `wa.me`.
6. **Mensagens**: revise os templates.
7. **Campanhas**: público + template + conta CONNECTED → **Iniciar**. Ritmo: 5/min.
8. Respostas aparecem em **Inbox**.

Código **515** logo após escanear o QR é **esperado**. Não apague `data/whatsapp-auth/` nesse momento.

---

## 8. Atualizar (`git pull`)

Não apague volumes Docker nem as pastas `data/`.

```bash
cd /opt/disparo-de-msg
sudo systemctl stop crm   # ou: pm2 stop crm
git pull
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
docker compose -f docker-compose.vps.yml up -d --build worker
sudo systemctl start crm  # ou: pm2 restart crm
```

Se a migration falhar, **não** ligue o Next até o `migrate deploy` passar.

---

## 9. Persistência e backup

1. Dump: `docker compose -f docker-compose.vps.yml exec postgres pg_dump -U crm crm_prospeccao`
2. Pasta `data/whatsapp-auth/`
3. Pasta `data/media/`
4. `.env` (fora do git, em cofre)

Volume Docker do Postgres: `crm_pg_data`.

---

## 10. Falhas comuns

| Sintoma | Causa usual | O que fazer |
| --- | --- | --- |
| Campanha não inicia; API fala de Redis/fila | Redis down ou `REDIS_URL` errada | Compose VPS; `.env` com `127.0.0.1:6379` |
| QR não aparece / conecta e cai | `crm-worker` parado, ou `npm run worker` no host junto | logs do worker; mate o worker extra |
| Redis 6380 na VPS | subiu `docker-compose.yml` (Windows) | use `-f docker-compose.vps.yml` ou `COMPOSE_FILE` |
| Login loop / CSRF atrás do Nginx | `AUTH_URL` HTTP ou domínio errado | HTTPS público no `.env`; restart do Next |
| 515 no log após o scan | restart exigido pelo WhatsApp | esperado; não apague a pasta da sessão |
| `npx auth secret` imprimiu um valor | CLI errado (better-auth) | use `npm run auth:secret` |

Scripts `scripts/keep-alive.ps1` são **somente Windows**. `docker-compose.evolution.yml` é legado; não suba na instalação padrão.

---

## 11. Arquitetura (mapa rápido)

```
navegador
  → Nginx :443
    → Next.js 127.0.0.1:3001   (UI + /api)
         → PostgreSQL 127.0.0.1:5432
         → Redis 127.0.0.1:6379  (VPS) ou :6380 (Windows)
              → crm-worker         (BullMQ + socket Baileys)
                   → data/whatsapp-auth/<accountId>/
                   → data/media/
```

Camadas: UI → hook TanStack Query → `src/app/api/*` → `src/server/services/*` → `src/server/repositories/*` → Prisma.

Gateway WhatsApp: `src/lib/whatsapp/`. Contas novas: provider **BAILEYS**.
