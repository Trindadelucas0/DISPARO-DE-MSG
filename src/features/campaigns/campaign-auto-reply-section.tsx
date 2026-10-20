'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ErrorState, FieldsSkeleton } from '@/components/ui/data-state';
import { Input, Textarea } from '@/components/ui/input';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from '@/components/ui/primitives';
import { type AutoReplyConfig, type AutoReplyResponse, type AutoReplyRule, useCampaignAutoReply } from './use-campaigns';
import { errorMessage } from '@/lib/api-client';
import type { SerializedTemplate } from '@/server/services/template.service';

const TEXT_VALUE = '__TEXT__';
const emptyResponse = (): AutoReplyResponse => ({ templateId: null, body: '' });
const emptyRule = (): AutoReplyRule => ({ matchMode: 'EQUALS', matchValues: [''], response: emptyResponse() });

function ResponseEditor({ id, value, templates, onChange }: { id: string; value: AutoReplyResponse; templates: SerializedTemplate[]; onChange: (value: AutoReplyResponse) => void }) {
  const selected = value.templateId ?? TEXT_VALUE;
  return (
    <div className="grid gap-2 md:grid-cols-[14rem_1fr]">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-type`}>Responder com</Label>
        <Select value={selected} onValueChange={(next) => onChange(next === TEXT_VALUE ? emptyResponse() : { templateId: next, body: null })}>
          <SelectTrigger id={`${id}-type`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TEXT_VALUE}>Texto próprio</SelectItem>
            {templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {selected === TEXT_VALUE ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-body`}>Mensagem</Label>
          <Textarea id={`${id}-body`} rows={2} maxLength={4000} value={value.body ?? ''} onChange={(event) => onChange({ templateId: null, body: event.target.value })} />
        </div>
      ) : null}
    </div>
  );
}

export function CampaignAutoReplySection({ campaignId, templates }: { campaignId: string; templates: SerializedTemplate[] }) {
  const { query, save } = useCampaignAutoReply(campaignId);
  const [form, setForm] = React.useState<AutoReplyConfig | null>(null);
  React.useEffect(() => {
    if (query.data) {
      setForm({ ...query.data, rules: query.data.rules.length ? query.data.rules : [emptyRule()] });
    }
  }, [query.data]);

  if (query.isError) return <section className="mb-6"><h2 className="mb-3 text-base font-medium">Respostas automáticas</h2><ErrorState cause={errorMessage(query.error)} onRetry={() => void query.refetch()} /></section>;
  if (query.isLoading || !form) return <section className="mb-6"><h2 className="mb-3 text-base font-medium">Respostas automáticas</h2><FieldsSkeleton fields={3} /></section>;

  const updateRule = (index: number, rule: AutoReplyRule) => setForm((current) => current && ({ ...current, rules: current.rules.map((item, i) => i === index ? rule : item) }));
  const move = (index: number, direction: -1 | 1) => setForm((current) => {
    if (!current) return current;
    const next = [...current.rules];
    const target = index + direction;
    const currentRule = next[index];
    const targetRule = next[target];
    if (!currentRule || !targetRule) return current;
    next[index] = targetRule;
    next[target] = currentRule;
    return { ...current, rules: next };
  });
  const validate = () => form.rules.length > 0 && form.rules.every((rule) => rule.matchValues.every((value) => value.trim()) && Boolean(rule.response.templateId || rule.response.body?.trim())) && Boolean(form.fallback.templateId || form.fallback.body?.trim());

  return (
    <section className="mb-6 flex flex-col gap-4 border-b border-border pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-medium">Respostas automáticas</h2><p className="text-xs text-muted-foreground">Uma resposta por contato desta campanha. Continua ativa até ser desligada.</p></div>
        <div className="flex items-center gap-2"><Switch id="auto-reply-enabled" checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} /><Label htmlFor="auto-reply-enabled">{form.enabled ? 'Ativada' : 'Desativada'}</Label></div>
      </div>

      {form.rules.map((rule, index) => (
        <div key={rule.id ?? index} className="flex flex-col gap-3 rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">Regra {index + 1}</p><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label="Mover regra para cima" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-4" /></Button><Button size="icon" variant="ghost" aria-label="Mover regra para baixo" disabled={index === form.rules.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-4" /></Button><Button size="icon" variant="ghost" aria-label="Excluir regra" disabled={form.rules.length === 1} onClick={() => setForm({ ...form, rules: form.rules.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></Button></div></div>
          <div className="grid gap-2 md:grid-cols-[14rem_1fr]">
            <div className="flex flex-col gap-1.5"><Label>Quando a resposta</Label><Select value={rule.matchMode} onValueChange={(matchMode) => updateRule(index, { ...rule, matchMode: matchMode as AutoReplyRule['matchMode'], matchValues: rule.matchValues.slice(0, 1) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EQUALS">For igual a</SelectItem><SelectItem value="CONTAINS">Contiver</SelectItem><SelectItem value="ANY_OF">For uma das alternativas</SelectItem></SelectContent></Select></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor={`auto-values-${index}`}>{rule.matchMode === 'ANY_OF' ? 'Alternativas separadas por vírgula' : 'Valor esperado'}</Label><Input id={`auto-values-${index}`} value={rule.matchValues.join(', ')} onChange={(event) => updateRule(index, { ...rule, matchValues: rule.matchMode === 'ANY_OF' ? event.target.value.split(',').map((item) => item.trim()) : [event.target.value] })} placeholder={rule.matchMode === 'ANY_OF' ? 'sim, tenho interesse, pode enviar' : '2'} /></div>
          </div>
          <ResponseEditor id={`auto-rule-${index}`} value={rule.response} templates={templates} onChange={(response) => updateRule(index, { ...rule, response })} />
        </div>
      ))}
      <div><Button size="sm" variant="outline" disabled={form.rules.length >= 20} onClick={() => setForm({ ...form, rules: [...form.rules, emptyRule()] })}><Plus className="mr-1 size-4" />Adicionar regra</Button></div>
      <div className="flex flex-col gap-2"><p className="text-sm font-medium">Se nenhuma regra corresponder</p><ResponseEditor id="auto-fallback" value={form.fallback} templates={templates} onChange={(fallback) => setForm({ ...form, fallback })} /></div>
      <div><Button size="sm" variant="primary" loading={save.isPending} disabled={!validate()} onClick={() => save.mutate(form, { onSuccess: () => toast.success('Automação salva.'), onError: (error) => toast.error(errorMessage(error)) })}>Salvar automação</Button>{!validate() ? <p className="mt-1 text-xs text-destructive">Preencha as condições e todas as mensagens antes de salvar.</p> : null}</div>
    </section>
  );
}
