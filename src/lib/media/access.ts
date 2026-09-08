import type { Role } from '@prisma/client';

export function canAccessMediaAsset(input: {
  readonly userId: string;
  readonly role: Role;
  readonly createdById: string | null;
  readonly attachedToTemplate: boolean;
  readonly conversationInScope: boolean;
}): boolean {
  if (input.attachedToTemplate) return true;
  if (input.conversationInScope) return true;
  return input.createdById === input.userId;
}
