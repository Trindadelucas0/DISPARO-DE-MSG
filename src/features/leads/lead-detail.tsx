'use client';

import type { Role } from '@prisma/client';
import { ArrowLeft, Mail, MessageCircle, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { PageHeader } from '@/components/shell/app-shell';
import { ResultBadge, StatusBadge, TagChip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState, FieldsSkeleton, ForbiddenState } from '@/components/ui/data-state';
import { useSessionUser } from '@/features/auth/session-context';
import { Field, FieldGrid, Section, ValueList } from '@/features/leads/lead-fields';
import { LeadEditForm } from '@/features/leads/lead-edit-form';
import { LeadStatusPanel } from '@/features/leads/lead-status-panel';
import { InteractionTimeline } from '@/features/leads/interaction-timeline';
import { WhatsappModal } from '@/features/messages/whatsapp-modal';
import { useLead } from '@/features/leads/use-leads';
import { ApiError } from '@/lib/api-client';
import {
  dash,
  formatCep,
  formatCnpj,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPhone,
} from '@/lib/format';

function BooleanField({ label, value }: { label: string; value: boolean }) {
  return <Field label={label} value={value ? 'Sim' : 'Não'} />;
}

export function LeadDetail({ id, role }: { id: string; role: Role }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useLead(id);
  const session = useSessionUser();

  // `e` na tabela abre já em edição; o estado vive na URL para o link funcionar.
  const [editing, setEditing] = React.useState(searchParams.get('edit') === '1');
  const [whatsappOpen, setWhatsappOpen] = React.useState(false);

  if (query.isPending) {
    return (
      <>
        <PageHeader title="Lead" />
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_22rem] gap-3 overflow-auto p-4">
          <FieldsSkeleton fields={8} />
          <FieldsSkeleton fields={3} />
        </div>
      </>
    );
  }

  if (query.isError) {
    const forbidden = query.error instanceof ApiError && query.error.kind === 'forbidden';
    return (
      <>
        <PageHeader title="Lead" />
        {forbidden ? (
          <ForbiddenState reason={query.error.message} />
        ) : (
          <ErrorState
            cause={query.error instanceof Error ? query.error.message : 'Erro desconhecido.'}
            onRetry={() => void query.refetch()}
          />
        )}
      </>
    );
  }

  const lead = query.data;
  if (!lead) {
    return (
      <>
        <PageHeader title="Lead" />
        <ErrorState
          title="Lead não encontrado"
          cause="O registro foi removido ou está fora do seu escopo de acesso."
          onRetry={() => router.push('/leads')}
        />
      </>
    );
  }

  const endereco = [
    lead.logradouro,
    lead.numero,
    lead.complemento,
    lead.bairro,
  ]
    .filter((part) => part && part.trim().length > 0)
    .join(', ');

  return (
    <>
      <PageHeader title={lead.razaoSocial}>
        <StatusBadge status={lead.status} />
        <ResultBadge result={lead.lastInteractionResult} />
        {lead.whatsappLink ? (
          <Button variant="primary" size="sm" onClick={() => setWhatsappOpen(true)}>
            <MessageCircle aria-hidden />
            WhatsApp
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled title="Sem celular válido na base">
            Sem WhatsApp
          </Button>
        )}
        {lead.email ? (
          <Button variant="outline" size="sm" asChild>
            <a href={`mailto:${lead.email}`}>
              <Mail aria-hidden />
              E-mail
            </a>
          </Button>
        ) : null}
        {lead.canEdit && !editing ? (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Editar
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" asChild>
          <Link href="/leads">
            <ArrowLeft aria-hidden />
            Voltar
          </Link>
        </Button>
      </PageHeader>

      <div className="scroll-thin grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-3">
          {editing ? (
            <LeadEditForm lead={lead} role={role} onDone={() => setEditing(false)} />
          ) : (
            <>
              <Section title="Empresa">
                <FieldGrid>
                  <Field label="CNPJ" value={formatCnpj(lead.cnpj)} numeric />
                  <Field label="Situação cadastral" value={dash(lead.situacaoCadastral)} />
                  <Field label="Razão social" value={lead.razaoSocial} wide />
                  <Field label="Nome fantasia" value={dash(lead.nomeFantasia)} wide />
                  <Field label="Natureza jurídica" value={dash(lead.naturezaJuridica)} wide />
                  <Field label="Abertura" value={formatDate(lead.dataAbertura)} numeric />
                  <Field label="Capital social" value={formatCurrency(lead.capitalSocial)} numeric />
                  <Field label="Porte" value={dash(lead.porte)} />
                  <BooleanField label="Optante Simples" value={lead.optanteSimples} />
                  <BooleanField label="Optante MEI" value={lead.optanteMei} />
                </FieldGrid>
              </Section>

              <Section title="Contato">
                <FieldGrid>
                  <Field
                    label="Telefone"
                    value={lead.telefone ? formatPhone(lead.telefone) : '—'}
                    numeric
                  />
                  <Field
                    label="WhatsApp"
                    value={lead.whatsapp ? formatPhone(lead.whatsapp) : 'Sem celular na base'}
                    numeric
                  />
                  <Field label="E-mail" value={dash(lead.email)} wide />
                  {lead.phones.length > 1 ? (
                    <div className="col-span-2 flex flex-col gap-0.5">
                      <span className="col-label">Todos os telefones da planilha</span>
                      <span className="numeric text-sm text-foreground">
                        {lead.phones.map((phone) => formatPhone(phone)).join(' · ')}
                      </span>
                    </div>
                  ) : null}
                </FieldGrid>
              </Section>

              <Section title="Endereço">
                <FieldGrid>
                  <Field label="Endereço" value={dash(endereco)} wide />
                  <Field label="Cidade" value={dash(lead.cidade)} />
                  <Field label="UF" value={dash(lead.estado)} />
                  <Field label="CEP" value={formatCep(lead.cep)} numeric />
                  <Field label="Código IBGE" value={dash(lead.ibge)} numeric />
                </FieldGrid>
              </Section>

              <Section title="Atividade econômica">
                <FieldGrid>
                  <Field label="CNAE principal" value={dash(lead.cnaePrincipalCodigo)} numeric />
                  <Field label="Segmento" value={dash(lead.segmento)} />
                  <Field
                    label="Descrição do CNAE principal"
                    value={dash(lead.cnaePrincipalDescricao)}
                    wide
                  />
                  <div className="col-span-2 flex flex-col gap-0.5">
                    <span className="col-label">
                      CNAEs secundários ({lead.cnaeSecundarios.length})
                    </span>
                    <ValueList
                      items={lead.cnaeSecundarios}
                      emptyLabel="Nenhum CNAE secundário na base."
                    />
                  </div>
                </FieldGrid>
              </Section>

              <Section title={`Sócios (${lead.socios.length})`}>
                <ValueList items={lead.socios} emptyLabel="Nenhum sócio informado na planilha." />
              </Section>

              {lead.observacoes ? (
                <Section title="Observações">
                  <p className="text-pretty text-sm text-foreground">{lead.observacoes}</p>
                </Section>
              ) : null}
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <LeadStatusPanel lead={lead} role={role} />

          <Section title="Rastro">
            <FieldGrid>
              <Field label="Cadastrado" value={formatDateTime(lead.createdAt)} numeric />
              <Field label="Atualizado" value={formatDateTime(lead.updatedAt)} numeric />
              <Field label="Último contato" value={formatDateTime(lead.lastContactAt)} numeric />
              <Field label="Origem" value={dash(lead.origem)} />
            </FieldGrid>
          </Section>

          {lead.tags.length > 0 ? (
            <Section title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {lead.tags.map((tag) => (
                  <TagChip key={tag.id} name={tag.name} />
                ))}
              </div>
            </Section>
          ) : null}

          <InteractionTimeline leadId={lead.id} canEdit={lead.canEdit} />
        </div>
      </div>

      <WhatsappModal
        open={whatsappOpen}
        onOpenChange={setWhatsappOpen}
        leadId={lead.id}
        leadName={lead.razaoSocial}
        hasWhatsapp={Boolean(lead.whatsappLink)}
        vars={{
          razaoSocial: lead.razaoSocial,
          nomeFantasia: lead.nomeFantasia ?? '',
          cidade: lead.cidade ?? '',
          estado: lead.estado ?? '',
          cnpj: lead.cnpj,
          telefone: lead.telefone ?? '',
          whatsapp: lead.whatsapp ?? '',
          email: lead.email ?? '',
          vendedor: session?.name ?? '',
        }}
      />
    </>
  );
}
