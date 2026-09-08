import { ImportIssueSeverity, ImportJobStatus, Prisma } from '@prisma/client';

import { CACHE_TAGS } from '@/lib/cache';
import { prisma } from '@/lib/db';
import { notifyChange } from '@/lib/events';
import {
  type ColumnMapping,
  IMPORT_FIELD_SPECS,
  type ImportField,
  detectColumns,
  fieldLabel,
} from '@/server/services/import/columns';
import {
  type NormalizedLead,
  normalizeRow,
  normalizedLeadSchema,
} from '@/server/services/import/normalize';
import {
  type SheetData,
  readWorkbookFromBuffer,
  readWorkbookFromFile,
} from '@/server/services/import/parser';
import { recordAudit } from '@/server/services/audit.service';

/**
 * Serviço de importação de planilha. Único caminho: usado pela tela /import e
 * pelo CLI `npm run import:xlsx`.
 *
 * Decisões:
 * - linha inválida NÃO derruba o job: vira registro em `ImportError`;
 * - inserção em lote com `createMany` + `skipDuplicates`, em blocos de 500;
 * - progresso persistido em `ImportJob` (inclusive `offset`), para retomada
 *   quando o processo do Next reinicia no meio;
 * - o filtro "somente ativas" conta e reporta o que ficou de fora. Nada é
 *   descartado em silêncio.
 */

export const CHUNK_SIZE = 500;
export const PREVIEW_ROWS = 20;

// --- Prévia ---------------------------------------------------------------

export interface ImportPreviewRow {
  readonly rowNumber: number;
  readonly lead: {
    readonly cnpj: string;
    readonly razaoSocial: string;
    readonly nomeFantasia: string | null;
    readonly telefone: string | null;
    readonly whatsapp: string | null;
    readonly email: string | null;
    readonly cidade: string | null;
    readonly estado: string | null;
    readonly situacaoCadastral: string | null;
    readonly porte: string | null;
  } | null;
  readonly issues: readonly string[];
}

export interface ImportPreview {
  readonly sheetName: string;
  readonly headers: readonly string[];
  readonly mapping: ColumnMapping;
  readonly missingRequired: readonly { field: ImportField; label: string }[];
  readonly unmappedHeaders: readonly { index: number; header: string }[];
  readonly totalRows: number;
  readonly validRows: number;
  readonly invalidRows: number;
  readonly inactiveRows: number;
  /** Duplicados dentro do próprio arquivo. */
  readonly duplicatesInFile: readonly { cnpj: string; rows: readonly number[] }[];
  /** CNPJs que já existem no banco. */
  readonly existingInDatabase: number;
  readonly situacaoBreakdown: readonly { situacao: string; count: number }[];
  readonly rows: readonly ImportPreviewRow[];
  /** Campos descartados em linhas que serão importadas. Não impedem a carga. */
  readonly warnings: readonly { rowNumber: number; field: string; reason: string }[];
  readonly warningRows: number;
}

export interface AnalyzeOptions {
  readonly onlyActive: boolean;
  readonly mappingOverride?: ColumnMapping;
  readonly origem: string;
}

interface AnalyzeResult {
  readonly sheet: SheetData;
  readonly mapping: ColumnMapping;
  readonly unmappedIndexes: number[];
  readonly leads: { rowNumber: number; lead: NormalizedLead }[];
  readonly errors: { rowNumber: number; field: string; reason: string; raw: string[] }[];
  readonly warnings: { rowNumber: number; field: string; reason: string }[];
  readonly duplicatesInFile: { cnpj: string; rows: number[] }[];
  readonly inactiveRows: number;
  readonly situacaoBreakdown: { situacao: string; count: number }[];
  readonly missingRequired: { field: ImportField; label: string }[];
  readonly unmappedHeaders: { index: number; header: string }[];
}

/** Parse + normalização + validação de toda a planilha, sem tocar o banco. */
function analyzeSheet(sheet: SheetData, options: AnalyzeOptions): AnalyzeResult {
  const detection = detectColumns(sheet.headers);
  const mapping: ColumnMapping = { ...detection.mapping, ...(options.mappingOverride ?? {}) };

  const mappedIndexes = new Set(Object.values(mapping).filter((v): v is number => v !== undefined));
  const unmappedIndexes = sheet.headers
    .map((_header, index) => index)
    .filter((index) => !mappedIndexes.has(index));

  const missingRequired = IMPORT_FIELD_SPECS.filter(
    (spec) => spec.required && mapping[spec.field] === undefined,
  ).map((spec) => ({ field: spec.field, label: spec.label }));

  const leads: { rowNumber: number; lead: NormalizedLead }[] = [];
  const errors: { rowNumber: number; field: string; reason: string; raw: string[] }[] = [];
  const warnings: { rowNumber: number; field: string; reason: string }[] = [];
  const seen = new Map<string, number[]>();
  const situacaoCount = new Map<string, number>();
  let inactiveRows = 0;

  sheet.rows.forEach((row, index) => {
    // Linha 1 é o cabeçalho: a primeira linha de dados é a 2 do arquivo.
    const rowNumber = index + 2;

    const outcome = normalizeRow(row, {
      mapping,
      headers: sheet.headers,
      unmappedIndexes,
      origem: options.origem,
    });

    if (!outcome.ok) {
      for (const issue of outcome.issues) {
        errors.push({ rowNumber, field: issue.field, reason: issue.reason, raw: [...row] });
      }
      return;
    }

    const parsed = normalizedLeadSchema.safeParse(outcome.lead);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          rowNumber,
          field: issue.path.join('.') || '_',
          reason: issue.message,
          raw: [...row],
        });
      }
      return;
    }

    for (const warning of outcome.warnings) {
      warnings.push({ rowNumber, field: warning.field, reason: warning.reason });
    }

    const situacao = parsed.data.situacaoCadastral ?? 'NÃO INFORMADA';
    situacaoCount.set(situacao, (situacaoCount.get(situacao) ?? 0) + 1);

    if (options.onlyActive && situacao !== 'ATIVA') {
      inactiveRows += 1;
      return;
    }

    const previousRows = seen.get(parsed.data.cnpj);
    if (previousRows) {
      previousRows.push(rowNumber);
      return;
    }

    seen.set(parsed.data.cnpj, [rowNumber]);
    leads.push({ rowNumber, lead: parsed.data });
  });

  const duplicatesInFile = [...seen.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([cnpj, rows]) => ({ cnpj, rows }));

  return {
    sheet,
    mapping,
    unmappedIndexes,
    leads,
    errors,
    warnings,
    duplicatesInFile,
    inactiveRows,
    situacaoBreakdown: [...situacaoCount.entries()]
      .map(([situacao, count]) => ({ situacao, count }))
      .sort((a, b) => b.count - a.count),
    missingRequired,
    unmappedHeaders: [...detection.unmappedHeaders],
  };
}

export async function buildPreview(
  sheet: SheetData,
  options: AnalyzeOptions,
): Promise<ImportPreview> {
  const analysis = analyzeSheet(sheet, options);

  const cnpjs = analysis.leads.map((entry) => entry.lead.cnpj);
  const existingInDatabase =
    cnpjs.length === 0
      ? 0
      : await prisma.lead.count({ where: { cnpj: { in: cnpjs } } });

  const errorsByRow = new Map<number, string[]>();
  for (const error of analysis.errors) {
    errorsByRow.set(error.rowNumber, [...(errorsByRow.get(error.rowNumber) ?? []), error.reason]);
  }

  const previewRows: ImportPreviewRow[] = analysis.leads.slice(0, PREVIEW_ROWS).map((entry) => ({
    rowNumber: entry.rowNumber,
    lead: {
      cnpj: entry.lead.cnpj,
      razaoSocial: entry.lead.razaoSocial,
      nomeFantasia: entry.lead.nomeFantasia,
      telefone: entry.lead.telefone,
      whatsapp: entry.lead.whatsapp,
      email: entry.lead.email,
      cidade: entry.lead.cidade,
      estado: entry.lead.estado,
      situacaoCadastral: entry.lead.situacaoCadastral,
      porte: entry.lead.porte,
    },
    issues: [],
  }));

  // As primeiras linhas rejeitadas aparecem na prévia junto das válidas.
  const rejectedPreview: ImportPreviewRow[] = [...errorsByRow.entries()]
    .slice(0, 5)
    .map(([rowNumber, issues]) => ({ rowNumber, lead: null, issues }));

  return {
    sheetName: sheet.sheetName,
    headers: sheet.headers,
    mapping: analysis.mapping,
    missingRequired: analysis.missingRequired,
    unmappedHeaders: analysis.unmappedHeaders,
    totalRows: sheet.rows.length,
    validRows: analysis.leads.length,
    invalidRows: errorsByRow.size,
    inactiveRows: analysis.inactiveRows,
    duplicatesInFile: analysis.duplicatesInFile,
    existingInDatabase,
    situacaoBreakdown: analysis.situacaoBreakdown,
    rows: [...previewRows, ...rejectedPreview],
    warnings: analysis.warnings.slice(0, 50),
    warningRows: new Set(analysis.warnings.map((warning) => warning.rowNumber)).size,
  };
}

// --- Execução -------------------------------------------------------------

function toCreateInput(lead: NormalizedLead): Prisma.LeadCreateManyInput {
  return {
    cnpj: lead.cnpj,
    razaoSocial: lead.razaoSocial,
    nomeFantasia: lead.nomeFantasia,
    telefone: lead.telefone,
    whatsapp: lead.whatsapp,
    phones: lead.phones,
    email: lead.email,
    estado: lead.estado,
    cidade: lead.cidade,
    logradouro: lead.logradouro,
    numero: lead.numero,
    complemento: lead.complemento,
    bairro: lead.bairro,
    cep: lead.cep,
    ibge: lead.ibge,
    segmento: lead.segmento,
    porte: lead.porte,
    origem: lead.origem,
    cnaePrincipalCodigo: lead.cnaePrincipalCodigo,
    cnaePrincipalDescricao: lead.cnaePrincipalDescricao,
    cnaeSecundarios: lead.cnaeSecundarios,
    situacaoCadastral: lead.situacaoCadastral,
    naturezaJuridica: lead.naturezaJuridica,
    dataAbertura: lead.dataAbertura,
    capitalSocial: lead.capitalSocial === null ? null : new Prisma.Decimal(lead.capitalSocial),
    socios: lead.socios,
    optanteSimples: lead.optanteSimples,
    optanteMei: lead.optanteMei,
    rawImport: (lead.rawImport ?? undefined) as Prisma.InputJsonValue | undefined,
  };
}

export interface ImportRunResult {
  readonly jobId: string;
  readonly totalRows: number;
  readonly processedRows: number;
  readonly insertedRows: number;
  readonly skippedRows: number;
  readonly failedRows: number;
  readonly duplicateRows: number;
  readonly inactiveRows: number;
  readonly warningRows: number;
}

export interface RunImportOptions extends AnalyzeOptions {
  readonly jobId: string;
  readonly userId: string | null;
}

/**
 * Executa a importação de uma planilha já lida.
 *
 * Retoma de `ImportJob.offset`: em caso de reinício do servidor, as linhas já
 * gravadas não são reprocessadas.
 */
export async function runImport(
  sheet: SheetData,
  options: RunImportOptions,
): Promise<ImportRunResult> {
  const analysis = analyzeSheet(sheet, options);

  if (analysis.missingRequired.length > 0) {
    const labels = analysis.missingRequired.map((entry) => entry.label).join(', ');
    await prisma.importJob.update({
      where: { id: options.jobId },
      data: {
        status: ImportJobStatus.FAILED,
        errorMessage: `Colunas obrigatórias não encontradas: ${labels}.`,
        finishedAt: new Date(),
      },
    });
    throw new Error(`Colunas obrigatórias não encontradas: ${labels}.`);
  }

  const job = await prisma.importJob.update({
    where: { id: options.jobId },
    data: {
      status: ImportJobStatus.RUNNING,
      startedAt: new Date(),
      totalRows: sheet.rows.length,
      inactiveRows: analysis.inactiveRows,
      duplicateRows: analysis.duplicatesInFile.reduce(
        (total, entry) => total + entry.rows.length - 1,
        0,
      ),
      columnMapping: analysis.mapping as Prisma.InputJsonValue,
    },
  });

  // Erros e avisos são gravados antes da inserção: se o processo cair no meio
  // dos lotes, o relatório de rejeição já está no banco.
  //
  // ERROR  = a linha foi rejeitada, o lead não entrou.
  // WARNING = o lead entrou, mas um campo inválido foi descartado. Fica
  //           registrado porque nada pode desaparecer em silêncio.
  const issues: Prisma.ImportErrorCreateManyInput[] = [
    ...analysis.errors.map((error) => ({
      jobId: options.jobId,
      rowNumber: error.rowNumber,
      field: error.field,
      reason: error.reason,
      severity: ImportIssueSeverity.ERROR,
      rawRow: error.raw as unknown as Prisma.InputJsonValue,
    })),
    ...analysis.warnings.map((warning) => ({
      jobId: options.jobId,
      rowNumber: warning.rowNumber,
      field: warning.field,
      reason: warning.reason,
      severity: ImportIssueSeverity.WARNING,
    })),
  ];

  for (let index = 0; index < issues.length; index += CHUNK_SIZE) {
    await prisma.importError.createMany({ data: issues.slice(index, index + CHUNK_SIZE) });
  }

  const distinctFailedRows = new Set(analysis.errors.map((error) => error.rowNumber)).size;
  const distinctWarningRows = new Set(analysis.warnings.map((warning) => warning.rowNumber)).size;

  let insertedRows = 0;
  let processedRows = job.offset;

  for (let offset = job.offset; offset < analysis.leads.length; offset += CHUNK_SIZE) {
    const chunk = analysis.leads.slice(offset, offset + CHUNK_SIZE);

    // skipDuplicates cobre o CNPJ que já existe no banco: reimportar a mesma
    // planilha não gera erro nem duplica lead.
    const result = await prisma.lead.createMany({
      data: chunk.map((entry) => toCreateInput(entry.lead)),
      skipDuplicates: true,
    });

    insertedRows += result.count;
    processedRows = offset + chunk.length;

    await prisma.importJob.update({
      where: { id: options.jobId },
      data: {
        offset: processedRows,
        processedRows: processedRows + analysis.inactiveRows + distinctFailedRows,
        insertedRows,
        skippedRows: processedRows - insertedRows,
        failedRows: distinctFailedRows,
      },
    });
  }

  const finished = await prisma.importJob.update({
    where: { id: options.jobId },
    data: {
      status: ImportJobStatus.COMPLETED,
      finishedAt: new Date(),
      processedRows: sheet.rows.length,
      insertedRows,
      skippedRows: analysis.leads.length - insertedRows,
      failedRows: distinctFailedRows,
      warningRows: distinctWarningRows,
    },
  });

  await recordAudit({
    userId: options.userId,
    action: 'import.run',
    entity: 'ImportJob',
    entityId: options.jobId,
    changes: {
      fileName: finished.fileName,
      onlyActive: options.onlyActive,
      totalRows: sheet.rows.length,
      insertedRows,
      failedRows: distinctFailedRows,
      warningRows: distinctWarningRows,
      inactiveRows: analysis.inactiveRows,
    },
  });

  await notifyChange({
    type: 'import.run',
    tags: [
      CACHE_TAGS.leads,
      CACHE_TAGS.dashboard,
      CACHE_TAGS.contacts,
      CACHE_TAGS.reports,
      CACHE_TAGS.importJobs,
    ],
    entityId: options.jobId,
  });

  return {
    jobId: options.jobId,
    totalRows: sheet.rows.length,
    processedRows: sheet.rows.length,
    insertedRows,
    skippedRows: analysis.leads.length - insertedRows,
    failedRows: distinctFailedRows,
    duplicateRows: analysis.duplicatesInFile.reduce(
      (total, entry) => total + entry.rows.length - 1,
      0,
    ),
    inactiveRows: analysis.inactiveRows,
    warningRows: distinctWarningRows,
  };
}

export async function createImportJob(input: {
  readonly fileName: string;
  readonly source: 'upload' | 'cli';
  readonly onlyActive: boolean;
  readonly userId: string | null;
}) {
  return prisma.importJob.create({
    data: {
      fileName: input.fileName,
      source: input.source,
      onlyActive: input.onlyActive,
      createdById: input.userId,
      status: ImportJobStatus.PENDING,
    },
  });
}

export async function failImportJob(jobId: string, message: string): Promise<void> {
  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: ImportJobStatus.FAILED, errorMessage: message, finishedAt: new Date() },
  });
}

export async function getImportJob(jobId: string) {
  return prisma.importJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      fileName: true,
      source: true,
      status: true,
      onlyActive: true,
      totalRows: true,
      processedRows: true,
      insertedRows: true,
      skippedRows: true,
      failedRows: true,
      duplicateRows: true,
      inactiveRows: true,
      warningRows: true,
      errorMessage: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      _count: { select: { errors: true } },
    },
  });
}

export async function listImportJobs(limit = 20) {
  return prisma.importJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      fileName: true,
      source: true,
      status: true,
      totalRows: true,
      insertedRows: true,
      failedRows: true,
      inactiveRows: true,
      createdAt: true,
      finishedAt: true,
      createdBy: { select: { name: true } },
    },
  });
}

export async function listImportErrors(
  jobId: string,
  page: number,
  limit: number,
  severity?: ImportIssueSeverity,
) {
  const where = severity ? { jobId, severity } : { jobId };
  const [rows, total] = await prisma.$transaction([
    prisma.importError.findMany({
      where,
      orderBy: [{ severity: 'asc' }, { rowNumber: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, rowNumber: true, field: true, reason: true, severity: true },
    }),
    prisma.importError.count({ where }),
  ]);
  return { rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export { fieldLabel, readWorkbookFromBuffer, readWorkbookFromFile };
export type { ColumnMapping, ImportField, SheetData };
