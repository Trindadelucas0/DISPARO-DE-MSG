import { z } from 'zod';

import { isValidCnpj, normalizeCnpj, onlyDigits } from '@/lib/validation/cnpj';
import { firstMobile, parsePhoneList } from '@/lib/validation/phone';
import { type ColumnMapping, type ImportField } from '@/server/services/import/columns';

/**
 * Normalização linha → lead.
 *
 * Regras confirmadas com os arquivos de origem:
 * - CNPJ vem sem máscara, 14 dígitos;
 * - `Telefones` é `DDD-numero` separado por vírgula (1 ou 2 por lead);
 * - datas vêm como `YYYY-MM-DD` ou `YYYY-MM-DD HH:mm:ss`;
 * - `Capital Social` vem como `20000.00`;
 * - `Optante MEI` / `Optante Simples` vêm como `Sim` / `Não` / vazio;
 * - `Socios` e as descrições de CNAE secundário vêm separados por vírgula.
 */

const PORTE_CANONICAL: Readonly<Record<string, string>> = {
  'micro empresa': 'Micro Empresa',
  microempresa: 'Micro Empresa',
  me: 'Micro Empresa',
  'empresa de pequeno porte': 'Empresa de Pequeno Porte',
  epp: 'Empresa de Pequeno Porte',
  demais: 'Demais',
  'nao informado': 'Não informado',
};

function text(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** `Sim`/`Não`/vazio → boolean. Valor desconhecido conta como `false`. */
export function parseSimNao(value: string | undefined): boolean {
  const key = normalizeKey(value ?? '');
  return key === 'sim' || key === 's' || key === 'true' || key === '1';
}

/** Aceita `YYYY-MM-DD`, `YYYY-MM-DD HH:mm:ss`, ISO e `DD/MM/YYYY`. */
export function parseDate(value: string | undefined): Date | null {
  const raw = value?.trim();
  if (!raw) return null;

  const brazilian = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (brazilian) {
    const [, day, month, year] = brazilian;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Datas da planilha vêm sem fuso. Fixar UTC evita que o dia mude conforme o
  // fuso do servidor que roda a importação.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return validDate(new Date(`${raw}T00:00:00.000Z`));
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    return validDate(new Date(`${raw.replace(' ', 'T')}Z`));
  }
  return validDate(new Date(raw));
}

function validDate(date: Date): Date | null {
  if (Number.isNaN(date.getTime())) return null;
  // Ano fora dessa faixa é coluna mapeada errada, não data de abertura.
  const year = date.getUTCFullYear();
  return year >= 1800 && year <= 2200 ? date : null;
}

/** `20000.00` e `20.000,00` → 20000. Devolve null quando não é número. */
export function parseDecimal(value: string | undefined): number | null {
  const raw = value?.trim();
  if (!raw) return null;

  const hasComma = raw.includes(',');
  const normalized = hasComma ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const numeric = Number(normalized.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseList(value: string | undefined): string[] {
  const raw = value?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function normalizePorte(value: string | undefined): string | null {
  const raw = text(value);
  if (!raw) return null;
  return PORTE_CANONICAL[normalizeKey(raw)] ?? raw;
}

export interface NormalizedLead {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  telefone: string | null;
  whatsapp: string | null;
  phones: string[];
  email: string | null;
  estado: string | null;
  cidade: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  ibge: string | null;
  segmento: string | null;
  porte: string | null;
  origem: string;
  cnaePrincipalCodigo: string | null;
  cnaePrincipalDescricao: string | null;
  cnaeSecundarios: string[];
  situacaoCadastral: string | null;
  naturezaJuridica: string | null;
  dataAbertura: Date | null;
  capitalSocial: number | null;
  socios: string[];
  optanteSimples: boolean;
  optanteMei: boolean;
  rawImport: Record<string, string> | null;
}

const emailSchema = z.string().email();

export interface NormalizeContext {
  readonly mapping: ColumnMapping;
  readonly headers: readonly string[];
  readonly unmappedIndexes: readonly number[];
  /** Vai para `Lead.origem`; a UI e o CLI passam o nome do arquivo. */
  readonly origem: string;
}

export interface NormalizeIssue {
  readonly field: string;
  readonly reason: string;
}

export type NormalizeOutcome =
  | { ok: true; lead: NormalizedLead; warnings: NormalizeIssue[] }
  | { ok: false; issues: NormalizeIssue[] };

export function normalizeRow(
  row: readonly string[],
  context: NormalizeContext,
): NormalizeOutcome {
  const get = (field: ImportField): string | undefined => {
    const index = context.mapping[field];
    return index === undefined ? undefined : row[index];
  };

  const issues: NormalizeIssue[] = [];
  const warnings: NormalizeIssue[] = [];

  // --- CNPJ: chave de deduplicação, então é validado de verdade -------------
  const rawCnpj = get('cnpj');
  const cnpj = normalizeCnpj(rawCnpj);
  if (!cnpj) {
    issues.push({
      field: 'cnpj',
      reason: `CNPJ ausente ou sem 14 dígitos (recebido: "${rawCnpj ?? ''}").`,
    });
  } else if (!isValidCnpj(cnpj)) {
    issues.push({ field: 'cnpj', reason: `CNPJ com dígito verificador inválido: ${cnpj}.` });
  }

  const razaoSocial = text(get('razaoSocial'));
  if (!razaoSocial) {
    issues.push({ field: 'razaoSocial', reason: 'Razão social vazia.' });
  }

  if (issues.length > 0 || !cnpj || !razaoSocial) {
    return { ok: false, issues };
  }

  // --- Telefones ------------------------------------------------------------
  const parsedPhones = parsePhoneList(get('telefones'));
  const rawPhoneColumn = text(get('telefones'));
  if (rawPhoneColumn && parsedPhones.length === 0) {
    warnings.push({
      field: 'telefones',
      reason: `Nenhum telefone válido em "${rawPhoneColumn}"; lead importado sem telefone.`,
    });
  }
  const mobile = firstMobile(parsedPhones);

  // --- E-mail ---------------------------------------------------------------
  const rawEmail = text(get('email'));
  let email: string | null = null;
  if (rawEmail) {
    const lowered = rawEmail.toLowerCase();
    if (emailSchema.safeParse(lowered).success) {
      email = lowered;
    } else {
      warnings.push({
        field: 'email',
        reason: `E-mail inválido descartado: "${rawEmail}".`,
      });
    }
  }

  // --- CNAEs secundários: junta código e descrição na mesma posição ---------
  const secondaryCodes = parseList(get('cnaeSecundariosCodigos'));
  const secondaryDescriptions = parseList(get('cnaeSecundariosDescricoes'));
  const cnaeSecundarios = secondaryCodes.map((code, index) => {
    const description = secondaryDescriptions[index];
    return description ? `${code} - ${description}` : code;
  });

  const estadoRaw = text(get('estado'));
  const estado = estadoRaw ? estadoRaw.toUpperCase().slice(0, 2) : null;

  const cepDigits = onlyDigits(get('cep') ?? '');

  const cnaePrincipalDescricao = text(get('cnaePrincipalDescricao'));

  // --- Colunas não mapeadas viram rawImport --------------------------------
  const rawImport: Record<string, string> = {};
  for (const index of context.unmappedIndexes) {
    const header = context.headers[index];
    const value = row[index];
    if (header && value && value.trim().length > 0) {
      rawImport[header] = value.trim();
    }
  }

  const lead: NormalizedLead = {
    cnpj,
    razaoSocial,
    nomeFantasia: text(get('nomeFantasia')),
    telefone: parsedPhones[0]?.digits ?? null,
    whatsapp: mobile?.digits ?? null,
    phones: parsedPhones.map((phone) => phone.digits),
    email,
    estado,
    cidade: text(get('cidade')),
    logradouro: text(get('logradouro')),
    numero: text(get('numero')),
    complemento: text(get('complemento')),
    bairro: text(get('bairro')),
    cep: cepDigits.length === 8 ? cepDigits : null,
    ibge: text(get('ibge')),
    // O segmento nasce da descrição do CNAE principal (PRD §8).
    segmento: cnaePrincipalDescricao,
    porte: normalizePorte(get('porte')),
    origem: context.origem,
    cnaePrincipalCodigo: text(get('cnaePrincipalCodigo')),
    cnaePrincipalDescricao,
    cnaeSecundarios,
    situacaoCadastral: text(get('situacaoCadastral'))?.toUpperCase() ?? null,
    naturezaJuridica: text(get('naturezaJuridica')),
    dataAbertura: parseDate(get('dataAbertura')),
    capitalSocial: parseDecimal(get('capitalSocial')),
    socios: parseList(get('socios')),
    optanteSimples: parseSimNao(get('optanteSimples')),
    optanteMei: parseSimNao(get('optanteMei')),
    rawImport: Object.keys(rawImport).length > 0 ? rawImport : null,
  };

  return { ok: true, lead, warnings };
}

/**
 * Guarda final antes do banco.
 *
 * O papel destes limites é detectar coluna mapeada errada na tela /import
 * (ex.: apontar "Razão social" para a coluna de CEP), NÃO recusar dado
 * legítimo — as colunas no Postgres são `text`, sem limite.
 *
 * Os tetos foram calibrados contra os arquivos reais (maior valor observado
 * entre as 3.306 linhas), com folga:
 *   complemento 129 · razaoSocial 93 · cnaePrincipalDescricao 84
 *   naturezaJuridica 72 · logradouro 66 · bairro 50
 *   até 99 CNAEs secundários e 9 sócios por empresa
 */
export const normalizedLeadSchema = z.object({
  cnpj: z.string().length(14).regex(/^\d+$/),
  razaoSocial: z.string().min(2).max(400),
  nomeFantasia: z.string().max(400).nullable(),
  telefone: z.string().max(32).nullable(),
  whatsapp: z.string().max(32).nullable(),
  phones: z.array(z.string().max(32)).max(20),
  email: z.string().email().max(180).nullable(),
  estado: z.string().length(2).nullable(),
  cidade: z.string().max(160).nullable(),
  logradouro: z.string().max(400).nullable(),
  numero: z.string().max(32).nullable(),
  complemento: z.string().max(400).nullable(),
  bairro: z.string().max(200).nullable(),
  cep: z.string().length(8).nullable(),
  ibge: z.string().max(16).nullable(),
  segmento: z.string().max(400).nullable(),
  porte: z.string().max(60).nullable(),
  origem: z.string().max(200),
  cnaePrincipalCodigo: z.string().max(16).nullable(),
  cnaePrincipalDescricao: z.string().max(400).nullable(),
  cnaeSecundarios: z.array(z.string().max(500)).max(300),
  situacaoCadastral: z.string().max(32).nullable(),
  naturezaJuridica: z.string().max(300).nullable(),
  dataAbertura: z.date().nullable(),
  capitalSocial: z.number().nonnegative().nullable(),
  socios: z.array(z.string().max(400)).max(100),
  optanteSimples: z.boolean(),
  optanteMei: z.boolean(),
  rawImport: z.record(z.string()).nullable(),
});
