'use client';

import { Image as ImageIcon, Mic, Square, Video } from 'lucide-react';
import type { LeadStatus } from '@prisma/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shell/app-shell';
import { ConversationBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/data-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { PropertyRow } from '@/components/ui/property-row';
import {
  INBOX_FILTER_LABELS,
  INBOX_FILTERS,
  messageDeliveryLabel,
  type InboxFilter,
} from '@/constants/conversation';
import { LEAD_STATUS_ORDER, leadStatusLabel } from '@/constants/lead-status';
import { isTypingTarget } from '@/constants/shortcuts';
import { MEDIA_ACCEPT_IMAGE, MEDIA_ACCEPT_VIDEO } from '@/constants/media';
import { ManualContactForm } from '@/features/contacts/manual-contact-form';
import {
  useInboxActions,
  useConversation,
  useConversationList,
  useConversationMessages,
} from '@/features/inbox/use-inbox';
import { MediaAttachButton, MediaChip } from '@/features/messages/media-chip';
import { useUploadMedia } from '@/features/messages/use-templates';
import { useSessionUser } from '@/features/auth/session-context';
import { isSellerRole } from '@/lib/auth/access';
import { formatCnpj } from '@/lib/format';
import { formatPhone } from '@/lib/validation/phone';
import { apiGet, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { SerializedMedia } from '@/server/services/media.service';

export function InboxScreen({ conversationId }: { conversationId?: string }) {
  const router = useRouter();
  const session = useSessionUser();
  const isSeller = isSellerRole(session?.role);
  const inboxFilters = isSeller
    ? INBOX_FILTERS.filter((item) => item !== 'unassigned')
    : INBOX_FILTERS;
  const [filter, setFilter] = React.useState<InboxFilter>('all');
  const [search, setSearch] = React.useState('');
  const [draft, setDraft] = React.useState('');
  const [pendingMedia, setPendingMedia] = React.useState<SerializedMedia | null>(null);
  const [recording, setRecording] = React.useState(false);
  const [transferUserId, setTransferUserId] = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [users, setUsers] = React.useState<{ id: string; name: string }[]>([]);
  const replyRef = React.useRef<HTMLTextAreaElement>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const upload = useUploadMedia();

  const list = useConversationList(filter, search);
  const detail = useConversation(conversationId ?? null);
  const messages = useConversationMessages(conversationId ?? null);
  const actions = useInboxActions(conversationId ?? null);

  React.useEffect(() => {
    setDraft('');
    setPendingMedia(null);
    setConfirmDelete(false);
    setRecording(false);
    recorderRef.current?.stop();
  }, [conversationId]);

  React.useEffect(() => {
    if (isSeller) return;
    void apiGet<{ id: string; name: string }[]>('/api/users/directory')
      .then((rows) => setUsers(rows))
      .catch(() => setUsers([]));
  }, [isSeller]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const rows = list.data?.rows ?? [];
      if (event.key === 'j' || event.key === 'k') {
        if (rows.length === 0) return;
        const index = rows.findIndex((row) => row.id === conversationId);
        const next =
          event.key === 'j'
            ? rows[Math.min(rows.length - 1, Math.max(0, index + 1))]
            : rows[Math.max(0, index <= 0 ? 0 : index - 1)];
        if (next) router.push(`/inbox/${next.id}`);
        return;
      }
      if (!conversationId) return;
      if (event.key === 'r') {
        replyRef.current?.focus();
        return;
      }
      if (event.key === 'a') {
        actions.take.mutate(undefined, {
          onSuccess: () => toast.success('Conversa assumida.'),
          onError: (error) => toast.error(errorMessage(error)),
        });
        return;
      }
      if (event.key === 'c') {
        actions.resolve.mutate(undefined, {
          onSuccess: () => toast.success('Conversa resolvida.'),
          onError: (error) => toast.error(errorMessage(error)),
        });
        return;
      }
      if (event.key === 't') {
        if (isSeller) return;
        document.getElementById('inbox-transfer-user')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions.take, actions.resolve, conversationId, isSeller, list.data?.rows, router]);

  const conversationName = detail.data
    ? (detail.data.lead?.razaoSocial ?? (isSeller ? 'Conversa' : formatPhone(detail.data.phone)))
    : '';

  const deleteConversation = () => {
    actions.remove.mutate(undefined, {
      onSuccess: () => {
        setConfirmDelete(false);
        router.push('/inbox');
        toast.success('Conversa excluída.');
      },
      onError: (error) => {
        setConfirmDelete(false);
        toast.error(errorMessage(error));
      },
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Inbox" count={list.data ? String(list.data.total) : undefined} />
      <div className="grid min-h-0 flex-1 grid-cols-1 border-t border-border lg:grid-cols-[20rem_minmax(0,1fr)_18rem]">
        <section className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-2 border-b border-border p-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={isSeller ? 'Buscar empresa' : 'Buscar empresa ou telefone'}
              aria-label="Buscar conversas"
            />
            <div className="flex flex-wrap gap-1">
              {inboxFilters.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={cn(
                    'h-7 rounded-md border px-2 text-2xs transition-colors duration-fast',
                    filter === item
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {INBOX_FILTER_LABELS[item]}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.isLoading ? (
              <TableSkeleton rows={12} widths={['70%', '20%']} />
            ) : list.isError ? (
              <ErrorState cause={errorMessage(list.error)} onRetry={() => void list.refetch()} />
            ) : !list.data?.rows.length ? (
              <EmptyState
                title="Nenhuma conversa"
                description={
                  isSeller
                    ? 'Conversas atribuídas a você aparecem aqui. Responda e mova o funil à direita.'
                    : filter === 'mine'
                      ? 'Nenhuma conversa atribuída a você. Abra Todas ou Sem responsável para a fila sem dono.'
                      : filter === 'unassigned'
                        ? 'Não há conversa sem responsável neste momento.'
                        : 'Mensagens novas depois do QR entram aqui.'
                }
                action={
                  filter !== 'all' ? (
                    <Button size="sm" variant="outline" onClick={() => setFilter('all')}>
                      Ver todas
                    </Button>
                  ) : null
                }
              />
            ) : (
              <ul>
                {list.data.rows.map((row) => {
                  const active = row.id === conversationId;
                  return (
                    <li key={row.id}>
                      <Link
                        href={`/inbox/${row.id}`}
                        className={cn(
                          'flex flex-col gap-0.5 border-b border-border px-3 py-2 transition-colors duration-fast',
                          active ? 'bg-muted' : 'hover:bg-muted/70',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {row.lead?.razaoSocial ?? (isSeller ? 'Conversa' : formatPhone(row.phone))}
                          </span>
                          {row.unreadCount > 0 ? (
                            <span className="numeric ml-auto text-2xs text-primary">{row.unreadCount}</span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <ConversationBadge status={row.status} />
                          <span className="truncate text-2xs text-muted-foreground">
                            {row.lastMessagePreview ?? '—'}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          {!conversationId ? (
            <EmptyState
              title="Selecione uma conversa"
              description={
                isSeller
                  ? 'Use j/k para navegar. r responde, c resolve.'
                  : 'Use j/k para navegar na lista. r responde, a assume, t transfere, c resolve.'
              }
            />
          ) : detail.isLoading ? (
            <TableSkeleton rows={8} widths={['100%']} />
          ) : detail.isError || !detail.data ? (
            <ErrorState
              cause={detail.error ? errorMessage(detail.error) : 'Conversa indisponível.'}
              onRetry={() => void detail.refetch()}
            />
          ) : (
            <>
              <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {detail.data.lead?.razaoSocial ??
                      (isSeller ? 'Conversa' : formatPhone(detail.data.phone))}
                  </p>
                  <p className="numeric text-2xs text-muted-foreground">
                    {isSeller
                      ? (detail.data.assignedUserNome ?? 'Você')
                      : `${formatPhone(detail.data.phone)} · ${detail.data.assignedUserNome ?? 'Sem responsável'}`}
                  </p>
                </div>
                <ConversationBadge status={detail.data.status} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    actions.take.mutate(undefined, {
                      onSuccess: () => toast.success('Conversa assumida.'),
                      onError: (error) => toast.error(errorMessage(error)),
                    })
                  }
                >
                  Assumir
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!detail.data.canWrite}
                  onClick={() =>
                    actions.resolve.mutate(undefined, {
                      onSuccess: () => toast.success('Resolvida.'),
                      onError: (error) => toast.error(errorMessage(error)),
                    })
                  }
                >
                  Resolver
                </Button>
                {detail.data.status === 'RESOLVED' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!detail.data.canWrite}
                    onClick={() =>
                      actions.reopen.mutate(undefined, {
                        onSuccess: () => toast.success('Reaberta.'),
                        onError: (error) => toast.error(errorMessage(error)),
                      })
                    }
                  >
                    Reabrir
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!detail.data.canWrite}
                  onClick={() => setConfirmDelete(true)}
                >
                  Excluir
                </Button>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                {messages.isLoading ? (
                  <TableSkeleton rows={6} widths={['60%', '40%']} />
                ) : (
                  (messages.data ?? []).map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        'max-w-[85%] rounded-md border px-2 py-1.5 text-sm',
                        message.direction === 'OUTBOUND'
                          ? 'ml-auto border-primary/20 bg-primary/5'
                          : 'border-border bg-muted',
                      )}
                    >
                      {message.media?.kind === 'IMAGE' ? (
                        <div className="mb-1 overflow-hidden rounded-sm border border-border [aspect-ratio:4/3] max-h-48">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/media/${message.media.id}`}
                            alt=""
                            className="size-full object-cover"
                          />
                        </div>
                      ) : null}
                      {message.media?.kind === 'VIDEO' ? (
                        <video
                          src={`/api/media/${message.media.id}`}
                          controls
                          className="mb-1 w-full rounded-sm border border-border [aspect-ratio:16/9] max-h-48"
                        />
                      ) : null}
                      {message.media?.kind === 'AUDIO' ? (
                        <audio
                          src={`/api/media/${message.media.id}`}
                          controls
                          className="mb-1 w-full"
                        />
                      ) : null}
                      {message.body.trim() ? (
                        <p className="whitespace-pre-wrap text-pretty">{message.body}</p>
                      ) : null}
                      <p className="numeric mt-1 text-2xs text-muted-foreground">
                        {new Date(message.createdAt).toLocaleString('pt-BR')}
                        {message.direction === 'OUTBOUND'
                          ? ` · ${messageDeliveryLabel(message.status)}`
                          : ''}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <div className="shrink-0 border-t border-border p-2">
                {isSeller ? null : (
                <div className="mb-2 flex items-center gap-2">
                  <select
                    id="inbox-transfer-user"
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    value={transferUserId}
                    onChange={(event) => setTransferUserId(event.target.value)}
                    aria-label="Transferir para"
                    disabled={!detail.data.canWrite}
                  >
                    <option value="">Transferir para…</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!detail.data.canWrite || !transferUserId}
                    onClick={() => {
                      // #region agent log
                      fetch('http://127.0.0.1:7573/ingest/168a1e45-0a27-4a12-9ec9-dabfa1ec792b', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'da6cd6' },
                        body: JSON.stringify({
                          sessionId: 'da6cd6',
                          runId: 'post-fix',
                          hypothesisId: 'E',
                          location: 'inbox-screen.tsx:transfer-click',
                          message: 'user clicked transfer',
                          data: {
                            conversationId: conversationId ?? null,
                            visibleMessageCount: messages.data?.length ?? 0,
                            hasLead: Boolean(detail.data?.leadId),
                          },
                          timestamp: Date.now(),
                        }),
                      }).catch(() => {});
                      // #endregion
                      actions.transfer.mutate(
                        { toUserId: transferUserId },
                        {
                          onSuccess: () => {
                            toast.success('Transferida.');
                            setTransferUserId('');
                          },
                          onError: (error) => toast.error(errorMessage(error)),
                        },
                      );
                    }}
                  >
                    Transferir
                  </Button>
                </div>
                )}
                <Textarea
                  ref={replyRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={3}
                  placeholder={
                    detail.data.canWrite ? 'Responder…' : 'Assuma a conversa para responder.'
                  }
                  aria-label="Mensagem"
                  disabled={!detail.data.canWrite}
                />
                {pendingMedia ? (
                  <div className="mt-2">
                    <MediaChip media={pendingMedia} onRemove={() => setPendingMedia(null)} />
                  </div>
                ) : null}
                <div className="mt-2 flex items-center gap-1">
                  <MediaAttachButton
                    accept={MEDIA_ACCEPT_IMAGE}
                    label="Anexar foto"
                    icon={<ImageIcon className="size-3.5" />}
                    disabled={!detail.data.canWrite || upload.isPending || recording}
                    onFile={(file) => {
                      upload.mutate(file, {
                        onSuccess: setPendingMedia,
                        onError: (error) => toast.error(errorMessage(error)),
                      });
                    }}
                  />
                  <MediaAttachButton
                    accept={MEDIA_ACCEPT_VIDEO}
                    label="Anexar vídeo"
                    icon={<Video className="size-3.5" />}
                    disabled={!detail.data.canWrite || upload.isPending || recording}
                    onFile={(file) => {
                      upload.mutate(file, {
                        onSuccess: setPendingMedia,
                        onError: (error) => toast.error(errorMessage(error)),
                      });
                    }}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={recording ? 'destructive' : 'ghost'}
                    aria-label={recording ? 'Parar gravação' : 'Gravar áudio'}
                    title={recording ? 'Parar gravação' : 'Gravar áudio'}
                    disabled={!detail.data.canWrite || upload.isPending}
                    onClick={() => {
                      void (async () => {
                        if (recording) {
                          recorderRef.current?.stop();
                          return;
                        }
                        try {
                          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                          const recorder = new MediaRecorder(stream);
                          chunksRef.current = [];
                          recorder.ondataavailable = (event) => {
                            if (event.data.size > 0) chunksRef.current.push(event.data);
                          };
                          recorder.onstop = () => {
                            stream.getTracks().forEach((track) => track.stop());
                            setRecording(false);
                            const blob = new Blob(chunksRef.current, {
                              type: recorder.mimeType || 'audio/webm',
                            });
                            const file = new File([blob], 'audio.webm', {
                              type: blob.type || 'audio/webm',
                            });
                            upload.mutate(file, {
                              onSuccess: setPendingMedia,
                              onError: (error) => toast.error(errorMessage(error)),
                            });
                          };
                          recorderRef.current = recorder;
                          recorder.start();
                          setRecording(true);
                        } catch {
                          toast.error('Não foi possível acessar o microfone.');
                        }
                      })();
                    }}
                  >
                    {recording ? <Square className="size-3.5" /> : <Mic className="size-3.5" />}
                  </Button>
                  <div className="ml-auto">
                    <Button
                      size="sm"
                      variant="primary"
                      loading={actions.send.isPending || upload.isPending}
                      disabled={!detail.data.canWrite || (!draft.trim() && !pendingMedia)}
                      onClick={() =>
                        actions.send.mutate(
                          { body: draft.trim(), mediaId: pendingMedia?.id },
                          {
                            onSuccess: () => {
                              setDraft('');
                              setPendingMedia(null);
                              toast.success('Mensagem enviada.');
                            },
                            onError: (error) => toast.error(errorMessage(error)),
                          },
                        )
                      }
                    >
                      Enviar
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="min-h-0 overflow-y-auto p-3">
          {detail.data ? (
            <div className="flex flex-col gap-1">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {detail.data.lead ? 'Lead' : 'Número sem lead'}
              </p>
              {detail.data.lead ? (
                <>
                  <PropertyRow label="Empresa">{detail.data.lead.razaoSocial}</PropertyRow>
                  <PropertyRow label="WhatsApp" numeric>
                    {formatPhone(detail.data.lead.whatsapp)}
                  </PropertyRow>
                  <PropertyRow label="CNPJ" numeric>
                    {formatCnpj(detail.data.lead.cnpj)}
                  </PropertyRow>
                  <PropertyRow label="Cidade">
                    {[detail.data.lead.cidade, detail.data.lead.estado].filter(Boolean).join('/') || '—'}
                  </PropertyRow>
                  <div className="flex flex-col gap-1 border-b border-border py-2">
                    <Label htmlFor="inbox-lead-status">Funil</Label>
                    <Select
                      value={detail.data.lead.status}
                      disabled={
                        !detail.data.canChangeLeadStatus || actions.changeLeadStatus.isPending
                      }
                      onValueChange={(value) =>
                        actions.changeLeadStatus.mutate(
                          { status: value },
                          {
                            onSuccess: () =>
                              toast.success(`Funil: ${leadStatusLabel(value as LeadStatus)}.`),
                            onError: (error) => toast.error(errorMessage(error)),
                          },
                        )
                      }
                    >
                      <SelectTrigger id="inbox-lead-status" className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_STATUS_ORDER.map((status) => (
                          <SelectItem key={status} value={status}>
                            {leadStatusLabel(status)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!detail.data.canChangeLeadStatus ? (
                      <p className="text-2xs text-muted-foreground text-pretty">
                        Assuma a conversa para alterar o funil.
                      </p>
                    ) : null}
                  </div>
                  <PropertyRow label="Responsável">
                    {detail.data.lead.responsavelNome ?? '—'}
                  </PropertyRow>
                  <PropertyRow label="Próxima ação" numeric>
                    {detail.data.lead.nextContactAt
                      ? new Date(detail.data.lead.nextContactAt).toLocaleString('pt-BR')
                      : '—'}
                  </PropertyRow>
                </>
              ) : isSeller ? (
                <p className="text-xs text-muted-foreground text-pretty">
                  Número ainda não está na base. Peça ao gestor para salvar o contato.
                </p>
              ) : (
                <>
                  <PropertyRow label="Telefone" numeric>
                    {formatPhone(detail.data.phone)}
                  </PropertyRow>
                  <p className="mt-3 text-xs text-muted-foreground text-pretty">
                    Número ainda não está na base. Preencha o nome para criar o contato.
                  </p>
                  {detail.data.canWrite ? (
                    <div className="mt-2">
                      <ManualContactForm
                        key={detail.data.id}
                        idPrefix="inbox-contact"
                        defaultWhatsapp={detail.data.phone ?? undefined}
                        submitLabel="Salvar contato"
                        pending={actions.attachContact.isPending}
                        layout="stack"
                        onSubmit={(values) =>
                          actions.attachContact.mutate(values, {
                            onSuccess: () => toast.success('Contato salvo.'),
                            onError: (error) => toast.error(errorMessage(error)),
                          })
                        }
                      />
                    </div>
                  ) : (
                    <p className="mt-2 text-2xs text-muted-foreground text-pretty">
                      Assuma a conversa para salvar o contato.
                    </p>
                  )}
                </>
              )}
              <PropertyRow label="Campanha">{detail.data.campaignName ?? '—'}</PropertyRow>
              {detail.data.leadId ? (
                <div className="mt-3 flex flex-col gap-2">
                  {isSeller ? null : (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/leads/${detail.data.leadId}`}>Abrir lead</Link>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/kanban?lead=${detail.data.leadId}`}>Kanban</Link>
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Contexto do lead aparece ao selecionar.</p>
          )}
        </aside>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir conversa</DialogTitle>
            <DialogDescription>
              Excluir a conversa {conversationName}? As mensagens saem desta Inbox. O lead e o
              WhatsApp do contato não são apagados. Esta ação não tem volta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={actions.remove.isPending}
              onClick={deleteConversation}
            >
              Excluir {conversationName}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
