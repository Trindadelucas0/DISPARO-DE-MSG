/** Contrato de teclado do sistema. Fiscalizado pela regra ux-ui-crm §6. */

export interface ShortcutSpec {
  readonly id: string;
  readonly keys: string;
  readonly label: string;
  /** Se dispara mesmo com foco em campo de texto. */
  readonly worksInInput: boolean;
}

export const SHORTCUTS: readonly ShortcutSpec[] = [
  { id: 'command-palette', keys: 'Ctrl/Cmd + K', label: 'Paleta de comandos', worksInInput: true },
  { id: 'focus-search', keys: '/', label: 'Focar a busca', worksInInput: false },
  { id: 'row-next', keys: 'j', label: 'Próxima linha', worksInInput: false },
  { id: 'row-prev', keys: 'k', label: 'Linha anterior', worksInInput: false },
  { id: 'row-open', keys: 'Enter', label: 'Abrir o drawer do lead', worksInInput: false },
  { id: 'row-edit', keys: 'e', label: 'Editar o lead na página completa', worksInInput: false },
  { id: 'row-select', keys: 'x', label: 'Marcar a linha para ação em lote', worksInInput: false },
  { id: 'row-whatsapp', keys: 'w', label: 'Focar Próxima ação / WhatsApp', worksInInput: false },
  { id: 'close-layer', keys: 'Esc', label: 'Fechar a camada do topo', worksInInput: true },
  { id: 'inbox-reply', keys: 'r', label: 'Focar resposta na Inbox', worksInInput: false },
  { id: 'inbox-take', keys: 'a', label: 'Assumir conversa', worksInInput: false },
  { id: 'inbox-transfer', keys: 't', label: 'Transferir conversa', worksInInput: false },
  { id: 'inbox-resolve', keys: 'c', label: 'Resolver conversa', worksInInput: false },
];

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Um atalho de linha nunca deve disparar enquanto o usuário digita. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (EDITABLE_TAGS.has(target.tagName)) return true;
  return target.isContentEditable;
}
