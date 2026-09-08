import type { Role } from '@prisma/client';

export interface NavItem {
  readonly href: string;
  readonly label: string;
  /** Nome do ícone em lucide-react. Só esta biblioteca é permitida. */
  readonly icon:
    | 'LayoutDashboard'
    | 'Table2'
    | 'PhoneCall'
    | 'Columns3'
    | 'CalendarClock'
    | 'MessageSquare'
    | 'ChartNoAxesColumn'
    | 'Upload'
    | 'Settings'
    | 'Megaphone'
    | 'Inbox'
    | 'Smartphone'
    | 'Headset';
  /** Fase em que a tela passa a funcionar. 1–9 no MVP; 13 = atendimento. */
  readonly phase: number;
  readonly roles?: readonly Role[];
  /** Agrupa o menu: operação | visão | sistema. */
  readonly section: 'operate' | 'insight' | 'system';
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/leads', label: 'Leads', icon: 'Table2', phase: 2, roles: ['ADMIN', 'MANAGER'], section: 'operate' },
  { href: '/contacts/today', label: 'Contatos', icon: 'PhoneCall', phase: 5, roles: ['ADMIN', 'MANAGER'], section: 'operate' },
  { href: '/campaigns', label: 'Campanhas', icon: 'Megaphone', phase: 13, roles: ['ADMIN', 'MANAGER'], section: 'operate' },
  { href: '/inbox', label: 'Inbox', icon: 'Inbox', phase: 13, section: 'operate' },
  { href: '/kanban', label: 'Kanban', icon: 'Columns3', phase: 4, section: 'operate' },
  { href: '/follow-ups', label: 'Follow-ups', icon: 'CalendarClock', phase: 5, roles: ['ADMIN', 'MANAGER'], section: 'operate' },
  { href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard', phase: 3, roles: ['ADMIN', 'MANAGER'], section: 'insight' },
  { href: '/reports', label: 'Relatórios', icon: 'ChartNoAxesColumn', phase: 7, roles: ['ADMIN', 'MANAGER'], section: 'insight' },
  { href: '/messages', label: 'Mensagens', icon: 'MessageSquare', phase: 6, roles: ['ADMIN', 'MANAGER'], section: 'insight' },
  { href: '/whatsapp', label: 'WhatsApp', icon: 'Smartphone', phase: 13, roles: ['ADMIN', 'MANAGER'], section: 'system' },
  { href: '/import', label: 'Importar', icon: 'Upload', phase: 2, roles: ['ADMIN', 'MANAGER'], section: 'system' },
  {
    href: '/admin/atendimento',
    label: 'Supervisão',
    icon: 'Headset',
    phase: 13,
    roles: ['ADMIN', 'MANAGER'],
    section: 'system',
  },
  { href: '/settings', label: 'Configurações', icon: 'Settings', phase: 1, roles: ['ADMIN', 'MANAGER'], section: 'system' },
];

/** Fases já entregues. Uma rota de fase futura renderiza estado "não implementado". */
export const IMPLEMENTED_PHASES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 13] as const;

export function isPhaseImplemented(phase: number): boolean {
  return (IMPLEMENTED_PHASES as readonly number[]).includes(phase);
}

export function navItemsForRole(role: Role): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
