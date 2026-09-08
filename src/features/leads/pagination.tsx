'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/primitives';
import { formatInteger } from '@/lib/format';

const PAGE_SIZES = [25, 50, 100, 200] as const;

/** Paginação por offset com contagem total (PRD §42). */
export function Pagination({
  page,
  limit,
  total,
  totalPages,
  loading,
  onPage,
  onLimit,
}: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  loading: boolean;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
}) {
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-t border-border px-4">
      <span className="numeric text-xs text-muted-foreground">
        {formatInteger(first)}–{formatInteger(last)} de {formatInteger(total)}
      </span>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">por página</span>
        <Select value={String(limit)} onValueChange={(value) => onLimit(Number(value))}>
          <SelectTrigger className="h-7 w-16" aria-label="Leads por página">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page <= 1 || loading}
          onClick={() => onPage(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft aria-hidden />
        </Button>
        <span className="numeric text-xs text-muted-foreground">
          {formatInteger(page)} / {formatInteger(totalPages)}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= totalPages || loading}
          onClick={() => onPage(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}
