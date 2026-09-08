import { identitySlot, initialsFromName, type IdentitySlot } from '@/lib/identity';
import { cn } from '@/lib/utils';

const SIZE_CLASS = {
  sm: 'size-5 text-2xs',
  md: 'size-7 text-xs',
  lg: 'size-8 text-sm',
} as const;

/** Classes literais para o Tailwind varrer este arquivo (content: src/components). */
const SLOT_BG: Readonly<Record<IdentitySlot, string>> = {
  0: 'bg-identity-0',
  1: 'bg-identity-1',
  2: 'bg-identity-2',
  3: 'bg-identity-3',
  4: 'bg-identity-4',
  5: 'bg-identity-5',
};

/**
 * Avatar de iniciais. Matiz vem de `--identity-*` via hash estável do seed
 * (CNPJ ou id). Não reutiliza cor de funil nem de resultado.
 */
export function RecordAvatar({
  name,
  seed,
  size = 'sm',
  className,
}: {
  name: string;
  seed: string;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-sm font-medium uppercase text-identity-fg',
        SIZE_CLASS[size],
        SLOT_BG[identitySlot(seed)],
        className,
      )}
      aria-hidden
    >
      {initialsFromName(name)}
    </span>
  );
}

/** Coluna de identidade: avatar + razão social + fantasia secundária. */
export function CompanyIdentity({
  id,
  cnpj,
  razaoSocial,
  nomeFantasia,
  size = 'sm',
}: {
  id: string;
  cnpj?: string | null;
  razaoSocial: string;
  nomeFantasia?: string | null;
  size?: keyof typeof SIZE_CLASS;
}) {
  const secondary = nomeFantasia?.trim() || null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <RecordAvatar name={razaoSocial} seed={cnpj || id} size={size} />
      <div className="min-w-0 overflow-hidden">
        <span className="block truncate text-sm font-medium leading-4 text-foreground" title={razaoSocial}>
          {razaoSocial}
        </span>
        {secondary ? (
          <span className="block truncate text-2xs leading-3 text-muted-foreground" title={secondary}>
            {secondary}
          </span>
        ) : null}
      </div>
    </div>
  );
}
