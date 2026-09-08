import ExcelJS from 'exceljs';

import type { LeadFilters } from '@/features/leads/schema';
import { leadStatusLabel } from '@/constants/lead-status';
import { RATE_LIMITS, checkRateLimit } from '@/lib/rate-limit';
import { formatCnpj, formatDate, formatDateTime, formatPhone } from '@/lib/format';
import { assertStaff, leadScopeWhere, type SessionUser } from '@/lib/auth/rbac';
import { RateLimitError } from '@/server/api-handler';
import { buildLeadWhere, findLeadsForExport } from '@/server/repositories/lead.repository';
import { withLastResultFilter } from '@/server/repositories/interaction.repository';
import { recordAudit } from '@/server/services/audit.service';

const BATCH = 500;

const HEADERS = [
  'CNPJ',
  'Razão social',
  'Nome fantasia',
  'Status',
  'Situação cadastral',
  'Cidade',
  'UF',
  'Telefone',
  'WhatsApp',
  'E-mail',
  'Porte',
  'Segmento',
  'Responsável',
  'Próximo contato',
  'Último contato',
  'Cadastro',
  'Origem',
] as const;

function rowValues(row: Awaited<ReturnType<typeof findLeadsForExport>>[number]): string[] {
  return [
    formatCnpj(row.cnpj),
    row.razaoSocial,
    row.nomeFantasia ?? '',
    leadStatusLabel(row.status),
    row.situacaoCadastral ?? '',
    row.cidade ?? '',
    row.estado ?? '',
    row.telefone ? formatPhone(row.telefone) : '',
    row.whatsapp ? formatPhone(row.whatsapp) : '',
    row.email ?? '',
    row.porte ?? '',
    row.segmento ?? '',
    row.responsavel?.name ?? '',
    formatDate(row.nextContactAt),
    formatDateTime(row.lastContactAt),
    formatDateTime(row.createdAt),
    row.origem ?? '',
  ];
}

async function collectRows(user: SessionUser, filters: LeadFilters, ids?: readonly string[]) {
  assertStaff(user);
  const where = ids?.length
    ? { AND: [leadScopeWhere(user), { id: { in: [...ids] } }] }
    : await withLastResultFilter(buildLeadWhere(filters, leadScopeWhere(user)), filters.lastResult);

  const rows: Awaited<ReturnType<typeof findLeadsForExport>> = [];
  let cursor: string | undefined;
  for (;;) {
    const batch = await findLeadsForExport(where, cursor, BATCH);
    if (batch.length === 0) break;
    rows.push(...batch);
    const last = batch[batch.length - 1];
    if (!last || batch.length < BATCH) break;
    cursor = last.id;
  }
  return rows;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function exportLeadsCsv(
  user: SessionUser,
  filters: LeadFilters,
  ids?: readonly string[],
): Promise<{ filename: string; body: string; contentType: string }> {
  assertStaff(user);
  const rows = await collectRows(user, filters, ids);
  const lines = [
    HEADERS.join(','),
    ...rows.map((row) => rowValues(row).map(csvEscape).join(',')),
  ];
  await recordAudit({
    userId: user.id,
    action: 'lead.export',
    entity: 'Lead',
    changes: { format: 'csv', count: rows.length },
  });
  return {
    filename: `leads-${new Date().toISOString().slice(0, 10)}.csv`,
    body: `\uFEFF${lines.join('\r\n')}`,
    contentType: 'text/csv; charset=utf-8',
  };
}

export async function exportLeadsXlsx(
  user: SessionUser,
  filters: LeadFilters,
  ids?: readonly string[],
): Promise<{ filename: string; buffer: Buffer; contentType: string }> {
  const rows = await collectRows(user, filters, ids);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CRM Prospecção';
  const sheet = workbook.addWorksheet('Leads', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.addRow([...HEADERS]);
  for (const row of rows) sheet.addRow(rowValues(row));
  sheet.columns.forEach((column) => {
    column.width = 18;
  });

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  await recordAudit({
    userId: user.id,
    action: 'lead.export',
    entity: 'Lead',
    changes: { format: 'xlsx', count: rows.length },
  });
  return {
    filename: `leads-${new Date().toISOString().slice(0, 10)}.xlsx`,
    buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

export async function assertExportRateLimit(userId: string, ip: string): Promise<void> {
  const limit = await checkRateLimit('export', `${userId}:${ip}`, RATE_LIMITS.export);
  if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);
}
