'use client';

import type { Role } from '@prisma/client';
import * as React from 'react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ForbiddenState } from '@/components/ui/data-state';
import { Input } from '@/components/ui/input';
import { RecordAvatar } from '@/components/ui/record-avatar';
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/primitives';
import { ROLE_META } from '@/constants/interactions';
import { Section } from '@/features/leads/lead-fields';
import { ApiError, apiGet, apiPatch, apiPost, errorMessage } from '@/lib/api-client';

interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export function UsersPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['users'],
    queryFn: ({ signal }) => apiGet<AppUser[]>('/api/users', signal),
    staleTime: 30_000,
  });
  const [draft, setDraft] = React.useState({
    name: '',
    email: '',
    password: '',
    role: 'USER' as Role,
  });

  const create = useMutation({
    mutationFn: () => apiPost<AppUser>('/api/users', draft),
    onSuccess: () => {
      toast.success('Usuário criado.');
      setDraft({ name: '', email: '', password: '', role: 'USER' });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const patch = useMutation({
    mutationFn: ({ id, ...input }: { id: string; role?: Role; active?: boolean }) =>
      apiPatch<AppUser>(`/api/users/${id}`, input),
    onSuccess: () => {
      toast.success('Usuário atualizado.');
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Section title="Usuários">
      {query.isPending ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-8 rounded-sm bg-muted" />
          ))}
        </div>
      ) : query.isError ? (
        query.error instanceof ApiError && query.error.kind === 'forbidden' ? (
          <ForbiddenState reason={query.error.message} />
        ) : (
          <ErrorState
            cause={query.error instanceof Error ? query.error.message : 'Erro.'}
            onRetry={() => void query.refetch()}
          />
        )
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState title="Nenhum usuário" description="Crie o primeiro vendedor no formulário abaixo." />
      ) : (
        <ul className="flex flex-col gap-1">
          {(query.data ?? []).map((row) => (
            <li key={row.id} className="flex h-8 items-center gap-2 border-b border-border">
              <RecordAvatar name={row.name} seed={row.email} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
              <span className="text-2xs text-muted-foreground">{row.email}</span>
              <Badge variant={row.active ? 'outline' : 'neutral'}>
                {row.active ? ROLE_META[row.role].label : 'Inativo'}
              </Badge>
              <Select
                value={row.role}
                onValueChange={(role) => patch.mutate({ id: row.id, role: role as Role })}
              >
                <SelectTrigger className="h-7 w-36" aria-label={`Perfil de ${row.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Administrador</SelectItem>
                  <SelectItem value="MANAGER">Gestor</SelectItem>
                  <SelectItem value="USER">Vendedor</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => patch.mutate({ id: row.id, active: !row.active })}
              >
                {row.active ? 'Desativar' : 'Ativar'}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="u-name">Nome</Label>
          <Input
            id="u-name"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="u-email">E-mail</Label>
          <Input
            id="u-email"
            type="email"
            value={draft.email}
            onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="u-pass">Senha inicial</Label>
          <Input
            id="u-pass"
            type="password"
            minLength={10}
            value={draft.password}
            onChange={(event) =>
              setDraft((current) => ({ ...current, password: event.target.value }))
            }
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Perfil</Label>
          <Select
            value={draft.role}
            onValueChange={(role) => setDraft((current) => ({ ...current, role: role as Role }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USER">Vendedor</SelectItem>
              <SelectItem value="MANAGER">Gestor</SelectItem>
              <SelectItem value="ADMIN">Administrador</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Button type="submit" variant="primary" size="sm" loading={create.isPending}>
            Criar usuário
          </Button>
        </div>
      </form>
    </Section>
  );
}
