'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Role } from '@prisma/client';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { type LeadUpdateInput, leadUpdateSchema } from '@/features/leads/schema';
import { useUpdateLead } from '@/features/leads/use-leads';
import { errorMessage } from '@/lib/api-client';
import type { SerializedLeadDetail } from '@/server/services/lead.service';

import { Section } from '@/features/leads/lead-fields';

/** Campos editáveis do lead. O resto vem da Receita e é somente leitura. */
const EDITABLE_TEXT = [
  { name: 'razaoSocial', label: 'Razão social', span: 2 },
  { name: 'nomeFantasia', label: 'Nome fantasia', span: 2 },
  { name: 'telefone', label: 'Telefone', numeric: true },
  { name: 'whatsapp', label: 'WhatsApp', numeric: true },
  { name: 'email', label: 'E-mail', span: 2 },
  { name: 'logradouro', label: 'Logradouro', span: 2 },
  { name: 'numero', label: 'Número' },
  { name: 'complemento', label: 'Complemento' },
  { name: 'bairro', label: 'Bairro' },
  { name: 'cep', label: 'CEP', numeric: true },
  { name: 'cidade', label: 'Cidade' },
  { name: 'estado', label: 'UF' },
  { name: 'segmento', label: 'Segmento', span: 2 },
  { name: 'porte', label: 'Porte' },
  { name: 'origem', label: 'Origem' },
] as const satisfies readonly {
  name: keyof LeadUpdateInput;
  label: string;
  span?: number;
  numeric?: boolean;
}[];

function toFormValues(lead: SerializedLeadDetail): LeadUpdateInput {
  return {
    razaoSocial: lead.razaoSocial,
    nomeFantasia: lead.nomeFantasia ?? '',
    telefone: lead.telefone ?? '',
    whatsapp: lead.whatsapp ?? '',
    email: lead.email ?? '',
    logradouro: lead.logradouro ?? '',
    numero: lead.numero ?? '',
    complemento: lead.complemento ?? '',
    bairro: lead.bairro ?? '',
    cep: lead.cep ?? '',
    cidade: lead.cidade ?? '',
    estado: lead.estado ?? '',
    segmento: lead.segmento ?? '',
    porte: lead.porte ?? '',
    origem: lead.origem ?? '',
    observacoes: lead.observacoes ?? '',
  } as LeadUpdateInput;
}

export function LeadEditForm({
  lead,
  role,
  onDone,
}: {
  lead: SerializedLeadDetail;
  role: Role;
  onDone: () => void;
}) {
  const update = useUpdateLead(lead.id);

  const form = useForm<LeadUpdateInput>({
    resolver: zodResolver(leadUpdateSchema),
    defaultValues: toFormValues(lead),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields, isDirty },
  } = form;

  const onSubmit = handleSubmit((values) => {
    // Envia só o que mudou: um PATCH com o objeto inteiro sobrescreveria campo
    // que outro usuário alterou entre o carregamento e o salvamento.
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(dirtyFields) as (keyof LeadUpdateInput)[]) {
      patch[key] = values[key];
    }
    if (Object.keys(patch).length === 0) {
      onDone();
      return;
    }

    update.mutate(patch as LeadUpdateInput, {
      onSuccess: () => {
        toast.success('Lead atualizado.');
        onDone();
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Section
        title="Editar dados do lead"
        aside={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={onDone}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={update.isPending}
              disabled={!isDirty}
            >
              Salvar
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {EDITABLE_TEXT.map((field) => {
            const error = errors[field.name];
            return (
              <div
                key={field.name}
                className={'span' in field && field.span === 2 ? 'col-span-2' : undefined}
              >
                <div className="flex flex-col gap-1">
                  <Label htmlFor={field.name}>{field.label}</Label>
                  <Input
                    id={field.name}
                    numeric={'numeric' in field ? field.numeric : false}
                    aria-invalid={error ? true : undefined}
                    {...register(field.name)}
                  />
                  {error ? (
                    <span className="text-2xs text-destructive">{String(error.message)}</span>
                  ) : null}
                </div>
              </div>
            );
          })}

          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" rows={4} {...register('observacoes')} />
            {errors.observacoes ? (
              <span className="text-2xs text-destructive">
                {String(errors.observacoes.message)}
              </span>
            ) : null}
          </div>
        </div>

        {role === 'USER' ? (
          <p className="text-2xs text-muted-foreground">
            Reatribuição de responsável é ação de gestor e não aparece aqui.
          </p>
        ) : null}
      </Section>
    </form>
  );
}
