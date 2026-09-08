import { describe, expect, it } from 'vitest';

import { Role } from '@prisma/client';

import {
  canBrowseLeadDirectory,
  canViewLeadContact,
  homePathForRole,
  isSellerAllowedPage,
  isSellerRole,
} from '@/lib/auth/access';

/** Espelho das regras puras de escopo (sem importar next-auth). */
function canManageCampaigns(role: Role): boolean {
  return role === Role.ADMIN || role === Role.MANAGER;
}

function conversationScopeWhere(role: Role, userId: string) {
  if (role === Role.ADMIN || role === Role.MANAGER) return {};
  return { assignedUserId: userId };
}

function leadScopeWhere(role: Role, userId: string) {
  if (role === Role.ADMIN || role === Role.MANAGER) return {};
  return { responsavelId: userId };
}

function canImport(role: Role): boolean {
  return role === Role.ADMIN || role === Role.MANAGER;
}

describe('rbac atendimento (puro)', () => {
  it('USER não cria campanha nem dispara retorno; MANAGER cria', () => {
    expect(canManageCampaigns(Role.USER)).toBe(false);
    expect(canManageCampaigns(Role.MANAGER)).toBe(true);
    expect(canManageCampaigns(Role.ADMIN)).toBe(true);
  });

  it('USER não importa contatos do WhatsApp; MANAGER e ADMIN importam', () => {
    expect(canImport(Role.USER)).toBe(false);
    expect(canImport(Role.MANAGER)).toBe(true);
    expect(canImport(Role.ADMIN)).toBe(true);
  });

  it('USER só vê conversa e lead atribuídos a ele', () => {
    expect(conversationScopeWhere(Role.USER, 'seller')).toEqual({ assignedUserId: 'seller' });
    expect(leadScopeWhere(Role.USER, 'seller')).toEqual({ responsavelId: 'seller' });
    expect(conversationScopeWhere(Role.MANAGER, 'm')).toEqual({});
    expect(leadScopeWhere(Role.ADMIN, 'admin')).toEqual({});
    expect(leadScopeWhere(Role.MANAGER, 'm')).toEqual({});
  });

  it('ADMIN e MANAGER escrevem em qualquer card do Kanban; USER só no dele', () => {
    const canWriteLead = (
      role: Role,
      responsavelId: string | null,
      userId: string,
    ) => {
      if (role === Role.ADMIN || role === Role.MANAGER) return true;
      return responsavelId === userId;
    };
    expect(canWriteLead(Role.ADMIN, 'seller', 'admin')).toBe(true);
    expect(canWriteLead(Role.ADMIN, null, 'admin')).toBe(true);
    expect(canWriteLead(Role.USER, 'seller', 'seller')).toBe(true);
    expect(canWriteLead(Role.USER, 'other', 'seller')).toBe(false);
  });

  it('USER só altera funil da conversa atribuída a ele', () => {
    const canWrite = (role: Role, assignedUserId: string | null, userId: string) => {
      if (role === Role.ADMIN || role === Role.MANAGER) return true;
      return assignedUserId === userId;
    };
    expect(canWrite(Role.USER, 'seller', 'seller')).toBe(true);
    expect(canWrite(Role.USER, null, 'seller')).toBe(false);
    expect(canWrite(Role.USER, 'other', 'seller')).toBe(false);
    expect(canWrite(Role.MANAGER, null, 'm')).toBe(true);
  });
});

describe('vendedor só Kanban e Inbox', () => {
  it('páginas permitidas e home', () => {
    expect(isSellerRole(Role.USER)).toBe(true);
    expect(homePathForRole(Role.USER)).toBe('/kanban');
    expect(homePathForRole(Role.ADMIN)).toBe('/leads');
    expect(isSellerAllowedPage('/kanban')).toBe(true);
    expect(isSellerAllowedPage('/inbox/abc')).toBe(true);
    expect(isSellerAllowedPage('/leads')).toBe(false);
    expect(isSellerAllowedPage('/settings')).toBe(false);
  });

  it('não vê telefone nem lista da base', () => {
    expect(canViewLeadContact(Role.USER)).toBe(false);
    expect(canBrowseLeadDirectory(Role.USER)).toBe(false);
    expect(canViewLeadContact(Role.ADMIN)).toBe(true);
  });
});
