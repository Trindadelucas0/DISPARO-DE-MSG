'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export type ManualContactValues = {
  name: string;
  whatsapp: string;
  cnpj: string;
};

export function ManualContactForm({
  idPrefix,
  defaultWhatsapp = '',
  submitLabel,
  pending,
  layout = 'row',
  onSubmit,
}: {
  idPrefix: string;
  defaultWhatsapp?: string;
  submitLabel: string;
  pending: boolean;
  layout?: 'row' | 'stack';
  onSubmit: (values: ManualContactValues) => void;
}) {
  const [name, setName] = React.useState('');
  const [whatsapp, setWhatsapp] = React.useState(defaultWhatsapp);
  const [cnpj, setCnpj] = React.useState('');

  React.useEffect(() => {
    setWhatsapp(defaultWhatsapp);
  }, [defaultWhatsapp]);

  const canSubmit = name.trim().length >= 2 && (whatsapp.trim().length > 0 || cnpj.trim().length > 0);

  return (
    <form
      className={cn(
        layout === 'row' ? 'flex flex-wrap items-end gap-2' : 'flex flex-col gap-2',
      )}
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit || pending) return;
        onSubmit({ name: name.trim(), whatsapp: whatsapp.trim(), cnpj: cnpj.trim() });
      }}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={`${idPrefix}-name`}>Nome</Label>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          className={layout === 'row' ? 'w-48' : 'w-full'}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={`${idPrefix}-whatsapp`}>WhatsApp</Label>
        <Input
          id={`${idPrefix}-whatsapp`}
          value={whatsapp}
          onChange={(event) => setWhatsapp(event.target.value)}
          numeric
          inputMode="tel"
          autoComplete="tel"
          className={layout === 'row' ? 'w-40' : 'w-full'}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={`${idPrefix}-cnpj`}>CNPJ (opcional)</Label>
        <Input
          id={`${idPrefix}-cnpj`}
          value={cnpj}
          onChange={(event) => setCnpj(event.target.value)}
          numeric
          inputMode="numeric"
          className={layout === 'row' ? 'w-44' : 'w-full'}
        />
      </div>
      <Button size="sm" variant="primary" type="submit" disabled={!canSubmit || pending} loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
