import { Role } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { auth } from '@/lib/auth';
import {
  SELLER_FORBIDDEN_MESSAGE,
  canBrowseLeadDirectory as canBrowseLeadDirectoryByRole,
  canViewLeadContact as canViewLeadContactByRole,
} from '@/lib/auth/access';

/**
 * Autorização. Toda decisão acontece aqui, no servidor.
 *
 * O cliente nunca é fonte de verdade: `responsavelId` vindo do corpo da
 * requisição é ignorado para usuários sem permissão de reatribuir.
 */

export interface SessionUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
}

export class UnauthorizedError extends Error {
  constructor(message = 'Sessão expirada ou ausente. Faça login novamente.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Você não tem permissão para esta ação.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    name: session.user.name ?? '',
    email: session.user.email ?? '',
    role: session.user.role,
  };
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireRole(...allowed: readonly Role[]): Promise<SessionUser> {
  const user = await requireSession();
  if (!allowed.includes(user.role)) {
    throw new ForbiddenError(
      `Esta ação exige perfil ${allowed.map(roleLabel).join(' ou ')}. Seu perfil é ${roleLabel(user.role)}.`,
    );
  }
  return user;
}

function roleLabel(role: Role): string {
  if (role === Role.ADMIN) return 'Administrador';
  if (role === Role.MANAGER) return 'Gestor';
  return 'Vendedor';
}

/**
 * Recorte de leads visíveis pelo papel.
 *
 * ADMIN e MANAGER veem toda a base. USER vê apenas os leads atribuídos a ele
 * (sem fila sem responsável e sem lead de outro vendedor).
 *
 * ATENÇÃO: MANAGER hoje equivale a ADMIN em leitura porque não existe entidade
 * de equipe no modelo. Quando `Team` for criado, o filtro passa a ser
 * `responsavelId in (membros da equipe)`. Está registrado em DOCUMENTACAO-SISTEMA.md.
 */
export function leadScopeWhere(user: SessionUser): Prisma.LeadWhereInput {
  if (user.role === Role.ADMIN || user.role === Role.MANAGER) return {};
  return { responsavelId: user.id };
}

export function canReassignLeads(user: SessionUser): boolean {
  return user.role === Role.ADMIN || user.role === Role.MANAGER;
}

export function canImport(user: SessionUser): boolean {
  return user.role === Role.ADMIN || user.role === Role.MANAGER;
}

export function canManageUsers(user: SessionUser): boolean {
  return user.role === Role.ADMIN;
}

/** USER só escreve no lead que já é dele. Não pega fila sem responsável. */
export function canWriteLead(
  user: SessionUser,
  lead: { readonly responsavelId: string | null },
): boolean {
  if (user.role === Role.ADMIN || user.role === Role.MANAGER) return true;
  return lead.responsavelId === user.id;
}

export function canManageCampaigns(user: SessionUser): boolean {
  return user.role === Role.ADMIN || user.role === Role.MANAGER;
}

export function canSuperviseInbox(user: SessionUser): boolean {
  return user.role === Role.ADMIN || user.role === Role.MANAGER;
}

export function canManageWhatsAppAccounts(user: SessionUser): boolean {
  return user.role === Role.ADMIN;
}

export function canBrowseLeadDirectory(user: SessionUser): boolean {
  return canBrowseLeadDirectoryByRole(user.role);
}

export function canViewLeadContact(user: SessionUser): boolean {
  return canViewLeadContactByRole(user.role);
}

/** Gestor/admin. USER não passa. */
export async function requireStaff(): Promise<SessionUser> {
  return requireRole(Role.ADMIN, Role.MANAGER);
}

export function assertStaff(user: SessionUser): void {
  if (!canBrowseLeadDirectory(user)) {
    throw new ForbiddenError(SELLER_FORBIDDEN_MESSAGE);
  }
}

/**
 * Recorte de conversas. USER só vê conversa atribuída a ele.
 * Não vê fila sem dono nem conversa de outro vendedor.
 */
export function conversationScopeWhere(user: SessionUser): Prisma.ConversationWhereInput {
  if (user.role === Role.ADMIN || user.role === Role.MANAGER) return {};
  return { assignedUserId: user.id };
}

export function canWriteConversation(
  user: SessionUser,
  conversation: { readonly assignedUserId: string | null },
): boolean {
  if (user.role === Role.ADMIN || user.role === Role.MANAGER) return true;
  return conversation.assignedUserId === user.id;
}
