/**
 * Garante um AUTH_SECRET forte no .env sem imprimir o valor em nenhum lugar.
 *
 * Existe porque `npx auth secret` hoje resolve para um pacote de outro projeto
 * (better-auth) e imprime o segredo no terminal. Aqui o valor nasce e morre
 * dentro do arquivo.
 *
 * Uso: node scripts/ensure-auth-secret.mjs
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env');

if (!existsSync(envPath)) {
  console.error('.env não encontrado. Copie .env.example para .env antes de rodar este script.');
  process.exit(1);
}

const content = readFileSync(envPath, 'utf8');

if (/^AUTH_SECRET=".+"$/m.test(content)) {
  console.log('AUTH_SECRET já definido no .env. Nada a fazer.');
  process.exit(0);
}

const secret = randomBytes(32).toString('base64');
const next = `${content.trimEnd()}\n\n# Gerado por scripts/ensure-auth-secret.mjs\nAUTH_SECRET="${secret}"\n`;

writeFileSync(envPath, next, { encoding: 'utf8', mode: 0o600 });
console.log('AUTH_SECRET gravado no .env (32 bytes aleatórios, base64). Valor não exibido.');
