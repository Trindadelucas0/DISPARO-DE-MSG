import { describe, expect, it } from 'vitest';

import {
  campaignDayKey,
  isCriticalWhatsAppFailure,
} from '@/lib/campaign-safety';

describe('proteção operacional de campanhas', () => {
  it('vira o dia no fuso de São Paulo', () => {
    expect(campaignDayKey(new Date('2026-11-05T02:59:59.000Z'))).toBe('2026-11-04');
    expect(campaignDayKey(new Date('2026-11-05T03:00:00.000Z'))).toBe('2026-11-05');
  });

  it('classifica sinais críticos sem confundir erro comum', () => {
    expect(isCriticalWhatsAppFailure(new Error('status 463 restricted'))).toBe(true);
    expect(isCriticalWhatsAppFailure(new Error('connection conflict'))).toBe(true);
    expect(isCriticalWhatsAppFailure(new Error('status 440 connection replaced'))).toBe(true);
    expect(isCriticalWhatsAppFailure(new Error('timeout temporário'))).toBe(false);
  });
});
