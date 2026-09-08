import { hash } from 'bcryptjs';
import type { Role } from '@prisma/client';

import { prisma } from '@/lib/db';

const BCRYPT_ROUNDS = 12;

export async function listUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { name: 'asc' },
  });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: Role;
}) {
  const passwordHash = await hash(data.password, BCRYPT_ROUNDS);
  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
      active: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}

export async function updateUser(
  id: string,
  data: { name?: string; role?: Role; active?: boolean; password?: string },
) {
  const passwordHash = data.password ? await hash(data.password, BCRYPT_ROUNDS) : undefined;
  return prisma.user.update({
    where: { id },
    data: {
      name: data.name,
      role: data.role,
      active: data.active,
      passwordHash,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}

export async function countActiveAdmins(): Promise<number> {
  return prisma.user.count({ where: { role: 'ADMIN', active: true } });
}
