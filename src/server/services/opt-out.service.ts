import { prisma } from '@/lib/db';
import { parsePhone } from '@/lib/validation/phone';

const OPT_OUT_TERMS = new Set(['sair', 'parar', 'cancelar', 'remover', 'nao quero receber']);

export function normalizeOptOutText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ');
}

export function isOptOutMessage(value: string): boolean {
  return OPT_OUT_TERMS.has(normalizeOptOutText(value));
}

export function withOptOutInstruction(value: string): string {
  const body = value.trim();
  if (/responda\s+sair/i.test(normalizeOptOutText(body))) return body;
  return `${body}${body ? '\n\n' : ''}Para não receber mais mensagens, responda SAIR.`;
}

function phoneVariants(phone: string): string[] {
  const national = parsePhone(phone)?.digits ?? phone.replace(/\D/g, '').replace(/^55/, '');
  return national ? [national, `55${national}`] : [];
}

export async function optedOutPhoneSet(phones: Iterable<string>): Promise<Set<string>> {
  const national = new Set<string>();
  for (const phone of phones) {
    const parsed = phoneVariants(phone)[0];
    if (parsed) national.add(parsed);
  }
  if (national.size === 0) return new Set();
  const rows = await prisma.optOut.findMany({
    where: { phone: { in: [...national].flatMap((phone) => [phone, `55${phone}`]) } },
    select: { phone: true },
  });
  return new Set(rows.map((row) => phoneVariants(row.phone)[0]).filter(Boolean) as string[]);
}

export async function isPhoneOptedOut(phone: string): Promise<boolean> {
  const variants = phoneVariants(phone);
  if (variants.length === 0) return false;
  return Boolean(await prisma.optOut.findFirst({ where: { phone: { in: variants } }, select: { id: true } }));
}

export async function recordInboundOptOut(leadId: string, phone: string): Promise<void> {
  const national = phoneVariants(phone)[0];
  if (!national) return;
  await prisma.optOut.upsert({
    where: { leadId_phone: { leadId, phone: national } },
    create: { leadId, phone: national, source: 'INBOUND', reason: 'Solicitado por mensagem.' },
    update: { source: 'INBOUND', reason: 'Solicitado por mensagem.' },
  });
  await prisma.campaignRecipient.updateMany({
    where: { phone: { in: [national, `55${national}`] }, status: { in: ['PENDING', 'QUEUED'] } },
    data: { status: 'OPTED_OUT', error: 'Opt-out solicitado por mensagem.', processedAt: new Date() },
  });
}
