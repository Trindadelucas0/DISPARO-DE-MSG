const CAMPAIGN_TIME_ZONE = 'America/Sao_Paulo';

export function campaignDayKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAMPAIGN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

export function isCriticalWhatsAppFailure(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? '');
  return /(^|\D)(440|463)(\D|$)|conflict|restricted|restriction|ban(?:ned)?|bloquead|suspens/i.test(text);
}
