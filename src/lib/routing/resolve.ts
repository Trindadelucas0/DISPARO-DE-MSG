import type { AssignmentReason, CampaignRoutingMode } from '@prisma/client';

import {
  findMatchingRules,
  pickRoundRobinUser,
  type RoutingLeadSnapshot,
  type RoutingRuleMatchInput,
} from '@/lib/routing/match';

export interface ResolveAssigneeInput {
  readonly mode: CampaignRoutingMode;
  readonly lead: RoutingLeadSnapshot;
  readonly rules: readonly RoutingRuleMatchInput[];
  readonly roundRobinUserIds: readonly string[];
  readonly roundRobinCursor: number;
  readonly restrictedUserIds: readonly string[];
}

export interface ResolveAssigneeResult {
  readonly userId: string | null;
  readonly reason: AssignmentReason;
  readonly nextCursor: number;
}

function allowed(userId: string | null, restricted: readonly string[]): string | null {
  if (!userId) return null;
  return restricted.includes(userId) ? null : userId;
}

export function resolveAssignee(input: ResolveAssigneeInput): ResolveAssigneeResult {
  const restricted = input.restrictedUserIds;

  if (input.mode === 'MANUAL') {
    return { userId: null, reason: 'UNASSIGNED', nextCursor: input.roundRobinCursor };
  }

  if (input.mode === 'CURRENT_OWNER') {
    return {
      userId: allowed(input.lead.responsavelId, restricted),
      reason: input.lead.responsavelId ? 'CURRENT_OWNER' : 'UNASSIGNED',
      nextCursor: input.roundRobinCursor,
    };
  }

  if (input.mode === 'RULES') {
    const matched = findMatchingRules(input.rules, input.lead);
    const chosen = matched.find((rule) => allowed(rule.userId, restricted));
    return {
      userId: chosen?.userId ?? null,
      reason: chosen ? 'ROUTING_RULE' : 'UNASSIGNED',
      nextCursor: input.roundRobinCursor,
    };
  }

  const eligible = input.roundRobinUserIds.filter((id) => !restricted.includes(id));
  const picked = pickRoundRobinUser(eligible, input.roundRobinCursor);
  return {
    userId: picked.userId,
    reason: picked.userId ? 'ROUND_ROBIN' : 'UNASSIGNED',
    nextCursor: picked.nextCursor,
  };
}
