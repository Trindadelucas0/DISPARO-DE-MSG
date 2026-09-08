'use client';

import type { CampaignRoutingMode, LeadStatus, WhatsAppProvider, WhatsAppSessionStatus } from '@prisma/client';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shell/app-shell';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, FieldsSkeleton, TableSkeleton } from '@/components/ui/data-state';
import { Input } from '@/components/ui/input';
import { Checkbox, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { PropertyRow } from '@/components/ui/property-row';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT,
  CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MAX,
  CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MIN,
  CAMPAIGN_ROUTING_META,
  CAMPAIGN_SENDS_PER_MINUTE,
  campaignStatusLabel,
  estimateCampaignMinutes,
} from '@/constants/campaign';
import {
  isConnectedSendableAccount,
  WHATSAPP_WORKER_SETUP,
  whatsappProviderLabel,
  whatsappSessionStatusLabel,
} from '@/constants/whatsapp';
import { ManualContactForm } from '@/features/contacts/manual-contact-form';
import { MediaChip } from '@/features/messages/media-chip';
import { useTemplates } from '@/features/messages/use-templates';
import { FilterBar } from '@/features/leads/filter-bar';
import { defaultLeadFilters } from '@/features/leads/filter-model';
import { useCreateManualLead } from '@/features/leads/use-leads';
import {
  countActiveFilters,
  MANUAL_LEAD_SOURCE,
  mergeLeadIds,
  parseLeadIds,
  type LeadFilters,
} from '@/features/leads/schema';
import {
  useCampaign,
  useCampaignAudience,
  useCampaignMetrics,
  useCampaignMutations,
  useCampaignWhatsAppAccounts,
} from '@/features/campaigns/use-campaigns';
import { useLeadFacets } from '@/features/leads/use-leads';
import { errorMessage } from '@/lib/api-client';
import { dash, formatCnpj, formatDateTime, formatPhone } from '@/lib/format';

function parseRecipientLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

function willReceiveCount(withWhatsapp: number, optOut: number, excludeOptOut: boolean, limit: number | null) {
  const eligible = Math.max(0, withWhatsapp - (excludeOptOut ? optOut : 0));
  if (limit == null) return eligible;
  return Math.min(eligible, limit);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-medium text-balance">{title}</h2>
      {children}
    </section>
  );
}

function RedisHint() {
  return (
    <p className="text-xs text-muted-foreground text-pretty">
      {WHATSAPP_WORKER_SETUP} Sem isso a API recusa o início da campanha.
    </p>
  );
}

export function CampaignDetailScreen({ id }: { id: string }) {
  const campaign = useCampaign(id);
  const metrics = useCampaignMetrics(id);
  const mutations = useCampaignMutations(id);
  const facets = useLeadFacets();
  const templates = useTemplates(true);
  const accountsQuery = useCampaignWhatsAppAccounts();

  const [filters, setFilters] = React.useState<LeadFilters>(defaultLeadFilters());
  const [excludeOptOut, setExcludeOptOut] = React.useState(true);
  const [recipientLimitInput, setRecipientLimitInput] = React.useState('');
  const [templateId, setTemplateId] = React.useState('');
  const [followUpTemplateId, setFollowUpTemplateId] = React.useState('');
  const [followUpDelayInput, setFollowUpDelayInput] = React.useState(
    String(CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT),
  );
  const [routingMode, setRoutingMode] = React.useState<CampaignRoutingMode>('MANUAL');
  const [whatsappAccountId, setWhatsappAccountId] = React.useState('');
  const [draftPicked, setDraftPicked] = React.useState<ReadonlySet<string>>(new Set());
  const [contactFormKey, setContactFormKey] = React.useState(0);
  const [addMoreInput, setAddMoreInput] = React.useState('100');
  const createManual = useCreateManualLead();
  const audience = useCampaignAudience(filters, excludeOptOut, campaign.data?.status === 'DRAFT');

  React.useEffect(() => {
    if (!campaign.data) return;
    setFilters({ ...defaultLeadFilters(), ...campaign.data.audienceFilter });
    setExcludeOptOut(campaign.data.excludeOptOut);
    setRecipientLimitInput(
      campaign.data.recipientLimit != null ? String(campaign.data.recipientLimit) : '',
    );
    setTemplateId(campaign.data.templateId ?? '');
    setFollowUpTemplateId(campaign.data.followUpTemplateId ?? '');
    setFollowUpDelayInput(String(campaign.data.followUpDelayHours ?? CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT));
    setRoutingMode(campaign.data.routingMode);
    setWhatsappAccountId(campaign.data.whatsappAccountId ?? '');
  }, [campaign.data]);

  React.useEffect(() => {
    if (!accountsQuery.data) return;
    if (!whatsappAccountId) return;
    const stillSendable = accountsQuery.data.some(
      (account) => account.id === whatsappAccountId && isConnectedSendableAccount(account),
    );
    if (!stillSendable) setWhatsappAccountId('');
  }, [accountsQuery.data, whatsappAccountId]);

  if (campaign.isLoading) {
    return (
      <div className="p-4">
        <FieldsSkeleton fields={8} />
      </div>
    );
  }
  if (campaign.isError || !campaign.data) {
    return (
      <ErrorState
        cause={campaign.error ? errorMessage(campaign.error) : 'Campanha não encontrada.'}
        onRetry={() => void campaign.refetch()}
      />
    );
  }

  const row = campaign.data;
  const parsedLimit = parseRecipientLimit(recipientLimitInput);
  const limitInvalid = recipientLimitInput.trim() !== '' && parsedLimit == null;
  const parsedFollowUpDelay = Number.parseInt(followUpDelayInput.trim(), 10);
  const followUpDelayInvalid =
    followUpDelayInput.trim() !== '' &&
    (!Number.isInteger(parsedFollowUpDelay) ||
      parsedFollowUpDelay < CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MIN ||
      parsedFollowUpDelay > CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MAX);
  const followUpDelayHours = followUpDelayInvalid
    ? CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT
    : parsedFollowUpDelay || CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT;
  const parsedAddMore = parseRecipientLimit(addMoreInput);
  const addMoreInvalid = addMoreInput.trim() === '' || parsedAddMore == null;
  const sendableAccounts = (accountsQuery.data ?? []).filter(isConnectedSendableAccount);
  const willReceive = audience.data
    ? willReceiveCount(
        audience.data.withWhatsapp,
        audience.data.optOut,
        excludeOptOut,
        parsedLimit,
      )
    : 0;
  const chosenIds = filters.ids ?? [];
  const pickMode = chosenIds.length > 0;
  const sampleRows = audience.data?.sample ?? [];
  const selected = pickMode ? new Set(chosenIds) : draftPicked;
  const sampleSelectedCount = sampleRows.filter((row) => selected.has(row.id)).length;
  const allSampleSelected = sampleRows.length > 0 && sampleSelectedCount === sampleRows.length;

  const setChosenIds = (ids: string[] | undefined) => {
    setFilters((prev) => ({ ...prev, ids, page: 1 }));
  };

  const toggleSampleRow = (id: string) => {
    if (pickMode) {
      const next = chosenIds.includes(id)
        ? parseLeadIds(chosenIds.filter((item) => item !== id))
        : mergeLeadIds(chosenIds, [id]);
      setChosenIds(next);
      return;
    }
    setDraftPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSampleAll = () => {
    const sampleIds = sampleRows.map((lead) => lead.id);
    if (pickMode) {
      if (allSampleSelected) {
        setChosenIds(parseLeadIds(chosenIds.filter((id) => !sampleIds.includes(id))));
        return;
      }
      setChosenIds(mergeLeadIds(chosenIds, sampleIds));
      return;
    }
    setDraftPicked((current) => {
      if (allSampleSelected) {
        const next = new Set(current);
        for (const id of sampleIds) next.delete(id);
        return next;
      }
      return new Set([...current, ...sampleIds]);
    });
  };

  const useOnlySelected = () => {
    const ids = parseLeadIds([...selected]);
    if (!ids) {
      toast.error('Marque pelo menos um contato da lista.');
      return;
    }
    setFilters({ ...defaultLeadFilters(), ids });
    setDraftPicked(new Set());
  };

  const draftBody = () => ({
    audienceFilter: filters,
    excludeOptOut,
    recipientLimit: parsedLimit,
    templateId: templateId || null,
    followUpTemplateId: followUpTemplateId || null,
    followUpDelayHours,
    routingMode,
    whatsappAccountId: whatsappAccountId || null,
  });

  const saveDraft = () => {
    if (limitInvalid) {
      toast.error('Quantidade deve ser um número inteiro de pelo menos 1, ou vazio para todos.');
      return;
    }
    if (followUpDelayInvalid) {
      toast.error(
        `Intervalo deve ser um inteiro entre ${CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MIN} e ${CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MAX} horas.`,
      );
      return;
    }
    mutations.patch.mutate(draftBody(), {
      onSuccess: () => toast.success('Rascunho salvo.'),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  const startCampaign = () => {
    if (limitInvalid) {
      toast.error('Quantidade deve ser um número inteiro de pelo menos 1, ou vazio para todos.');
      return;
    }
    if (!templateId) {
      toast.error('Escolha um template.');
      return;
    }
    if (!followUpTemplateId) {
      toast.error('Escolha o template de retorno.');
      return;
    }
    if (followUpTemplateId === templateId) {
      toast.error('O retorno precisa de um template diferente da primeira mensagem.');
      return;
    }
    if (followUpDelayInvalid) {
      toast.error(
        `Intervalo deve ser um inteiro entre ${CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MIN} e ${CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MAX} horas.`,
      );
      return;
    }
    if (!whatsappAccountId || !sendableAccounts.some((account) => account.id === whatsappAccountId)) {
      toast.error('Escolha uma conta WhatsApp conectada. Escaneie o QR em WhatsApp.');
      return;
    }
    if (willReceive < 1) {
      toast.error('Nenhum destinatário com WhatsApp no público. Ajuste os filtros ou a quantidade.');
      return;
    }
    const runStart = () => {
      mutations.start.mutate(undefined, {
        onSuccess: () => toast.success('Campanha iniciada.'),
        onError: (error) => toast.error(errorMessage(error)),
      });
    };
    mutations.patch.mutate(draftBody(), {
      onSuccess: runStart,
      onError: runStart,
    });
  };

  const followUpEligible = metrics.data?.followUpEligible ?? 0;
  const followUpWaiting = metrics.data?.followUpWaitingDelay ?? 0;
  const firstTemplateId = row.status === 'DRAFT' ? templateId : row.templateId;
  const followUpSameTemplate = Boolean(followUpTemplateId) && followUpTemplateId === firstTemplateId;
  const followUpBlocked =
    row.status === 'CANCELLED' ||
    row.status === 'PAUSED' ||
    !followUpTemplateId ||
    followUpSameTemplate ||
    followUpDelayInvalid ||
    followUpEligible < 1 ||
    sendableAccounts.length === 0;
  const remainingEligible = metrics.data?.remainingEligible ?? 0;
  const willAdd = parsedAddMore == null ? 0 : Math.min(parsedAddMore, remainingEligible);

  const addMoreRecipients = () => {
    if (addMoreInvalid || parsedAddMore == null) {
      toast.error('Quantidade deve ser um número inteiro de pelo menos 1.');
      return;
    }
    if (remainingEligible < 1) {
      toast.error('Nenhum contato restante no público. Quem já está nesta campanha não entra de novo.');
      return;
    }
    if (
      !window.confirm(
        `Adicionar ${willAdd} contato(s) à campanha ${row.name}? Quem já recebeu nesta campanha fica de fora.`,
      )
    ) {
      return;
    }
    mutations.addRecipients.mutate(parsedAddMore, {
      onSuccess: () => toast.success('Lote adicionado à fila.'),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  const startFollowUp = () => {
    if (followUpDelayInvalid) {
      toast.error(
        `Intervalo deve ser um inteiro entre ${CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MIN} e ${CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MAX} horas.`,
      );
      return;
    }
    if (!followUpTemplateId) {
      toast.error('Escolha o template de retorno.');
      return;
    }
    if (followUpSameTemplate) {
      toast.error('O retorno precisa de um template diferente da primeira mensagem.');
      return;
    }
    if (followUpEligible < 1) {
      toast.error('Nenhum contato elegível para o retorno.');
      return;
    }
    if (
      !window.confirm(
        `Disparar retorno da campanha ${row.name} para ${followUpEligible} contato(s) que não responderam? Ritmo de ${CAMPAIGN_SENDS_PER_MINUTE} por minuto.`,
      )
    ) {
      return;
    }
    mutations.patch.mutate(
      { followUpTemplateId, followUpDelayHours },
      {
        onSuccess: () =>
          mutations.followUp.mutate(undefined, {
            onSuccess: () => toast.success('Retorno enfileirado.'),
            onError: (error) => toast.error(errorMessage(error)),
          }),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={row.name} count={campaignStatusLabel(row.status)}>
        <Button size="sm" variant="outline" asChild>
          <Link href="/campaigns">Voltar</Link>
        </Button>
        {row.status === 'RUNNING' ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              mutations.pause.mutate(undefined, {
                onSuccess: () => toast.success('Pausada.'),
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
          >
            Pausar
          </Button>
        ) : null}
        {row.status === 'PAUSED' || row.status === 'RUNNING' ? (
          <Button
            size="sm"
            variant={row.status === 'PAUSED' ? 'primary' : 'outline'}
            onClick={() =>
              mutations.resume.mutate(undefined, {
                onSuccess: () => toast.success('Retomada.'),
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
          >
            Retomar
          </Button>
        ) : null}
        {row.status === 'DRAFT' || row.status === 'RUNNING' || row.status === 'PAUSED' ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (!window.confirm(`Cancelar a campanha ${row.name}?`)) return;
              mutations.cancel.mutate(undefined, {
                onSuccess: () => toast.success('Cancelada.'),
                onError: (error) => toast.error(errorMessage(error)),
              });
            }}
          >
            Cancelar
          </Button>
        ) : null}
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {row.status !== 'DRAFT' ? (
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            {(
              [
                ['total', 'Já nesta campanha'],
                ['sent', 'Enviados'],
                ['delivered', 'Entregues'],
                ['failed', 'Falhas'],
                ['responded', 'Respostas'],
                ['remainingEligible', 'Ainda no público'],
                ['followUpSent', 'Retorno'],
                ['followUpEligible', 'Elegíveis retorno'],
                ['qualified', 'Qualificados'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="rounded-md border border-border px-3 py-2">
                <p className="text-2xs text-muted-foreground">{label}</p>
                <p className="numeric text-lg font-medium">
                  {metrics.data ? metrics.data[key] ?? 0 : '—'}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {row.status === 'DRAFT' ? (
          <div className="flex flex-col gap-6">
            <Section title="Público">
              <ManualContactForm
                key={contactFormKey}
                idPrefix="campaign-contact"
                submitLabel="Incluir na campanha"
                pending={createManual.isPending}
                onSubmit={(values) =>
                  createManual.mutate(values, {
                    onSuccess: (lead) => {
                      setFilters((prev) => ({
                        ...defaultLeadFilters(),
                        ids: mergeLeadIds(prev.ids, [lead.id]),
                      }));
                      setDraftPicked(new Set());
                      setContactFormKey((value) => value + 1);
                      toast.success(
                        lead.created
                          ? 'Contato incluído. Ele entra no disparo.'
                          : 'Contato já existia. Incluído no disparo.',
                      );
                    },
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
              />
              <p className="text-xs text-muted-foreground text-pretty">
                Cadastre o número aqui ou busque na base. Marque as linhas e use{' '}
                <span className="text-foreground">Usar só os selecionados</span> para não disparar
                para o resto da planilha.
              </p>
              <FilterBar
                filters={filters}
                facets={facets.data}
                activeCount={countActiveFilters(filters)}
                className="border-b-0 px-0 py-0"
                onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch, page: 1 }))}
                onReset={() => {
                  setDraftPicked(new Set());
                  setFilters(defaultLeadFilters());
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={filters.source === MANUAL_LEAD_SOURCE}
                  onClick={() =>
                    setFilters((prev) => ({ ...prev, source: MANUAL_LEAD_SOURCE, page: 1 }))
                  }
                >
                  Só cadastro manual
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selected.size === 0}
                  onClick={useOnlySelected}
                >
                  Usar só os selecionados
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={excludeOptOut}
                  onChange={(event) => setExcludeOptOut(event.target.checked)}
                />
                Excluir opt-out (recomendado)
              </label>
              {audience.isLoading ? (
                <TableSkeleton rows={4} widths={['8%', '25%', '20%', '20%', '15%', '12%']} />
              ) : audience.isError ? (
                <ErrorState
                  cause={errorMessage(audience.error)}
                  onRetry={() => void audience.refetch()}
                />
              ) : audience.data ? (
                <>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                    <PropertyRow label="Encontrados" numeric>
                      {audience.data.found}
                    </PropertyRow>
                    <PropertyRow label="Com WhatsApp" numeric>
                      {audience.data.withWhatsapp}
                    </PropertyRow>
                    <PropertyRow label="Sem WhatsApp" numeric>
                      {audience.data.withoutWhatsapp}
                    </PropertyRow>
                    <PropertyRow label="Opt-out" numeric>
                      {audience.data.optOut}
                    </PropertyRow>
                    <PropertyRow label="Vão receber" numeric>
                      {willReceive}
                    </PropertyRow>
                  </div>
                  {audience.data.sample.length === 0 ? (
                    <EmptyState
                      title={
                        pickMode
                          ? 'Nenhum dos escolhidos aparece neste filtro'
                          : 'Nenhum lead com WhatsApp neste filtro'
                      }
                      description={
                        pickMode
                          ? 'Limpe a escolha ou o filtro. Ou cadastre o número acima.'
                          : 'Cadastre um número acima, busque pelo WhatsApp ou filtre por cadastro manual.'
                      }
                      action={
                        <Button size="sm" variant="outline" onClick={() => setFilters(defaultLeadFilters())}>
                          Limpar filtros
                        </Button>
                      }
                    />
                  ) : (
                    <Table>
                      <THead>
                        <TR>
                          <TH className="w-8">
                            <Checkbox
                              checked={allSampleSelected ? true : sampleSelectedCount > 0 ? 'indeterminate' : false}
                              onCheckedChange={toggleSampleAll}
                              aria-label="Selecionar os contatos visíveis"
                            />
                          </TH>
                          <TH>Nome</TH>
                          <TH>CNPJ</TH>
                          <TH>WhatsApp</TH>
                          <TH>Origem</TH>
                          <TH>Status</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {audience.data.sample.map((lead) => (
                          <TR key={lead.id} selected={selected.has(lead.id)}>
                            <TD>
                              <Checkbox
                                checked={selected.has(lead.id)}
                                onCheckedChange={() => toggleSampleRow(lead.id)}
                                aria-label={`Selecionar ${lead.razaoSocial}`}
                              />
                            </TD>
                            <TD>{dash(lead.razaoSocial)}</TD>
                            <TD className="numeric">{formatCnpj(lead.cnpj)}</TD>
                            <TD className="numeric">{lead.whatsapp ? formatPhone(lead.whatsapp) : '—'}</TD>
                            <TD>{dash(lead.origem)}</TD>
                            <TD>
                              <StatusBadge status={lead.status as LeadStatus} />
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {pickMode
                      ? `${chosenIds.length} escolhido(s). Amostra de até 20. O restante não é hidratado no navegador.`
                      : 'Amostra de até 20. Sem escolha, o disparo usa o filtro inteiro (não só estas linhas).'}
                  </p>
                </>
              ) : null}
            </Section>

            <Section title="Quantidade">
              <div className="flex flex-col gap-2 md:max-w-xl">
                <Label htmlFor="recipient-limit">Enviar para no máximo</Label>
                <Input
                  id="recipient-limit"
                  numeric
                  inputMode="numeric"
                  value={recipientLimitInput}
                  onChange={(event) => setRecipientLimitInput(event.target.value)}
                  placeholder="Todos com WhatsApp"
                  aria-invalid={limitInvalid || undefined}
                  className="w-40"
                />
                <p className="text-xs text-muted-foreground">
                  Vazio envia para todos os elegíveis. Com limite, entram os primeiros N com WhatsApp
                  (ordem estável por id).
                </p>
                {willReceive > 0 ? (
                  <p className="text-xs text-muted-foreground text-pretty">
                    {willReceive} contato(s) ≈{' '}
                    <span className="numeric">{estimateCampaignMinutes(willReceive)}</span> min (
                    <span className="numeric">{CAMPAIGN_SENDS_PER_MINUTE}</span>/min).
                  </p>
                ) : null}
              </div>
            </Section>

            <Section title="Mensagem">
              <div className="flex flex-col gap-2 md:max-w-xl">
                <Label>Template</Label>
                <Select value={templateId || undefined} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o template" />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates.data ?? []).map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                        {template.media ? ` · ${template.media.kind === 'IMAGE' ? 'Foto' : 'Vídeo'}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(() => {
                  const chosen = (templates.data ?? []).find((item) => item.id === templateId);
                  if (!chosen?.media) return null;
                  return (
                    <>
                      <MediaChip media={chosen.media} />
                      <p className="text-xs text-muted-foreground text-pretty">
                        Esta campanha envia a {chosen.media.kind === 'IMAGE' ? 'foto' : 'vídeo'} do
                        template com o texto como legenda.
                      </p>
                    </>
                  );
                })()}
              </div>
            </Section>

            <Section title="Retorno">
              <p className="text-xs text-muted-foreground text-pretty">
                Segunda mensagem, automática, para quem recebeu a primeira e não respondeu. O
                intervalo conta a partir do envio. Pausar ou cancelar a campanha para parar.
              </p>
              <div className="flex flex-col gap-2 md:max-w-xl">
                <Label>Template de retorno</Label>
                <Select value={followUpTemplateId || undefined} onValueChange={setFollowUpTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha outro template" />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates.data ?? [])
                      .filter((template) => template.id !== templateId)
                      .map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                          {template.media ? ` · ${template.media.kind === 'IMAGE' ? 'Foto' : 'Vídeo'}` : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {followUpSameTemplate ? (
                  <p className="text-xs text-destructive">
                    O retorno precisa ser um template diferente da primeira mensagem.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 md:max-w-xl">
                <Label htmlFor="draft-follow-up-delay">Esperar (horas)</Label>
                <Input
                  id="draft-follow-up-delay"
                  inputMode="numeric"
                  numeric
                  value={followUpDelayInput}
                  onChange={(event) => setFollowUpDelayInput(event.target.value)}
                  className="w-24"
                  aria-invalid={followUpDelayInvalid || undefined}
                />
                <p className="text-xs text-muted-foreground">
                  Padrão {CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT}. Inteiro de{' '}
                  {CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MIN} a {CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MAX}.
                </p>
              </div>
            </Section>

            <Section title="Distribuição">
              <div className="flex flex-col gap-2 md:max-w-xl">
                <Label>Distribuição das respostas</Label>
                <Select
                  value={routingMode}
                  onValueChange={(value) => setRoutingMode(value as CampaignRoutingMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CAMPAIGN_ROUTING_META).map(([value, meta]) => (
                      <SelectItem key={value} value={value}>
                        {meta.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {CAMPAIGN_ROUTING_META[routingMode].description}
                </p>
              </div>
            </Section>

            <Section title="Conta WhatsApp">
              <div className="flex flex-col gap-2 md:max-w-xl">
                {accountsQuery.isLoading ? (
                  <TableSkeleton rows={2} widths={['100%']} />
                ) : accountsQuery.isError ? (
                  <ErrorState
                    cause={errorMessage(accountsQuery.error)}
                    onRetry={() => void accountsQuery.refetch()}
                  />
                ) : sendableAccounts.length === 0 ? (
                  <>
                    <p className="text-sm text-pretty">
                      Nenhuma conta conectada. Escaneie o QR em WhatsApp (conta WhatsApp Web). Conta
                      manual (wa.me) não dispara campanha.
                    </p>
                    <Button size="sm" variant="primary" asChild>
                      <Link href="/whatsapp">Conectar em WhatsApp</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <Label>Conta que envia</Label>
                    <Select value={whatsappAccountId || undefined} onValueChange={setWhatsappAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha a conta conectada" />
                      </SelectTrigger>
                      <SelectContent>
                        {sendableAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name} · {whatsappProviderLabel(account.provider as WhatsAppProvider)} ·{' '}
                            {whatsappSessionStatusLabel(account.sessionStatus as WhatsAppSessionStatus)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Só contas conectadas. Use WhatsApp Web (QR) em{' '}
                      <Link href="/whatsapp" className="text-primary hover:underline">
                        WhatsApp
                      </Link>
                      .
                    </p>
                  </>
                )}
              </div>
            </Section>

            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <RedisHint />
              <p className="text-xs text-muted-foreground">
                Iniciar congela o público no servidor, cria destinatários e enfileira no Redis.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  loading={mutations.patch.isPending}
                  onClick={saveDraft}
                >
                  Salvar rascunho
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={mutations.start.isPending || mutations.patch.isPending}
                  disabled={
                    !templateId ||
                    !followUpTemplateId ||
                    followUpSameTemplate ||
                    followUpDelayInvalid ||
                    sendableAccounts.length === 0 ||
                    willReceive < 1 ||
                    limitInvalid
                  }
                  onClick={startCampaign}
                >
                  Iniciar campanha
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Badge variant="outline">{campaignStatusLabel(row.status)}</Badge>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/campaigns/${id}/recipients`}>Destinatários</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/inbox">Abrir Inbox</Link>
              </Button>
            </div>
            <PropertyRow label="Template">{row.templateName ?? '—'}</PropertyRow>
            {(() => {
              const chosen = (templates.data ?? []).find((item) => item.id === row.templateId);
              if (!chosen?.media) return null;
              return (
                <PropertyRow label="Mídia">
                  <MediaChip media={chosen.media} />
                </PropertyRow>
              );
            })()}
            <PropertyRow label="Conta">{row.whatsappAccountName ?? '—'}</PropertyRow>
            {row.recipientLimit != null ? (
              <PropertyRow label="Quantidade" numeric>
                {row.recipientLimit}
              </PropertyRow>
            ) : null}
            {row.status === 'RUNNING' ? (
              <PropertyRow label="Ritmo">
                <span className="numeric">{CAMPAIGN_SENDS_PER_MINUTE}</span>/min
                {metrics.data != null ? (
                  <>
                    {' · ~'}
                    <span className="numeric">{estimateCampaignMinutes(metrics.data.pending ?? 0)}</span>
                    {' min restantes'}
                  </>
                ) : null}
              </PropertyRow>
            ) : null}
            <PropertyRow label="Início" numeric>
              {formatDateTime(row.startedAt)}
            </PropertyRow>

            {row.status === 'CANCELLED' ? null : (
              <Section title="Próximo lote">
                {metrics.isLoading ? (
                  <FieldsSkeleton fields={3} />
                ) : metrics.isError ? (
                  <ErrorState
                    cause={errorMessage(metrics.error)}
                    onRetry={() => void metrics.refetch()}
                  />
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground text-pretty">
                      Quem já está nesta campanha não entra de novo. O servidor pega os próximos
                      do mesmo público, na mesma ordem.
                    </p>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <p>
                        Já nesta campanha{' '}
                        <span className="numeric font-medium">{metrics.data?.total ?? row.totalCount}</span>
                      </p>
                      <p>
                        Ainda no público{' '}
                        <span className="numeric font-medium">{remainingEligible}</span>
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 md:max-w-xl">
                      <Label htmlFor="add-more-count">Adicionar mais</Label>
                      <Input
                        id="add-more-count"
                        numeric
                        inputMode="numeric"
                        value={addMoreInput}
                        onChange={(event) => setAddMoreInput(event.target.value)}
                        className="w-40"
                        aria-invalid={addMoreInvalid || undefined}
                      />
                    </div>
                    {willAdd > 0 ? (
                      <p className="text-xs text-muted-foreground text-pretty">
                        {willAdd} contato(s) ≈{' '}
                        <span className="numeric">{estimateCampaignMinutes(willAdd)}</span> min (
                        <span className="numeric">{CAMPAIGN_SENDS_PER_MINUTE}</span>/min)
                        {row.status === 'PAUSED' ? '. Pausada: os novos saem ao Retomar.' : '.'}
                      </p>
                    ) : remainingEligible < 1 ? (
                      <p className="text-sm text-pretty">
                        Não resta ninguém no público. Filtre outra base ou crie outra campanha.
                      </p>
                    ) : null}
                    <RedisHint />
                    <div>
                      <Button
                        size="sm"
                        variant="primary"
                        loading={mutations.addRecipients.isPending}
                        disabled={
                          addMoreInvalid ||
                          remainingEligible < 1 ||
                          sendableAccounts.length === 0
                        }
                        onClick={addMoreRecipients}
                      >
                        Adicionar à fila
                      </Button>
                    </div>
                  </div>
                )}
              </Section>
            )}

            <Section title="Retorno">
              {metrics.isLoading ? (
                <FieldsSkeleton fields={4} />
              ) : metrics.isError ? (
                <ErrorState
                  cause={errorMessage(metrics.error)}
                  onRetry={() => void metrics.refetch()}
                />
              ) : row.status === 'PAUSED' ? (
                <p className="text-sm text-pretty text-muted-foreground">
                  Campanha pausada. Retome para o retorno automático voltar à fila.
                </p>
              ) : row.status === 'CANCELLED' ? (
                <p className="text-sm text-pretty text-muted-foreground">
                  Campanha cancelada. O retorno não dispara.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground text-pretty">
                    Depois da primeira mensagem, o retorno sai sozinho quando passa o intervalo e a
                    pessoa não respondeu. Mesmo ritmo de{' '}
                    <span className="numeric">{CAMPAIGN_SENDS_PER_MINUTE}</span> por minuto.
                    <span className="text-foreground"> Disparar retorno agora</span> só pega quem já
                    passou o intervalo e o job automático ainda não rodou.
                  </p>
                  <div className="flex flex-col gap-2 md:max-w-xl">
                    <Label htmlFor="follow-up-template">Template de retorno</Label>
                    <Select
                      value={followUpTemplateId || undefined}
                      onValueChange={setFollowUpTemplateId}
                    >
                      <SelectTrigger id="follow-up-template">
                        <SelectValue placeholder="Escolha outro template" />
                      </SelectTrigger>
                      <SelectContent>
                        {(templates.data ?? [])
                          .filter((template) => template.id !== row.templateId)
                          .map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {followUpSameTemplate ? (
                      <p className="text-xs text-destructive">
                        O retorno precisa ser um template diferente da primeira mensagem.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2 md:max-w-xl">
                    <Label htmlFor="follow-up-delay">Esperar (horas)</Label>
                    <Input
                      id="follow-up-delay"
                      inputMode="numeric"
                      numeric
                      value={followUpDelayInput}
                      onChange={(event) => setFollowUpDelayInput(event.target.value)}
                      className="w-24"
                      aria-invalid={followUpDelayInvalid || undefined}
                    />
                    <p className="text-xs text-muted-foreground">
                      Padrão {CAMPAIGN_FOLLOW_UP_DELAY_HOURS_DEFAULT}. Inteiro de{' '}
                      {CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MIN} a {CAMPAIGN_FOLLOW_UP_DELAY_HOURS_MAX}.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <p>
                      Elegíveis{' '}
                      <span className="numeric font-medium">{followUpEligible}</span>
                    </p>
                    <p>
                      Esperando intervalo{' '}
                      <span className="numeric font-medium">{followUpWaiting}</span>
                    </p>
                    <p>
                      Já responderam{' '}
                      <span className="numeric font-medium">{metrics.data?.responded ?? 0}</span>
                    </p>
                    <p>
                      Retorno enviado{' '}
                      <span className="numeric font-medium">{metrics.data?.followUpSent ?? 0}</span>
                    </p>
                  </div>
                  {followUpEligible > 0 ? (
                    <p className="text-xs text-muted-foreground text-pretty">
                      {followUpEligible} contato(s) ≈{' '}
                      <span className="numeric">{estimateCampaignMinutes(followUpEligible)}</span> min.
                    </p>
                  ) : (
                    <p className="text-sm text-pretty">
                      {followUpWaiting > 0
                        ? `Ninguém no intervalo ainda. ${followUpWaiting} contato(s) ainda esperam as ${followUpDelayHours} h após a primeira mensagem.`
                        : 'Nenhum contato elegível. Só entra quem recebeu a primeira mensagem e não respondeu.'}
                    </p>
                  )}
                  <RedisHint />
                  <div>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={mutations.followUp.isPending || mutations.patch.isPending}
                      disabled={followUpBlocked}
                      onClick={startFollowUp}
                    >
                      Disparar retorno agora
                    </Button>
                  </div>
                </div>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
