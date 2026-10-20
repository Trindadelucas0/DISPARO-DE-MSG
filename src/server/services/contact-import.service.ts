import { basename } from 'node:path';

import {
  cleanContactName,
  contactPhoneFields,
  fallbackContactName,
  looksLikeLegacyMobile,
  normalizeSourcePhone,
  type SourcePhone,
} from '@/lib/contact-source';
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { manualContactCnpj } from '@/lib/manual-contact';
import { isValidCnpj } from '@/lib/validation/cnpj';
import { readDelimitedFromFile } from '@/server/services/import/delimited';
import { looksLikeHeaderRow } from '@/server/services/import/delimited';
import { readWorkbookFromFile } from '@/server/services/import/parser';

/**
 * Listas auxiliares de telefone: CSV/XLSX com nome e número, sem CNPJ.
 *
 * O que o serviço faz, em ordem:
 * 1. lê os arquivos (CSV em cp1252 ou UTF-8, XLSX com ou sem cabeçalho);
 * 2. normaliza cada número e separa celular, fixo e inválido;
 * 3. deduplica pelo número nacional — dentro do arquivo e entre arquivos,
 *    inclusive entre as versões .csv e .xlsx da mesma lista;
 * 4. liga o número à empresa quando ele já está em um lead com CNPJ;
 * 5. o que sobra nasce como contato avulso, com CNPJ técnico derivado do
 *    próprio número (`manualContactCnpj`), o que torna a carga idempotente.
 *
 * `buildContactImportPlan` só LÊ o banco. Quem grava é `applyContactImportPlan`.
 */

const LOOKUP_CHUNK = 2_000;
/**
 * Contato sem CNPJ entra como ATIVA, igual ao cadastro manual. O filtro padrão
 * de Leads é `situacao=ATIVA`: sem isto o contato não aparece na tela nem
 * entra em público de campanha.
 */
const CONTACT_SITUACAO = 'ATIVA';
const PLACEHOLDER_PREFIX = 'Contato importado';
const WRITE_CHUNK = 500;
const SIX_DIGITS = /\d{6}/;
const HAS_LETTER = /\p{L}/u;

// --- Leitura dos arquivos -------------------------------------------------

export interface PhoneSourceRow {
  readonly file: string;
  /** Linha no arquivo, contando o cabeçalho quando existe. */
  readonly rowNumber: number;
  readonly name: string | null;
  readonly rawPhone: string;
}

/**
 * Qual coluna é o telefone e qual é o nome.
 *
 * Os arquivos não têm formato comum: um tem cabeçalho `USUÁRIO;TELEFONE`,
 * outro começa direto em `;556191456560;;`. Em vez de confiar no cabeçalho,
 * a coluna do telefone é a que mais tem sequência de 6+ dígitos e a do nome
 * é a que mais tem texto com letra.
 */
export function pickPhoneAndNameColumns(rows: readonly (readonly string[])[]): {
  readonly phoneColumn: number;
  readonly nameColumn: number | null;
} {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const phoneHits = new Array<number>(width).fill(0);
  const letterHits = new Array<number>(width).fill(0);

  for (const row of rows) {
    for (let column = 0; column < width; column += 1) {
      const cell = row[column] ?? '';
      if (SIX_DIGITS.test(cell)) phoneHits[column] = (phoneHits[column] ?? 0) + 1;
      else if (HAS_LETTER.test(cell)) letterHits[column] = (letterHits[column] ?? 0) + 1;
    }
  }

  let phoneColumn = 0;
  for (let column = 1; column < width; column += 1) {
    if ((phoneHits[column] ?? 0) > (phoneHits[phoneColumn] ?? 0)) phoneColumn = column;
  }

  let nameColumn: number | null = null;
  for (let column = 0; column < width; column += 1) {
    if (column === phoneColumn) continue;
    if ((letterHits[column] ?? 0) === 0) continue;
    if (nameColumn === null || (letterHits[column] ?? 0) > (letterHits[nameColumn] ?? 0)) {
      nameColumn = column;
    }
  }

  return { phoneColumn, nameColumn };
}

function toSourceRows(
  file: string,
  rows: readonly (readonly string[])[],
  firstRowNumber: number,
): PhoneSourceRow[] {
  const { phoneColumn, nameColumn } = pickPhoneAndNameColumns(rows);
  return rows.map((row, index) => ({
    file,
    rowNumber: firstRowNumber + index,
    name: nameColumn === null ? null : cleanContactName(row[nameColumn]),
    rawPhone: row[phoneColumn] ?? '',
  }));
}

export async function readPhoneListFile(filePath: string): Promise<PhoneSourceRow[]> {
  const file = basename(filePath);

  if (/\.xlsx$/i.test(file)) {
    const sheet = await readWorkbookFromFile(filePath);
    // O parser trata a linha 1 como cabeçalho. Nestes arquivos ela pode ser
    // dado: nesse caso ela volta para a lista.
    const header = [...sheet.headers];
    const body = sheet.rows.map((row) => [...row]);
    const rows = looksLikeHeaderRow(header) ? body : [header, ...body];
    return toSourceRows(file, rows, looksLikeHeaderRow(header) ? 2 : 1);
  }

  const parsed = readDelimitedFromFile(filePath);
  return toSourceRows(file, parsed.rows, parsed.headers.length > 0 ? 2 : 1);
}

// --- Plano ----------------------------------------------------------------

export type ContactAction =
  | 'create'
  | 'link-company'
  | 'fill-company-whatsapp'
  | 'existing-contact'
  | 'rename-placeholder'
  | 'landline-only'
  | 'invalid';

export interface ContactPlanEntry {
  readonly digits: string;
  readonly kind: 'mobile' | 'landline';
  readonly name: string | null;
  readonly origem: string;
  readonly sourceFiles: readonly string[];
  readonly occurrences: number;
  readonly action: ContactAction;
  readonly leadId: string | null;
  readonly leadLabel: string | null;
  readonly cnpj: string;
}

export interface ContactImportPlan {
  readonly files: readonly { readonly file: string; readonly rows: number }[];
  readonly totals: {
    readonly rowsRead: number;
    readonly uniquePhones: number;
    readonly mobile: number;
    readonly landline: number;
    /** Dos fixos: quantos têm formato de celular antigo (sem o nono dígito). */
    readonly landlineLegacyShape: number;
    readonly invalid: number;
    readonly duplicateInSources: number;
    readonly toCreate: number;
    readonly linkedToCompany: number;
    readonly fillCompanyWhatsapp: number;
    readonly existingContact: number;
    readonly renamePlaceholder: number;
    readonly withName: number;
    readonly withoutName: number;
  };
  readonly invalidByReason: readonly { readonly reason: string; readonly count: number }[];
  /** CNPJ técnico que dois números diferentes gerariam. Esperado: vazio. */
  readonly cnpjCollisions: readonly { readonly cnpj: string; readonly phones: readonly string[] }[];
  readonly entries: readonly ContactPlanEntry[];
}

interface Candidate {
  digits: string;
  kind: 'mobile' | 'landline';
  name: string | null;
  origem: string;
  files: Set<string>;
  occurrences: number;
}

/** Nome do lead para o relatório, sem expor o número inteiro. */
function leadLabel(row: { razaoSocial: string; cnpj: string }): string {
  return isValidCnpj(row.cnpj) ? row.razaoSocial : `${row.razaoSocial} (contato)`;
}

async function findLeadsByPhone(digits: readonly string[]) {
  const found = new Map<
    string,
    { id: string; cnpj: string; razaoSocial: string; whatsapp: string | null; phones: string[] }
  >();

  for (let index = 0; index < digits.length; index += LOOKUP_CHUNK) {
    const chunk = digits.slice(index, index + LOOKUP_CHUNK);
    const rows = await prisma.lead.findMany({
      where: {
        OR: [
          { whatsapp: { in: chunk } },
          { telefone: { in: chunk } },
          { phones: { hasSome: chunk } },
        ],
      },
      orderBy: { id: 'asc' },
      select: { id: true, cnpj: true, razaoSocial: true, whatsapp: true, telefone: true, phones: true },
    });

    const wanted = new Set(chunk);
    for (const row of rows) {
      // O lead pode casar por mais de um dos campos; o primeiro por `id` fica.
      const owned = new Set<string>(row.phones);
      if (row.whatsapp) owned.add(row.whatsapp);
      if (row.telefone) owned.add(row.telefone);
      for (const phone of owned) {
        if (!wanted.has(phone) || found.has(phone)) continue;
        found.set(phone, {
          id: row.id,
          cnpj: row.cnpj,
          razaoSocial: row.razaoSocial,
          whatsapp: row.whatsapp,
          phones: row.phones,
        });
      }
    }
  }

  return found;
}

export async function buildContactImportPlan(
  filePaths: readonly string[],
): Promise<ContactImportPlan> {
  const files: { file: string; rows: number }[] = [];
  const candidates = new Map<string, Candidate>();
  const invalidReasons = new Map<string, number>();
  let rowsRead = 0;
  let duplicateInSources = 0;
  let invalid = 0;

  // Ordem estável dos arquivos: o `origem` de um número repetido não muda
  // entre execuções.
  for (const filePath of [...filePaths].sort()) {
    const rows = await readPhoneListFile(filePath);
    files.push({ file: basename(filePath), rows: rows.length });
    rowsRead += rows.length;

    for (const row of rows) {
      const phone: SourcePhone = normalizeSourcePhone(row.rawPhone);
      if (phone.kind === 'invalid' || !phone.digits) {
        invalid += 1;
        const reason = phone.reason ?? 'inválido';
        invalidReasons.set(reason, (invalidReasons.get(reason) ?? 0) + 1);
        continue;
      }

      const current = candidates.get(phone.digits);
      if (current) {
        duplicateInSources += 1;
        current.occurrences += 1;
        current.files.add(row.file);
        // O primeiro nome encontrado fica; linha sem nome não apaga o nome.
        if (!current.name && row.name) current.name = row.name;
        continue;
      }

      candidates.set(phone.digits, {
        digits: phone.digits,
        kind: phone.kind,
        name: row.name,
        origem: row.file,
        files: new Set([row.file]),
        occurrences: 1,
      });
    }
  }

  const digits = [...candidates.keys()];
  const existing = await findLeadsByPhone(digits);

  const entries: ContactPlanEntry[] = [];
  const byCnpj = new Map<string, string[]>();

  for (const candidate of candidates.values()) {
    const lead = existing.get(candidate.digits);
    const cnpj = manualContactCnpj(candidate.digits);

    let action: ContactAction;
    if (!lead) {
      action = 'create';
      byCnpj.set(cnpj, [...(byCnpj.get(cnpj) ?? []), candidate.digits]);
    } else if (isValidCnpj(lead.cnpj)) {
      // Empresa já cadastrada: o número é dela. Só preenche WhatsApp vazio.
      action =
        candidate.kind === 'mobile' && !lead.whatsapp ? 'fill-company-whatsapp' : 'link-company';
    } else if (candidate.name && lead.razaoSocial.startsWith(PLACEHOLDER_PREFIX)) {
      action = 'rename-placeholder';
    } else {
      action = 'existing-contact';
    }

    entries.push({
      digits: candidate.digits,
      kind: candidate.kind,
      name: candidate.name,
      origem: candidate.origem,
      sourceFiles: [...candidate.files].sort(),
      occurrences: candidate.occurrences,
      action,
      leadId: lead?.id ?? null,
      leadLabel: lead ? leadLabel(lead) : null,
      cnpj,
    });
  }

  const count = (action: ContactAction): number =>
    entries.filter((entry) => entry.action === action).length;

  return {
    files,
    totals: {
      rowsRead,
      uniquePhones: entries.length,
      mobile: entries.filter((entry) => entry.kind === 'mobile').length,
      landline: entries.filter((entry) => entry.kind === 'landline').length,
      landlineLegacyShape: entries.filter(
        (entry) => entry.kind === 'landline' && looksLikeLegacyMobile(entry.digits),
      ).length,
      invalid,
      duplicateInSources,
      toCreate: count('create'),
      linkedToCompany: count('link-company') + count('fill-company-whatsapp'),
      fillCompanyWhatsapp: count('fill-company-whatsapp'),
      existingContact: count('existing-contact'),
      renamePlaceholder: count('rename-placeholder'),
      withName: entries.filter((entry) => entry.name !== null).length,
      withoutName: entries.filter((entry) => entry.name === null).length,
    },
    invalidByReason: [...invalidReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    cnpjCollisions: [...byCnpj.entries()]
      .filter(([, phones]) => phones.length > 1)
      .map(([cnpj, phones]) => ({ cnpj, phones })),
    entries,
  };
}

// --- Gravação -------------------------------------------------------------

export interface ContactImportResult {
  readonly created: number;
  readonly filledCompanyWhatsapp: number;
  readonly renamedPlaceholder: number;
  /** Contato que já existia e teve campo vazio completado. */
  readonly completedContact: number;
}

/**
 * Grava o plano.
 *
 * `createMany` com `skipDuplicates`: se a carga for repetida, o CNPJ técnico
 * derivado do número já existe e a linha é ignorada em vez de duplicar.
 */
export async function applyContactImportPlan(
  plan: ContactImportPlan,
): Promise<ContactImportResult> {
  if (plan.cnpjCollisions.length > 0) {
    throw new Error(
      `${plan.cnpjCollisions.length} CNPJ técnico(s) colidindo entre números diferentes. Nada gravado.`,
    );
  }

  const toCreate = plan.entries.filter((entry) => entry.action === 'create');
  let created = 0;

  for (let index = 0; index < toCreate.length; index += WRITE_CHUNK) {
    const chunk = toCreate.slice(index, index + WRITE_CHUNK);
    const result = await prisma.lead.createMany({
      data: chunk.map((entry) => {
        const fields = contactPhoneFields({
          kind: entry.kind,
          digits: entry.digits,
          reason: null,
        });
        const name = entry.name ?? fallbackContactName(entry.digits);
        return {
          cnpj: entry.cnpj,
          razaoSocial: name,
          nomeFantasia: name,
          telefone: fields.telefone,
          whatsapp: fields.whatsapp,
          phones: fields.phones,
          origem: entry.origem,
          // Igual ao cadastro manual (`createManualLead`): sem isto o contato
          // fica invisível no filtro padrão de Leads, que é `situacao=ATIVA`,
          // e fora de qualquer público de campanha.
          situacaoCadastral: CONTACT_SITUACAO,
        };
      }),
      skipDuplicates: true,
    });
    created += result.count;
  }

  let filledCompanyWhatsapp = 0;
  for (const entry of plan.entries) {
    if (entry.action !== 'fill-company-whatsapp' || !entry.leadId) continue;
    const row = await prisma.lead.findUnique({
      where: { id: entry.leadId },
      select: { whatsapp: true, phones: true },
    });
    // Relê para não sobrescrever um WhatsApp gravado entre a prévia e agora.
    if (!row || row.whatsapp) continue;
    await prisma.lead.update({
      where: { id: entry.leadId },
      data: {
        whatsapp: entry.digits,
        phones: row.phones.includes(entry.digits) ? row.phones : [...row.phones, entry.digits],
      },
    });
    filledCompanyWhatsapp += 1;
  }

  let renamedPlaceholder = 0;
  let completedContact = 0;
  for (const entry of plan.entries) {
    const isContact = entry.action === 'rename-placeholder' || entry.action === 'existing-contact';
    if (!isContact || !entry.leadId) continue;

    const row = await prisma.lead.findUnique({
      where: { id: entry.leadId },
      select: { razaoSocial: true, nomeFantasia: true, situacaoCadastral: true },
    });
    if (!row) continue;

    const data: Prisma.LeadUpdateInput = {};
    // Contato de carga anterior pode estar sem situação e por isso invisível.
    if (!row.situacaoCadastral) data.situacaoCadastral = CONTACT_SITUACAO;
    if (entry.name && row.razaoSocial.startsWith(PLACEHOLDER_PREFIX)) {
      data.razaoSocial = entry.name;
      data.nomeFantasia = entry.name;
    } else if (!row.nomeFantasia) {
      data.nomeFantasia = row.razaoSocial;
    }

    if (Object.keys(data).length === 0) continue;
    await prisma.lead.update({ where: { id: entry.leadId }, data });
    if (data.razaoSocial) renamedPlaceholder += 1;
    else completedContact += 1;
  }

  return { created, filledCompanyWhatsapp, renamedPlaceholder, completedContact };
}
