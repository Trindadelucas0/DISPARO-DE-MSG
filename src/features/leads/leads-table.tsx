'use client';

import { ArrowDown, ArrowUp, MessageCircle } from 'lucide-react';
import * as React from 'react';

import { ResultBadge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CompanyIdentity } from '@/components/ui/record-avatar';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/primitives';
import { LEAD_COLUMNS, type LeadColumn } from '@/features/leads/columns';
import type { LeadSortField } from '@/features/leads/schema';
import { dash, formatCnpj, formatDate, formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SerializedLeadListRow } from '@/server/services/lead.service';

function SortHeader({
  column,
  currentSort,
  currentDir,
  onSort,
}: {
  column: LeadColumn;
  currentSort: LeadSortField;
  currentDir: 'asc' | 'desc';
  onSort: (field: LeadSortField) => void;
}) {
  if (!column.sort) return <>{column.label}</>;

  const active = currentSort === column.sort;
  const Arrow = currentDir === 'asc' ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      onClick={() => onSort(column.sort as LeadSortField)}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        active ? 'text-foreground' : 'hover:text-foreground',
      )}
      aria-label={`Ordenar por ${column.label}`}
    >
      {column.label}
      {active ? <Arrow className="size-3" aria-hidden /> : null}
    </button>
  );
}

export function LeadsTable({
  rows,
  selected,
  focusedIndex,
  sort,
  dir,
  onToggleRow,
  onToggleAll,
  onSort,
  onFocusRow,
  onOpenRow,
  onWhatsapp,
}: {
  rows: readonly SerializedLeadListRow[];
  selected: ReadonlySet<string>;
  focusedIndex: number;
  sort: LeadSortField;
  dir: 'asc' | 'desc';
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  onSort: (field: LeadSortField) => void;
  onFocusRow: (index: number) => void;
  onOpenRow: (id: string) => void;
  onWhatsapp: (id: string) => void;
}) {
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const someSelected = rows.some((row) => selected.has(row.id));

  return (
    <Table>
      <THead>
        <TR className="h-9 hover:bg-muted">
          <TH className="w-8">
            <Checkbox
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={onToggleAll}
              aria-label="Selecionar todos os leads da página"
            />
          </TH>
          {LEAD_COLUMNS.map((column) => (
            <TH key={column.key} align={column.align} className={column.className}>
              <SortHeader column={column} currentSort={sort} currentDir={dir} onSort={onSort} />
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {rows.map((row, index) => (
          <TR
            key={row.id}
            selected={selected.has(row.id)}
            focused={index === focusedIndex}
            onMouseDown={() => onFocusRow(index)}
            onClick={() => onOpenRow(row.id)}
            className="cursor-pointer"
          >
            <TD onClick={(event) => event.stopPropagation()}>
              <Checkbox
                checked={selected.has(row.id)}
                onCheckedChange={() => onToggleRow(row.id)}
                aria-label={`Selecionar ${row.razaoSocial}`}
              />
            </TD>

            <TD className="max-w-0">
              <CompanyIdentity
                id={row.id}
                cnpj={row.cnpj}
                razaoSocial={row.razaoSocial}
                nomeFantasia={row.nomeFantasia}
              />
            </TD>

            <TD className="numeric text-sm text-foreground">{formatCnpj(row.cnpj)}</TD>

            <TD className="numeric text-sm text-foreground">
              {row.telefone ? formatPhone(row.telefone) : '—'}
            </TD>

            <TD className="numeric text-sm text-foreground">
              {row.whatsapp ? formatPhone(row.whatsapp) : '—'}
            </TD>

            <TD className="max-w-0 truncate text-sm text-foreground" title={`${dash(row.cidade)} / ${dash(row.estado)}`}>
              {dash(row.cidade)}
              {row.estado ? ` / ${row.estado}` : ''}
            </TD>

            <TD>
              <StatusBadge status={row.status} short />
            </TD>

            <TD className="max-w-0 truncate text-sm text-foreground">
              {dash(row.responsavelNome)}
            </TD>

            <TD className="numeric text-sm text-foreground">
              {row.nextContactAt ? formatDate(row.nextContactAt) : '—'}
            </TD>

            <TD>
              <ResultBadge result={row.lastInteractionResult} />
            </TD>

            <TD onClick={(event) => event.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!row.whatsapp}
                onClick={() => onWhatsapp(row.id)}
                aria-label={
                  row.whatsapp
                    ? `WhatsApp de ${row.razaoSocial}`
                    : `Sem celular na base para ${row.razaoSocial}`
                }
                title={row.whatsapp ? 'Abrir WhatsApp' : 'Sem celular na base'}
              >
                <MessageCircle aria-hidden />
              </Button>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
