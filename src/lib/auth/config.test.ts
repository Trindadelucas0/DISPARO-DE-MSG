import { describe, expect, it } from 'vitest';

import { isApiPath, isExcludedFromAuthMiddleware, isPublicPath } from '@/lib/auth/config';

describe('matcher do middleware de Auth.js', () => {
  it('exclui API para não apagar o cookie de sessão no SSE', () => {
    expect(isApiPath('/api/events')).toBe(true);
    expect(isApiPath('/api/leads')).toBe(true);
    expect(isExcludedFromAuthMiddleware('/api/events')).toBe(true);
    expect(isExcludedFromAuthMiddleware('/api/leads')).toBe(true);
  });

  it('protege telas operacionais e deixa o vendedor só em Kanban e Inbox', () => {
    expect(isExcludedFromAuthMiddleware('/leads')).toBe(false);
    expect(isExcludedFromAuthMiddleware('/campaigns')).toBe(false);
    expect(isPublicPath('/login')).toBe(true);
  });
});
