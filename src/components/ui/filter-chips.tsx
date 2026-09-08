'use client';

import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AddableFilter, FilterChip } from '@/features/leads/filter-model';

export function FilterChipList({
  chips,
  onRemove,
}: {
  chips: readonly FilterChip[];
  onRemove: (key: FilterChip['key']) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-1">
      {chips.map((chip) => (
        <li key={chip.key}>
          <span className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-muted px-1.5 text-xs text-foreground">
            <span className="text-muted-foreground">{chip.field}:</span>
            <span className="max-w-40 truncate">{chip.value}</span>
            <button
              type="button"
              className="rounded-sm p-0.5 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => onRemove(chip.key)}
              aria-label={`Remover filtro ${chip.field}`}
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AddFilterMenu({
  available,
  onPick,
}: {
  available: readonly AddableFilter[];
  onPick: (key: AddableFilter['key']) => void;
}) {
  if (available.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Plus aria-hidden />
          Adicionar filtro
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {available.map((item) => (
          <DropdownMenuItem key={item.key} onSelect={() => onPick(item.key)}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
