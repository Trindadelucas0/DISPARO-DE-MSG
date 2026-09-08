/** USER (vendedor) só opera Kanban e Inbox. O restante é gestor/admin. */
export const SELLER_PAGE_PREFIXES = ['/kanban', '/inbox'] as const;

export const SELLER_FORBIDDEN_MESSAGE =
  'O vendedor só atualiza o Kanban e conversa na Inbox.';

export function isSellerRole(role: string | undefined): boolean {
  return role === 'USER';
}

export function homePathForRole(role: string | undefined): string {
  return isSellerRole(role) ? '/kanban' : '/leads';
}

export function isSellerAllowedPage(pathname: string): boolean {
  return SELLER_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function canBrowseLeadDirectory(role: string): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

export function canViewLeadContact(role: string): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}
