'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/data-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  isWhatsAppQrProvider,
  WHATSAPP_WORKER_SETUP,
  whatsappProviderLabel,
  whatsappSessionStatusLabel,
} from '@/constants/whatsapp';
import { invalidateClientTags } from '@/features/events/invalidate-client';
import { apiGet, apiPost, errorMessage } from '@/lib/api-client';
import { formatPhone } from '@/lib/validation/phone';

type Account = {
  id: string;
  name: string;
  phone: string | null;
  provider: 'LEGACY_MANUAL' | 'CHATWOOT' | 'MOCK' | 'EVOLUTION' | 'BAILEYS';
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR';
  sessionStatus: 'DISCONNECTED' | 'CONNECTING' | 'QR_CODE' | 'CONNECTED' | 'FAILED';
  lastHeartbeatAt: string | null;
  lastConnectedAt: string | null;
  providerInstanceName: string | null;
  qrCode: string | null;
  workerReady: boolean;
  activeCampaigns: number;
  queued: number;
};

type ImportResult = {
  created: number;
  matched: number;
  skipped: number;
  total: number;
};

export function WhatsAppScreen({
  canAdd,
  canImportContacts,
}: {
  canAdd: boolean;
  canImportContacts: boolean;
}) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const list = useQuery({
    queryKey: ['whatsapp', 'accounts'],
    queryFn: ({ signal }) => apiGet<Account[]>('/api/whatsapp/accounts', signal),
    refetchInterval: (query) => {
      const rows = query.state.data;
      if (!rows?.length) return false;
      const waiting = rows.some(
        (row) =>
          isWhatsAppQrProvider(row.provider) &&
          (row.sessionStatus === 'QR_CODE' || row.sessionStatus === 'CONNECTING'),
      );
      return waiting ? 2500 : 8_000;
    },
  });
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');

  const create = useMutation({
    mutationFn: () =>
      apiPost('/api/whatsapp/accounts', {
        name,
        provider: 'BAILEYS',
        phone: phone || undefined,
      }),
    onSuccess: () => {
      invalidateClientTags(queryClient, ['whatsapp']);
      setName('');
      setPhone('');
      toast.success('Conta adicionada.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const connect = useMutation({
    mutationFn: (id: string) => apiPost<Account>(`/api/whatsapp/accounts/${id}/connect`),
    onSuccess: (data) => {
      invalidateClientTags(queryClient, ['whatsapp']);
      setExpandedId(data.id);
      if (data.qrCode) toast.message('Escaneie o QR Code no celular.');
      else if (data.sessionStatus === 'CONNECTED') toast.success('WhatsApp conectado.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const refreshQr = useMutation({
    mutationFn: (id: string) => apiPost<Account>(`/api/whatsapp/accounts/${id}/qr`),
    onSuccess: (data) => {
      invalidateClientTags(queryClient, ['whatsapp']);
      setExpandedId(data.id);
      toast.message('QR atualizado.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => apiPost(`/api/whatsapp/accounts/${id}/disconnect`),
    onSuccess: () => {
      invalidateClientTags(queryClient, ['whatsapp']);
      toast.success('Conta desconectada.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const [importResults, setImportResults] = React.useState<Record<string, ImportResult>>({});
  const [importError, setImportError] = React.useState<{ id: string; cause: string } | null>(null);

  const importContacts = useMutation({
    mutationFn: (id: string) =>
      apiPost<ImportResult>(`/api/whatsapp/accounts/${id}/import-contacts`),
    onSuccess: (data, id) => {
      invalidateClientTags(queryClient, ['leads', 'whatsapp']);
      setImportResults((current) => ({ ...current, [id]: data }));
      setImportError((current) => (current?.id === id ? null : current));
      toast.success(
        `${data.created} novos, ${data.matched} já na base, ${data.skipped} ignorados. Nenhuma mensagem foi enviada.`,
      );
    },
    onError: (error, id) => {
      setImportError({ id, cause: errorMessage(error) });
      toast.error(errorMessage(error));
    },
  });

  const [restartingAfterQr, setRestartingAfterQr] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    const rows = list.data ?? [];
    setRestartingAfterQr((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (row.sessionStatus === 'QR_CODE' || row.qrCode) next[row.id] = true;
        if (
          row.sessionStatus === 'CONNECTED' ||
          row.sessionStatus === 'DISCONNECTED' ||
          row.sessionStatus === 'FAILED'
        ) {
          delete next[row.id];
        }
      }
      return next;
    });
  }, [list.data]);

  const workerReady = list.data?.[0]?.workerReady ?? true;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="WhatsApp" count={list.data ? String(list.data.length) : undefined} />
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!workerReady ? (
          <p className="mb-3 text-sm text-muted-foreground text-pretty">
            {WHATSAPP_WORKER_SETUP}
          </p>
        ) : null}

        {canAdd ? (
          <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4">
            <p className="text-sm text-muted-foreground text-pretty">
              Só WhatsApp Web. Adicione uma conta, clique Conectar e escaneie o QR. Enviar no lead
              e campanha usam esta sessão. Com a sessão Conectada, Importar contatos grava todos os
              números vinculados a esta conta (agenda + conversas 1:1) como leads — não envia
              mensagem. Deixe o container crm-worker ligado.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="w-48" />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Telefone (opcional)</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-40" numeric />
              </div>
              <Button
                size="sm"
                variant="primary"
                disabled={name.trim().length < 2}
                loading={create.isPending}
                onClick={() => create.mutate()}
              >
                Adicionar conta
              </Button>
            </div>
          </div>
        ) : null}

        {canImportContacts && !canAdd ? (
          <p className="mb-4 text-sm text-muted-foreground text-pretty">
            Com a sessão Conectada, Importar contatos grava todos os números vinculados a esta conta
            (agenda + conversas 1:1) como leads — não envia mensagem. Contatos da planilha com o
            mesmo telefone não duplicam.
          </p>
        ) : null}

        {list.isLoading ? (
          <TableSkeleton rows={6} widths={['18%', '16%', '14%', '14%', '10%', '10%', '18%']} />
        ) : list.isError ? (
          <ErrorState cause={errorMessage(list.error)} onRetry={() => void list.refetch()} />
        ) : !list.data?.length ? (
          <EmptyState
            title="Nenhuma conta WhatsApp"
            description={
              canAdd
                ? 'Adicione WhatsApp Web, clique Conectar e escaneie o QR no celular.'
                : 'Peça ao administrador para cadastrar uma conta.'
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <Table>
              <THead>
                <TR>
                  <TH>Nome</TH>
                  <TH>Provedor</TH>
                  <TH>Telefone</TH>
                  <TH>Sessão</TH>
                  <TH>Campanhas</TH>
                  <TH>Fila</TH>
                  <TH>Heartbeat</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {list.data.map((row) => (
                  <TR key={row.id}>
                    <TD>{row.name}</TD>
                    <TD>{whatsappProviderLabel(row.provider)}</TD>
                    <TD className="numeric">{row.phone ? formatPhone(row.phone) : '—'}</TD>
                    <TD>
                      <Badge variant="outline">{whatsappSessionStatusLabel(row.sessionStatus)}</Badge>
                    </TD>
                    <TD className="numeric">{row.activeCampaigns}</TD>
                    <TD className="numeric">{row.queued}</TD>
                    <TD className="numeric">
                      {row.lastHeartbeatAt
                        ? new Date(row.lastHeartbeatAt).toLocaleString('pt-BR')
                        : '—'}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          loading={connect.isPending && connect.variables === row.id}
                          onClick={() => connect.mutate(row.id)}
                        >
                          Conectar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={refreshQr.isPending && refreshQr.variables === row.id}
                          onClick={() => refreshQr.mutate(row.id)}
                        >
                          Novo QR
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={disconnect.isPending && disconnect.variables === row.id}
                          onClick={() => disconnect.mutate(row.id)}
                        >
                          Desconectar
                        </Button>
                        {canImportContacts ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={row.sessionStatus !== 'CONNECTED'}
                            loading={importContacts.isPending && importContacts.variables === row.id}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Importar todos os contatos do WhatsApp de ${row.name} (agenda + conversas 1:1)? Nenhuma mensagem será enviada. Quem já está na planilha não duplica.`,
                                )
                              ) {
                                return;
                              }
                              importContacts.mutate(row.id);
                            }}
                          >
                            Importar contatos
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setExpandedId((current) => (current === row.id ? null : row.id))
                          }
                        >
                          {expandedId === row.id || row.qrCode ? 'Ocultar' : 'Detalhes'}
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>

            {canImportContacts
              ? list.data.map((row) => {
                  const result = importResults[row.id];
                  const failed = importError?.id === row.id;
                  if (!result && !failed) return null;
                  if (failed && importError) {
                    return (
                      <ErrorState
                        key={`import-err-${row.id}`}
                        title="Não foi possível importar os contatos"
                        cause={importError.cause}
                        onRetry={() => importContacts.mutate(row.id)}
                      />
                    );
                  }
                  if (!result) return null;
                  return (
                    <p key={`import-ok-${row.id}`} className="text-sm text-muted-foreground text-pretty">
                      Última importação de {row.name}:{' '}
                      <span className="numeric">{result.created}</span> novos,{' '}
                      <span className="numeric">{result.matched}</span> já na base,{' '}
                      <span className="numeric">{result.skipped}</span> ignorados. Nenhuma
                      mensagem enviada.
                    </p>
                  );
                })
              : null}

            {list.data
              .filter(
                (row) =>
                  isWhatsAppQrProvider(row.provider) &&
                  (expandedId === row.id ||
                    row.sessionStatus === 'QR_CODE' ||
                    row.sessionStatus === 'CONNECTING' ||
                    Boolean(row.qrCode)),
              )
              .map((row) => (
                <div
                  key={`qr-${row.id}`}
                  className="rounded-md border border-border p-3 text-sm"
                >
                  <p className="text-balance font-medium">{row.name}</p>
                  <p className="text-muted-foreground text-pretty">
                    {whatsappSessionStatusLabel(row.sessionStatus)}
                  </p>
                  {row.sessionStatus === 'CONNECTING' && !row.qrCode ? (
                    <p className="mt-2 text-muted-foreground text-pretty">
                      {restartingAfterQr[row.id]
                        ? 'Pareamento ok. Reiniciando sessão…'
                        : 'Solicitando QR Code…'}
                    </p>
                  ) : null}
                  {row.sessionStatus === 'FAILED' ? (
                    <p className="mt-2 text-muted-foreground text-pretty">
                      {WHATSAPP_WORKER_SETUP} Depois clique Conectar de novo.
                    </p>
                  ) : null}
                  {row.qrCode ? (
                    <div className="mt-2 flex flex-col items-start gap-2">
                      <p className="text-pretty">
                        Escaneie no WhatsApp → Aparelhos conectados → Conectar um aparelho.
                      </p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={row.qrCode}
                        alt={`QR Code para conectar ${row.name}`}
                        className="size-48 rounded-md border border-border bg-background p-2"
                      />
                    </div>
                  ) : row.sessionStatus === 'CONNECTED' ? (
                    <p className="mt-2 text-pretty">
                      Conectado
                      {row.lastConnectedAt
                        ? ` em ${new Date(row.lastConnectedAt).toLocaleString('pt-BR')}`
                        : ''}
                      .
                    </p>
                  ) : null}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
