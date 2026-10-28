/**
 * Agenda em vCard para transmissão manual no celular.
 *
 * A lista de transmissão do WhatsApp é montada à mão, marcando contato por
 * contato. Para achar o lote certo na agenda, o nome de cada contato começa com
 * o rótulo do grupo (`A01`, `A02`, …): o celular ordena por nome e o grupo
 * inteiro fica junto. Rótulos vão de `A` a `Z` e, quando o alfabeto acaba,
 * recomeçam numerados (`A1`…`Z1`, `A2`…).
 */

/** Rótulo do grupo pela posição: 0→A, 25→Z, 26→A1, 52→A2. */
export function groupLabel(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  const round = Math.floor(index / 26);
  return round === 0 ? letter : `${letter}${round}`;
}

export function splitIntoGroups<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error('Tamanho do grupo tem que ser 1 ou mais.');
  const groups: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    groups.push(items.slice(start, start + size));
  }
  return groups;
}

/** `A01 Nome da empresa`. A posição acompanha a largura do grupo (50 → 2 dígitos). */
export function contactDisplayName(
  label: string,
  position: number,
  name: string,
  groupSize: number,
): string {
  const width = String(groupSize).length;
  const ordem = String(position).padStart(width, '0');
  const limpo = name.replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${label}${ordem} ${limpo}`.trim();
}

/** Escapa o que o vCard trata como separador. */
function escapeValue(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r?\n/g, '\\n');
}

export interface VCardContact {
  /** Nome como aparece na agenda, já com o rótulo do grupo. */
  readonly displayName: string;
  /** E.164 com o `+`: `+5562999999999`. */
  readonly phone: string;
  readonly organization?: string;
}

/** vCard 3.0 — o formato que iPhone e Android importam sem conversão. */
export function toVCard(contact: VCardContact): string {
  const nome = escapeValue(contact.displayName);
  const linhas = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${nome};;;;`,
    `FN:${nome}`,
    ...(contact.organization ? [`ORG:${escapeValue(contact.organization)}`] : []),
    `TEL;TYPE=CELL:${escapeValue(contact.phone)}`,
    'END:VCARD',
  ];
  return linhas.join('\r\n');
}

/** Arquivo .vcf com vários contatos (um por vCard, na ordem recebida). */
export function buildVCardFile(contacts: readonly VCardContact[]): string {
  return `${contacts.map(toVCard).join('\r\n')}\r\n`;
}

/** `5562999999999` (como o banco guarda) → `+5562999999999`. */
export function toE164(digits: string): string {
  return digits.startsWith('+') ? digits : `+${digits}`;
}
