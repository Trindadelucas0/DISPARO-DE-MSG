import { describe, expect, it } from 'vitest';

import { queryKeysForEventTags } from '@/lib/event-query-keys';
import { MUTATION_TAGS } from '@/lib/events';

describe('queryKeysForEventTags', () => {
  it('lead atualiza lista, kanban e timeline', () => {
    const keys = queryKeysForEventTags(['leads', 'lead:abc']).map((key) => key.join('/'));
    expect(keys).toEqual(['leads', 'kanban', 'interactions']);
  });

  it('conversa atualiza inbox e supervisão', () => {
    const keys = queryKeysForEventTags(['conversations']).map((key) => key.join('/'));
    expect(keys).toEqual(['conversations', 'admin']);
  });

  it('importação avisa a tela Importar e a base de leads', () => {
    const keys = queryKeysForEventTags(['import-jobs', 'leads']).map((key) => key.join('/'));
    expect(keys).toContain('import');
    expect(keys).toContain('leads');
    expect(keys).toContain('kanban');
  });

  it('toda tag de mutação conhecida invalida alguma query', () => {
    const samples = [
      ...MUTATION_TAGS.lead('lead-1'),
      ...MUTATION_TAGS.leadsBulk,
      ...MUTATION_TAGS.followUp,
      ...MUTATION_TAGS.template,
      ...MUTATION_TAGS.users,
      ...MUTATION_TAGS.campaign,
      ...MUTATION_TAGS.conversation,
      ...MUTATION_TAGS.whatsapp,
      'import-jobs',
    ];
    for (const tag of samples) {
      expect(queryKeysForEventTags([tag]).length, tag).toBeGreaterThan(0);
    }
  });
});
