'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, Filter, Search, Settings2, X } from 'lucide-react';
import type { LeadStatus } from '@prisma/client';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddFilterMenu, FilterChipList } from '@/components/ui/filter-chips';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from '@/components/ui/primitives';
import { LEAD_STATUS_ORDER, leadStatusLabel } from '@/constants/lead-status';
import { INTERACTION_RESULT_ORDER, interactionResultLabel } from '@/constants/interactions';
import {
  availableAddFilters,
  chipsFromFilters,
  LEAD_SORT_LABELS,
  type FilterChipKey,
} from '@/features/leads/filter-model';
import { LEAD_SORT_FIELDS, SITUACAO_CADASTRAL_VALUES, type LeadFilters } from '@/features/leads/schema';
import type { LeadFacets } from '@/server/services/lead.service';
import { cn } from '@/lib/utils';

/** Valor sentinela do Select: Radix não aceita item com valor vazio. */
const ANY = '__any__';
const UNASSIGNED = 'none';

function toSelectValue(value: string | undefined): string {
  return value ?? ANY;
}

function fromSelectValue(value: string): string | undefined {
  return value === ANY ? undefined : value;
}

function FacetSelect({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: readonly { value: string; count: number }[];
  placeholder: string;
  onChange: (next: string | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <Select value={toSelectValue(value)} onValueChange={(next) => onChange(fromSelectValue(next))}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.value} ({option.count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TriStateCheck({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (next: boolean | undefined) => void;
}) {
  return (
    <label className="flex h-7 cursor-pointer items-center gap-2 text-sm">
      <Checkbox
        checked={value === true}
        onCheckedChange={(checked) => onChange(checked === true ? true : undefined)}
      />
      {label}
    </label>
  );
}

function DateRange({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from: string | undefined;
  to: string | undefined;
  onChange: (patch: { from?: string; to?: string }) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          numeric
          value={from ?? ''}
          onChange={(event) => onChange({ from: event.target.value })}
          aria-label={`${label} — de`}
        />
        <span className="text-xs text-muted-foreground">até</span>
        <Input
          type="date"
          numeric
          value={to ?? ''}
          onChange={(event) => onChange({ to: event.target.value })}
          aria-label={`${label} — até`}
        />
      </div>
    </div>
  );
}

export function LeadFiltersPopover({
  filters,
  facets,
  activeCount,
  onChange,
}: {
  filters: LeadFilters;
  facets: LeadFacets | undefined;
  activeCount: number;
  onChange: (patch: Partial<LeadFilters>) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="md">
          <Settings2 aria-hidden />
          Opções
          {activeCount > 0 ? (
            <span className="numeric ml-0.5 rounded-sm bg-primary/15 px-1 text-2xs text-primary">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[26rem]">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <FacetSelect
              label="Cidade"
              value={filters.city}
              options={facets?.cities ?? []}
              placeholder="Todas"
              onChange={(city) => onChange({ city })}
            />
            <FacetSelect
              label="Porte"
              value={filters.porte}
              options={facets?.portes ?? []}
              placeholder="Todos"
              onChange={(porte) => onChange({ porte })}
            />
            <FacetSelect
              label="Segmento"
              value={filters.segment}
              options={facets?.segments ?? []}
              placeholder="Todos"
              onChange={(segment) => onChange({ segment })}
            />
            <FacetSelect
              label="Origem"
              value={filters.source}
              options={facets?.sources ?? []}
              placeholder="Todas"
              onChange={(source) => onChange({ source })}
            />

            <div className="flex flex-col gap-1">
              <Label>Campanha</Label>
              <Select
                value={toSelectValue(filters.campaignId)}
                onValueChange={(next) => onChange({ campaignId: fromSelectValue(next) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Todas</SelectItem>
                  {(facets?.campaigns ?? []).map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label>Tag</Label>
              <Select
                value={toSelectValue(filters.tag)}
                onValueChange={(next) => onChange({ tag: fromSelectValue(next) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Todas</SelectItem>
                  {(facets?.tags ?? []).map((tag) => (
                    <SelectItem key={tag.id} value={tag.name}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-1">
            <Label>Situação cadastral na Receita</Label>
            <Select
              value={filters.situacao}
              onValueChange={(next) => onChange({ situacao: next as LeadFilters['situacao'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as situações</SelectItem>
                {SITUACAO_CADASTRAL_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label>Canal de contato disponível</Label>
            <div className="flex items-center gap-4">
              <TriStateCheck
                label="WhatsApp"
                value={filters.hasWhatsapp}
                onChange={(hasWhatsapp) => onChange({ hasWhatsapp })}
              />
              <TriStateCheck
                label="Telefone"
                value={filters.hasPhone}
                onChange={(hasPhone) => onChange({ hasPhone })}
              />
              <TriStateCheck
                label="E-mail"
                value={filters.hasEmail}
                onChange={(hasEmail) => onChange({ hasEmail })}
              />
            </div>
          </div>

          <Separator />

          <DateRange
            label="Cadastrado no CRM"
            from={filters.createdFrom}
            to={filters.createdTo}
            onChange={(patch) =>
              onChange({
                createdFrom: patch.from ?? filters.createdFrom,
                createdTo: patch.to ?? filters.createdTo,
              })
            }
          />
          <DateRange
            label="Último contato"
            from={filters.lastContactFrom}
            to={filters.lastContactTo}
            onChange={(patch) =>
              onChange({
                lastContactFrom: patch.from ?? filters.lastContactFrom,
                lastContactTo: patch.to ?? filters.lastContactTo,
              })
            }
          />
          <DateRange
            label="Próximo contato"
            from={filters.nextContactFrom}
            to={filters.nextContactTo}
            onChange={(patch) =>
              onChange({
                nextContactFrom: patch.from ?? filters.nextContactFrom,
                nextContactTo: patch.to ?? filters.nextContactTo,
              })
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterMenu({
  filters: _filters,
  facets,
  onChange,
  hideResponsible = false,
  statusOptions = LEAD_STATUS_ORDER,
}: {
  filters: LeadFilters;
  facets: LeadFacets | undefined;
  onChange: (patch: Partial<LeadFilters>) => void;
  hideResponsible?: boolean;
  statusOptions?: readonly LeadStatus[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="md">
          <Filter aria-hidden />
          Filtro
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {statusOptions.map((status) => (
              <DropdownMenuItem key={status} onSelect={() => onChange({ status })}>
                {leadStatusLabel(status)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>UF</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
            {(facets?.states ?? []).map((option) => (
              <DropdownMenuItem key={option.value} onSelect={() => onChange({ state: option.value })}>
                {option.value} ({option.count})
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {hideResponsible ? null : (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Responsável</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => onChange({ responsible: UNASSIGNED })}>
                Sem responsável
              </DropdownMenuItem>
              {(facets?.responsaveis ?? []).map((person) => (
                <DropdownMenuItem key={person.id} onSelect={() => onChange({ responsible: person.id })}>
                  {person.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Campanha</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
            {(facets?.campaigns ?? []).length === 0 ? (
              <DropdownMenuItem disabled>Nenhuma campanha</DropdownMenuItem>
            ) : (
              (facets?.campaigns ?? []).map((campaign) => (
                <DropdownMenuItem
                  key={campaign.id}
                  onSelect={() => onChange({ campaignId: campaign.id })}
                >
                  {campaign.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Cidade</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
            {(facets?.cities ?? []).map((option) => (
              <DropdownMenuItem key={option.value} onSelect={() => onChange({ city: option.value })}>
                {option.value} ({option.count})
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Última interação</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {INTERACTION_RESULT_ORDER.map((result) => (
              <DropdownMenuItem key={result} onSelect={() => onChange({ lastResult: result })}>
                {interactionResultLabel(result)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => onChange({ hasWhatsapp: true })}>WhatsApp</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChange({ hasEmail: true })}>E-mail</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChange({ hasPhone: true })}>Telefone</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortMenu({
  filters,
  onChange,
}: {
  filters: LeadFilters;
  onChange: (patch: Partial<LeadFilters>) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="md">
          <ArrowUpDown aria-hidden />
          Ordenar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {LEAD_SORT_FIELDS.map((field) => {
          const active = filters.sort === field;
          const Arrow = filters.dir === 'asc' ? ArrowUp : ArrowDown;
          return (
            <DropdownMenuItem
              key={field}
              onSelect={() =>
                onChange({
                  sort: field,
                  dir: active && filters.dir === 'desc' ? 'asc' : 'desc',
                })
              }
            >
              {LEAD_SORT_LABELS[field]}
              {active ? <Arrow className="ml-auto size-3" aria-hidden /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FilterBar({
  filters,
  facets,
  activeCount,
  searchRef,
  onChange,
  onReset,
  showSearch = true,
  hideResponsible = false,
  searchPlaceholder = 'Nome, WhatsApp ou CNPJ',
  statusOptions = LEAD_STATUS_ORDER,
  className,
}: {
  filters: LeadFilters;
  facets: LeadFacets | undefined;
  activeCount: number;
  searchRef?: React.RefObject<HTMLInputElement | null>;
  onChange: (patch: Partial<LeadFilters>) => void;
  onReset: () => void;
  showSearch?: boolean;
  hideResponsible?: boolean;
  searchPlaceholder?: string;
  statusOptions?: readonly LeadStatus[];
  className?: string;
}) {
  const [searchDraft, setSearchDraft] = React.useState(filters.search ?? '');
  const committed = React.useRef(filters.search ?? '');
  const chips = chipsFromFilters(filters, facets).filter(
    (chip) => !(hideResponsible && chip.key === 'responsible'),
  );
  const addable = availableAddFilters(filters).filter(
    (item) => item.key === 'hasWhatsapp' || item.key === 'hasPhone' || item.key === 'hasEmail',
  );

  React.useEffect(() => {
    if (filters.search !== committed.current) {
      committed.current = filters.search ?? '';
      setSearchDraft(filters.search ?? '');
    }
  }, [filters.search]);

  React.useEffect(() => {
    if (searchDraft === committed.current) return;
    const timer = window.setTimeout(() => {
      committed.current = searchDraft;
      onChange({ search: searchDraft });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchDraft, onChange]);

  const applyAdd = (key: FilterChipKey) => {
    if (key === 'hasWhatsapp') {
      onChange({ hasWhatsapp: true });
      return;
    }
    if (key === 'hasPhone') {
      onChange({ hasPhone: true });
      return;
    }
    if (key === 'hasEmail') {
      onChange({ hasEmail: true });
      return;
    }
    // Campos que precisam de valor concreto ficam no menu Filtro ou em Opções.
  };

  return (
    <div className={cn('flex shrink-0 flex-col gap-2 border-b border-border px-4 py-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {showSearch ? (
          <div className="relative min-w-56 max-w-sm flex-1">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={searchRef}
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') event.currentTarget.blur();
              }}
              placeholder={searchPlaceholder}
              aria-label="Buscar leads"
              className="pl-7"
            />
          </div>
        ) : null}

        <FilterMenu
          filters={filters}
          facets={facets}
          onChange={onChange}
          hideResponsible={hideResponsible}
          statusOptions={statusOptions}
        />
        <SortMenu filters={filters} onChange={onChange} />
        <LeadFiltersPopover
          filters={filters}
          facets={facets}
          activeCount={activeCount}
          onChange={onChange}
        />

        {activeCount > 0 ? (
          <Button variant="ghost" size="md" onClick={onReset}>
            <X aria-hidden />
            Limpar
          </Button>
        ) : null}
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          <FilterChipList
            chips={chips}
            onRemove={(key) => {
              if (key === 'situacao') {
                onChange({ situacao: 'ATIVA' });
                return;
              }
              if (key === 'ids') {
                onChange({ ids: undefined });
                return;
              }
              if (key === 'campaignId') {
                onChange({ campaignId: undefined });
                return;
              }
              onChange({ [key]: undefined });
            }}
          />
          <AddFilterMenu available={addable} onPick={applyAdd} />
        </div>
      ) : null}
    </div>
  );
}
