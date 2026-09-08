'use client';

import type { InteractionResult } from '@prisma/client';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/primitives';
import { INTERACTION_RESULT_META, OPERATIONAL_RESULTS } from '@/constants/interactions';
import { MediaChip } from '@/features/messages/media-chip';
import {
  useHasConnectedWhatsApp,
  usePatchInteraction,
  useSendWhatsapp,
  useTemplates,
} from '@/features/messages/use-templates';
import { errorMessage } from '@/lib/api-client';
import { addDays, startOfDay } from '@/lib/dates';
import { IDB_KEYS, idbGet, idbSet } from '@/lib/idb';
import { renderTemplate, type TemplateVars } from '@/lib/template';

export function useWhatsappDraft(active: boolean, vars: TemplateVars) {
  const templates = useTemplates(true);
  const [templateId, setTemplateId] = React.useState('');
  const [content, setContent] = React.useState('');

  React.useEffect(() => {
    if (!active) return;
    void idbGet<string>(IDB_KEYS.lastTemplateId).then((stored) => {
      if (stored) setTemplateId(stored);
    });
  }, [active]);

  React.useEffect(() => {
    const list = templates.data ?? [];
    const chosen = list.find((item) => item.id === templateId) ?? list[0];
    if (!chosen) return;
    if (!templateId) setTemplateId(chosen.id);
    setContent(renderTemplate(chosen.body, vars));
  }, [templateId, templates.data, vars]);

  return { templates, templateId, setTemplateId, content, setContent };
}

type LoopStep = 'compose' | 'opened' | 'sent' | 'done';

const FOLLOW_CHIPS = [
  { days: 1, label: '+1 dia' },
  { days: 3, label: '+3 dias' },
  { days: 7, label: '+7 dias' },
] as const;

export function WhatsappLoop({
  leadId,
  hasWhatsapp,
  vars,
  compact = false,
  templateSelectRef,
  onSent,
}: {
  leadId: string;
  hasWhatsapp: boolean;
  vars: TemplateVars;
  compact?: boolean;
  templateSelectRef?: React.Ref<HTMLButtonElement>;
  onSent?: () => void;
}) {
  const { templates, templateId, setTemplateId, content, setContent } = useWhatsappDraft(true, vars);
  const send = useSendWhatsapp(leadId);
  const patch = usePatchInteraction(leadId);
  const connected = useHasConnectedWhatsApp();
  const usesConnected = Boolean(connected.data);
  const [step, setStep] = React.useState<LoopStep>('compose');
  const [interactionId, setInteractionId] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<InteractionResult | null>(null);
  const selectedTemplate = (templates.data ?? []).find((item) => item.id === templateId);
  const templateMedia = selectedTemplate?.media ?? null;
  const mediaBlocksManual = Boolean(templateMedia) && !usesConnected;

  const submitWhatsapp = (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasWhatsapp) return;
    send.mutate(
      { templateId: templateId || null, content },
      {
        onSuccess: (payload) => {
          void idbSet(IDB_KEYS.lastTemplateId, templateId);
          setInteractionId(payload.interaction.id);
          if (payload.mode === 'connected') {
            setStep('sent');
            toast.success('Mensagem enviada pela conta conectada.');
            onSent?.();
            return;
          }
          window.open(payload.whatsappUrl, '_blank', 'noopener');
          setStep('opened');
          toast.success('WhatsApp aberto. Ação iniciada — ainda não está como enviada.');
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const markSent = () => {
    if (!interactionId) return;
    patch.mutate(
      { interactionId, result: 'SENT', type: 'WHATSAPP' },
      {
        onSuccess: () => {
          setStep('sent');
          toast.success('Marcado como enviado.');
          onSent?.();
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const applyResult = (next: InteractionResult, scheduledFor?: string | null) => {
    if (!interactionId) return;
    setResult(next);
    const needsFollow = next === 'NO_RESPONSE' || next === 'CALLBACK';
    patch.mutate(
      {
        interactionId,
        result: next,
        type: 'WHATSAPP',
        scheduledFor: scheduledFor === undefined && needsFollow ? null : scheduledFor,
      },
      {
        onSuccess: () => {
          if (!needsFollow || scheduledFor) {
            setStep('done');
            toast.success(`${INTERACTION_RESULT_META[next].label} registrado.`);
            onSent?.();
          } else {
            toast.success(`${INTERACTION_RESULT_META[next].label}. Escolha o retorno.`);
          }
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  if (step === 'opened') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-pretty text-sm text-foreground">
          Ação iniciada. Confirme o envio no WhatsApp e marque abaixo.
        </p>
        <Button type="button" variant="primary" loading={patch.isPending} onClick={markSent}>
          Marcar enviado
        </Button>
      </div>
    );
  }

  if (step === 'sent' || step === 'done') {
    const showFollowChips = result === 'NO_RESPONSE' || result === 'CALLBACK' || result === null;
    return (
      <div className="flex flex-col gap-2">
        <p className="col-label">O que aconteceu</p>
        <div className="flex flex-wrap gap-1">
          {OPERATIONAL_RESULTS.map((value) => (
            <Button
              key={value}
              type="button"
              variant={result === value ? 'primary' : 'outline'}
              size="sm"
              disabled={patch.isPending}
              onClick={() => applyResult(value)}
            >
              {INTERACTION_RESULT_META[value].label}
            </Button>
          ))}
        </div>
        {showFollowChips ? (
          <div className="flex flex-wrap gap-1">
            <span className="col-label w-full">Reagendar</span>
            {FOLLOW_CHIPS.map((chip) => (
              <Button
                key={chip.days}
                type="button"
                variant="outline"
                size="sm"
                disabled={patch.isPending || !result}
                onClick={() =>
                  applyResult(result ?? 'NO_RESPONSE', addDays(startOfDay(), chip.days).toISOString())
                }
              >
                {chip.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={submitWhatsapp} className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="wa-template">Template</Label>
        <Select value={templateId} onValueChange={setTemplateId} disabled={!hasWhatsapp}>
          <SelectTrigger id="wa-template" ref={templateSelectRef}>
            <SelectValue placeholder="Escolher template" />
          </SelectTrigger>
          <SelectContent>
            {(templates.data ?? []).map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {templateMedia ? <MediaChip media={templateMedia} /> : null}
      {mediaBlocksManual ? (
        <p className="text-pretty text-xs text-muted-foreground">
          Este template tem foto ou vídeo. Conecte o WhatsApp Web (QR) para enviar — wa.me não
          carrega arquivo.
        </p>
      ) : null}
      {compact ? (
        <p className="line-clamp-3 text-pretty text-xs text-foreground">
          {hasWhatsapp
            ? content || 'Escolha um template para ver o texto.'
            : 'Este lead não tem celular válido. O envio está bloqueado.'}
        </p>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="col-label">Mensagem</span>
          <textarea
            rows={8}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={!hasWhatsapp}
            className="scroll-thin rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
      )}
      <Button
        type="submit"
        variant="primary"
        loading={send.isPending}
        disabled={!hasWhatsapp || mediaBlocksManual || (!content.trim() && !templateMedia)}
      >
        {usesConnected ? 'Enviar' : 'Abrir WhatsApp'}
      </Button>
    </form>
  );
}

export function WhatsappNextAction(props: {
  leadId: string;
  hasWhatsapp: boolean;
  vars: TemplateVars;
  compact?: boolean;
  templateSelectRef?: React.Ref<HTMLButtonElement>;
  onSent?: () => void;
}) {
  return <WhatsappLoop {...props} />;
}
