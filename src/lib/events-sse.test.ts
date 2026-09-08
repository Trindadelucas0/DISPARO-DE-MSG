import { describe, expect, it } from 'vitest';

import { consumeSse } from '@/lib/events-sse';

describe('consumeSse', () => {
  it('separa frames completos e deixa o resto incompleto', () => {
    const { rest, frames } = consumeSse(
      'event: hello\ndata: {"ok":true}\n\nevent: change\ndata: {"type":"lead.create"\n',
    );
    expect(frames).toEqual([
      { event: 'hello', data: '{"ok":true}' },
    ]);
    expect(rest).toBe('event: change\ndata: {"type":"lead.create"\n');
  });

  it('lê o evento idle (sem sessão, sem 401)', () => {
    const { frames } = consumeSse('retry: 30000\nevent: idle\ndata: {}\n\n');
    expect(frames[0]?.event).toBe('idle');
  });

  it('lê o evento change usado pelo EventsBridge', () => {
    const { frames } = consumeSse(
      'event: change\ndata: {"type":"whatsapp.session","tags":["whatsapp"],"at":"x"}\n\n',
    );
    expect(frames[0]?.event).toBe('change');
    expect(frames[0]?.data).toContain('whatsapp.session');
  });
});
