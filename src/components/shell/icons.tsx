import {
  CalendarClock,
  ChartNoAxesColumn,
  Columns3,
  Headset,
  Inbox,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  PhoneCall,
  Settings,
  Smartphone,
  Table2,
  Upload,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { NavItem } from '@/constants/navigation';

/** Única biblioteca de ícones do projeto: lucide-react (regra ux-ui-crm §7.11). */
const ICONS: Record<NavItem['icon'], LucideIcon> = {
  LayoutDashboard,
  Table2,
  PhoneCall,
  Columns3,
  CalendarClock,
  MessageSquare,
  ChartNoAxesColumn,
  Upload,
  Settings,
  Megaphone,
  Inbox,
  Smartphone,
  Headset,
};

export function navIcon(name: NavItem['icon']): LucideIcon {
  return ICONS[name];
}
