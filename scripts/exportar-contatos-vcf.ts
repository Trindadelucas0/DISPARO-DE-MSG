/**
 * Agenda em .vcf para transmissão manual no celular.
 *
 * Gera um arquivo por grupo (`A.vcf`, `B.vcf`, … `A1.vcf`) com o nome de cada
 * contato prefixado pelo rótulo do grupo (`A01 Empresa`). No celular, a agenda
 * ordena por nome e o grupo inteiro fica junto na hora de marcar a lista de
 * transmissão. O `indice.csv` diz quem caiu em qual grupo.
 *
 * Uso:
 *   npm run contatos:vcf                                 # todos os leads com celular
 *   npm run contatos:vcf -- --tamanho=256                # outro tamanho de grupo
 *   npm run contatos:vcf -- --campanha=<id>              # só o público da campanha
 *   npm run contatos:vcf -- --saida=data/agenda-outubro  # outra pasta
 *
 * O arquivo sai no servidor. Mande para o celular (e-mail, Drive, cabo), abra e
 * confirme "importar todos" — só então os contatos aparecem no WhatsApp.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  buildVCardFile,
  contactDisplayName,
  groupLabel,
  splitIntoGroups,
  toE164,
  type VCardContact,
} from '@/lib/contacts/vcard';
import { prisma } from '@/lib/db';
import { closeRedis } from '@/lib/redis';
import { parsePhone } from '@/lib/validation/phone';

const TAMANHO_PADRAO = 50;
const SAIDA_PADRAO = 'data/contatos-vcf';

interface Opcoes {
  readonly tamanho: number;
  readonly saida: string;
  readonly campanhaId?: string;
}

function lerOpcoes(argv: readonly string[]): Opcoes {
  const valor = (nome: string): string | undefined =>
    argv.find((arg) => arg.startsWith(`--${nome}=`))?.split('=').slice(1).join('=');

  const tamanhoBruto = Number(valor('tamanho') ?? TAMANHO_PADRAO);
  if (!Number.isInteger(tamanhoBruto) || tamanhoBruto < 1) {
    throw new Error('--tamanho tem que ser inteiro de 1 para cima.');
  }

  return {
    tamanho: tamanhoBruto,
    saida: valor('saida') ?? SAIDA_PADRAO,
    campanhaId: valor('campanha'),
  };
}

interface LeadAgenda {
  readonly nome: string;
  readonly razaoSocial: string;
  readonly telefone: string;
}

async function carregarLeads(campanhaId?: string): Promise<LeadAgenda[]> {
  const leads = await prisma.lead.findMany({
    where: campanhaId
      ? { campaignRecipients: { some: { campaignId: campanhaId } } }
      : { OR: [{ whatsapp: { not: null } }, { telefone: { not: null } }] },
    select: { razaoSocial: true, nomeFantasia: true, whatsapp: true, telefone: true },
    orderBy: { razaoSocial: 'asc' },
  });

  const vistos = new Set<string>();
  const agenda: LeadAgenda[] = [];

  for (const lead of leads) {
    const parsed = parsePhone(lead.whatsapp) ?? parsePhone(lead.telefone);
    // Lista de transmissão só funciona em celular; fixo não entra.
    if (!parsed?.isMobile) continue;
    const telefone = `55${parsed.digits}`;
    if (vistos.has(telefone)) continue;
    vistos.add(telefone);
    agenda.push({
      nome: lead.nomeFantasia?.trim() || lead.razaoSocial,
      razaoSocial: lead.razaoSocial,
      telefone,
    });
  }

  return agenda;
}

function escreverGrupos(leads: readonly LeadAgenda[], opcoes: Opcoes): number {
  const destino = resolve(process.cwd(), opcoes.saida);
  mkdirSync(destino, { recursive: true });

  const grupos = splitIntoGroups(leads, opcoes.tamanho);
  const indice: string[] = ['grupo,posicao,nome_na_agenda,telefone,razao_social'];

  grupos.forEach((grupo, i) => {
    const label = groupLabel(i);
    const contatos: VCardContact[] = grupo.map((lead, posicao) => {
      const displayName = contactDisplayName(label, posicao + 1, lead.nome, opcoes.tamanho);
      indice.push(
        [label, posicao + 1, displayName, toE164(lead.telefone), lead.razaoSocial]
          .map((campo) => `"${String(campo).replaceAll('"', '""')}"`)
          .join(','),
      );
      return { displayName, phone: toE164(lead.telefone), organization: lead.razaoSocial };
    });

    writeFileSync(join(destino, `${label}.vcf`), buildVCardFile(contatos), 'utf8');
    console.log(`  ${label}.vcf — ${contatos.length} contato(s)`);
  });

  writeFileSync(join(destino, 'indice.csv'), `${indice.join('\n')}\n`, 'utf8');
  console.log(`\nPasta: ${destino}`);
  return grupos.length;
}

async function main(): Promise<void> {
  const opcoes = lerOpcoes(process.argv.slice(2));
  const leads = await carregarLeads(opcoes.campanhaId);

  if (leads.length === 0) {
    console.log('Nenhum lead com celular. Nada a exportar.');
    return;
  }

  console.log(
    `${leads.length} contato(s) com celular, ${opcoes.tamanho} por grupo${
      opcoes.campanhaId ? ` (campanha ${opcoes.campanhaId})` : ''
    }:\n`,
  );
  const grupos = escreverGrupos(leads, opcoes);
  console.log(`${grupos} grupo(s). Importe um arquivo por vez no celular.`);
}

main()
  .catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await closeRedis();
  });
