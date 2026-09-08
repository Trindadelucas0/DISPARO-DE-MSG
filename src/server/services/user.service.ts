import type { Role } from '@prisma/client';

import { MUTATION_TAGS, notifyChange } from '@/lib/events';
import { ForbiddenError, canManageUsers, type SessionUser } from '@/lib/auth/rbac';
import { BadRequestError, NotFoundError } from '@/server/api-handler';
import {
  countActiveAdmins,
  createUser,
  findUserByEmail,
  listUsers,
  updateUser,
} from '@/server/repositories/user.repository';
import { recordAudit } from '@/server/services/audit.service';

function serialize(row: Awaited<ReturnType<typeof listUsers>>[number]) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function assertAdmin(user: SessionUser) {
  if (!canManageUsers(user)) {
    throw new ForbiddenError('Somente administrador gerencia usuários.');
  }
}

export async function getUsers(user: SessionUser) {
  assertAdmin(user);
  const rows = await listUsers();
  return rows.map(serialize);
}

export async function createAppUser(
  actor: SessionUser,
  input: { name: string; email: string; password: string; role: Role },
) {
  assertAdmin(actor);
  const existing = await findUserByEmail(input.email.trim().toLowerCase());
  if (existing) throw new BadRequestError('Já existe um usuário com este e-mail.');

  const row = await createUser({
    name: input.name,
    email: input.email.trim().toLowerCase(),
    password: input.password,
    role: input.role,
  });

  await recordAudit({
    userId: actor.id,
    action: 'user.create',
    entity: 'User',
    entityId: row.id,
    changes: { email: row.email, role: row.role },
  });
  await notifyChange({ type: 'user.create', tags: MUTATION_TAGS.users, entityId: row.id });
  return serialize(row);
}

export async function patchAppUser(
  actor: SessionUser,
  id: string,
  input: { name?: string; role?: Role; active?: boolean; password?: string },
) {
  assertAdmin(actor);
  const users = await listUsers();
  const current = users.find((row) => row.id === id);
  if (!current) throw new NotFoundError('Usuário não encontrado.');

  if (
    current.role === 'ADMIN' &&
    current.active &&
    (input.active === false || (input.role && input.role !== 'ADMIN'))
  ) {
    const admins = await countActiveAdmins();
    if (admins <= 1) {
      throw new BadRequestError('Não é possível desativar ou rebaixar o último administrador.');
    }
  }

  const row = await updateUser(id, input);
  await recordAudit({
    userId: actor.id,
    action: 'user.update',
    entity: 'User',
    entityId: id,
    changes: {
      name: input.name ?? null,
      role: input.role ?? null,
      active: input.active ?? null,
      passwordChanged: Boolean(input.password),
    },
  });
  await notifyChange({ type: 'user.update', tags: MUTATION_TAGS.users, entityId: id });
  return serialize(row);
}
