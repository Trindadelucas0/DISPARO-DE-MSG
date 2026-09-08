export interface RoutingLeadSnapshot {
  readonly estado: string | null;
  readonly cidade: string | null;
  readonly segmento: string | null;
  readonly porte: string | null;
  readonly responsavelId: string | null;
}

export interface RoutingRuleMatchInput {
  readonly field: string;
  readonly operator: string;
  readonly value: string;
  readonly userId: string;
  readonly priority: number;
  readonly active: boolean;
}

function fieldValue(lead: RoutingLeadSnapshot, field: string): string | null {
  if (field === 'estado') return lead.estado;
  if (field === 'cidade') return lead.cidade;
  if (field === 'segmento') return lead.segmento;
  if (field === 'porte') return lead.porte;
  return null;
}

function matches(rule: RoutingRuleMatchInput, lead: RoutingLeadSnapshot): boolean {
  if (!rule.active) return false;
  const actual = fieldValue(lead, rule.field);
  if (actual == null || actual.trim() === '') return false;
  const expected = rule.value.trim();
  const left = actual.trim().toLocaleLowerCase('pt-BR');
  const right = expected.toLocaleLowerCase('pt-BR');
  if (rule.operator === 'eq' || rule.operator === 'equals') return left === right;
  if (rule.operator === 'contains') return left.includes(right);
  if (rule.operator === 'in') {
    const parts = expected.split(',').map((part) => part.trim().toLocaleLowerCase('pt-BR'));
    return parts.includes(left);
  }
  return false;
}

export function findMatchingRules(
  rules: readonly RoutingRuleMatchInput[],
  lead: RoutingLeadSnapshot,
): RoutingRuleMatchInput[] {
  return rules
    .filter((rule) => matches(rule, lead))
    .slice()
    .sort((a, b) => b.priority - a.priority);
}

export function pickRoundRobinUser(userIds: readonly string[], cursor: number): {
  readonly userId: string | null;
  readonly nextCursor: number;
} {
  if (userIds.length === 0) return { userId: null, nextCursor: 0 };
  const index = ((cursor % userIds.length) + userIds.length) % userIds.length;
  return { userId: userIds[index] ?? null, nextCursor: index + 1 };
}
