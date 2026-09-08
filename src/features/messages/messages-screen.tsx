'use client';

import { Image as ImageIcon } from 'lucide-react';
import type { InteractionType, Role } from '@prisma/client';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ForbiddenState } from '@/components/ui/data-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/primitives';
import { INTERACTION_TYPE_META, INTERACTION_TYPE_ORDER } from '@/constants/interactions';
import { MEDIA_ACCEPT_TEMPLATE, mediaKindLabel } from '@/constants/media';
import { useSessionUser } from '@/features/auth/session-context';
import { Section } from '@/features/leads/lead-fields';
import { MediaAttachButton, MediaChip } from '@/features/messages/media-chip';
import {
  useDeleteTemplate,
  useSaveTemplate,
  useTemplates,
  useUploadMedia,
} from '@/features/messages/use-templates';
import { ApiError, errorMessage } from '@/lib/api-client';
import { extractTemplateVariables, renderTemplate, TEMPLATE_VARIABLES } from '@/lib/template';
import { cn } from '@/lib/utils';
import type { SerializedMedia } from '@/server/services/media.service';
import type { SerializedTemplate } from '@/server/services/template.service';

const EMPTY = {
  name: '',
  channel: 'WHATSAPP' as InteractionType,
  subject: '',
  body: '',
};

export function MessagesScreen({ role }: { role: Role }) {
  const canWrite = role === 'ADMIN' || role === 'MANAGER';
  const session = useSessionUser();
  const query = useTemplates(false);
  const save = useSaveTemplate();
  const remove = useDeleteTemplate();
  const upload = useUploadMedia();
  const [editing, setEditing] = React.useState<SerializedTemplate | null>(null);
  const [draft, setDraft] = React.useState(EMPTY);
  const [draftMedia, setDraftMedia] = React.useState<SerializedMedia | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const startNew = () => {
    setEditing(null);
    setDraft(EMPTY);
    setDraftMedia(null);
    setConfirmDelete(false);
  };

  const startEdit = (row: SerializedTemplate) => {
    setEditing(row);
    setDraft({
      name: row.name,
      channel: row.channel,
      subject: row.subject ?? '',
      body: row.body,
    });
    setDraftMedia(row.media);
    setConfirmDelete(false);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    save.mutate(
      {
        id: editing?.id,
        name: draft.name,
        channel: draft.channel,
        subject: draft.subject || null,
        body: draft.body,
        mediaId: draftMedia?.id ?? null,
      },
      {
        onSuccess: () => {
          toast.success(editing ? 'Template atualizado.' : 'Template criado.');
          startNew();
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const variables = extractTemplateVariables(draft.body);
  const preview = renderTemplate(draft.body, {
    razaoSocial: 'Empresa Exemplo Ltda',
    nomeFantasia: 'Exemplo',
    cidade: 'São Paulo',
    estado: 'SP',
    cnpj: '00.000.000/0001-00',
    telefone: '(11) 3000-0000',
    whatsapp: '(11) 90000-0000',
    email: 'contato@exemplo.com',
    vendedor: session?.name ?? '',
  });

  return (
    <>
      <PageHeader title="Mensagens" count={query.data ? `${query.data.length} templates` : undefined}>
        {canWrite ? (
          <Button variant="outline" size="sm" onClick={startNew}>
            Novo template
          </Button>
        ) : null}
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-h-0">
          {query.isPending ? (
            <div className="flex flex-col gap-2" aria-hidden>
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-9 border-b border-border bg-muted/40" />
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
            <EmptyState
              title="Nenhum template"
              description="O seed cria três rascunhos. Crie o primeiro texto que o time vai usar de verdade."
            />
          ) : (
            <ul className="border-y border-border">
              {(query.data ?? []).map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => startEdit(row)}
                    className={cn(
                      'flex h-9 w-full items-center gap-3 border-b border-border px-2 text-left last:border-b-0',
                      'hover:bg-subtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      editing?.id === row.id && 'bg-muted',
                    )}
                  >
                    <span className="min-w-0 w-44 shrink-0 truncate text-sm font-medium text-foreground">
                      {row.name}
                    </span>
                    <Badge variant="outline">{INTERACTION_TYPE_META[row.channel].label}</Badge>
                    {row.active ? null : <Badge variant="neutral">Inativo</Badge>}
                    <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
                      {row.body}
                    </span>
                    {row.media ? (
                      <Badge variant="outline">{mediaKindLabel(row.media.kind)}</Badge>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canWrite ? (
          <form onSubmit={submit} className="flex min-h-0 flex-col">
            <Section title={editing ? 'Editar template' : 'Novo template'}>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tpl-name">Nome</Label>
                  <Input
                    id="tpl-name"
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tpl-channel">Canal</Label>
                  <Select
                    value={draft.channel}
                    onValueChange={(value) =>
                      setDraft((current) => ({ ...current, channel: value as InteractionType }))
                    }
                  >
                    <SelectTrigger id="tpl-channel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERACTION_TYPE_ORDER.map((type) => (
                        <SelectItem key={type} value={type}>
                          {INTERACTION_TYPE_META[type].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tpl-subject">Assunto (e-mail)</Label>
                  <Input
                    id="tpl-subject"
                    value={draft.subject}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, subject: event.target.value }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tpl-body">Corpo</Label>
                  <Textarea
                    id="tpl-body"
                    rows={8}
                    value={draft.body}
                    onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                  />
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                        Foto ou vídeo
                      </p>
                      <MediaAttachButton
                        accept={MEDIA_ACCEPT_TEMPLATE}
                        label="Anexar foto ou vídeo"
                        icon={<ImageIcon className="size-3.5" />}
                        disabled={upload.isPending}
                        onFile={(file) => {
                          upload.mutate(file, {
                            onSuccess: (media) => {
                              if (media.kind === 'AUDIO') {
                                toast.error('Template aceita foto ou vídeo. Áudio só na Inbox.');
                                return;
                              }
                              setDraftMedia(media);
                            },
                            onError: (error) => toast.error(errorMessage(error)),
                          });
                        }}
                      />
                    </div>
                    {draftMedia ? (
                      <MediaChip media={draftMedia} onRemove={() => setDraftMedia(null)} />
                    ) : (
                      <p className="text-2xs text-muted-foreground text-pretty">
                        Opcional. Um arquivo por template: a campanha e o Enviar do lead mandam essa
                        mídia com o texto como legenda.
                      </p>
                    )}
                  </div>
                  <p className="text-2xs text-muted-foreground">Variáveis</p>
                  <div className="flex flex-wrap gap-1">
                    {TEMPLATE_VARIABLES.map((name) => (
                      <Badge key={name} variant="outline">
                        {`{{${name}}}`}
                      </Badge>
                    ))}
                  </div>
                  {variables.length > 0 ? (
                    <p className="text-2xs text-muted-foreground">Neste texto: {variables.join(', ')}</p>
                  ) : null}
                </div>
                {draft.body.trim() ? (
                  <div className="flex flex-col gap-1">
                    <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                      Preview
                    </p>
                    <p className="text-pretty whitespace-pre-wrap text-sm text-foreground">{preview}</p>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Button type="submit" variant="primary" loading={save.isPending}>
                    Salvar
                  </Button>
                  {editing ? (
                    <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>
                      Excluir
                    </Button>
                  ) : null}
                </div>
              </div>
            </Section>
          </form>
        ) : (
          <p className="text-pretty text-xs text-muted-foreground">
            Você pode usar os templates no envio de WhatsApp. Só gestor e administrador editam o texto.
          </p>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir template</DialogTitle>
            <DialogDescription>
              Excluir o template {editing?.name}? Esta ação não tem volta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={remove.isPending}
              onClick={() => {
                if (!editing) return;
                remove.mutate(editing.id, {
                  onSuccess: () => {
                    toast.success(`Template ${editing.name} excluído.`);
                    startNew();
                  },
                  onError: (error) => toast.error(errorMessage(error)),
                });
              }}
            >
              Excluir {editing?.name}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
