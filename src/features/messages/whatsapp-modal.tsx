'use client';

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { WhatsappLoop } from '@/features/messages/whatsapp-composer';
import { useHasConnectedWhatsApp } from '@/features/messages/use-templates';
import type { TemplateVars } from '@/lib/template';

export function WhatsappModal({
  open,
  onOpenChange,
  leadId,
  leadName,
  hasWhatsapp,
  vars,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  hasWhatsapp: boolean;
  vars: TemplateVars;
  onSent?: () => void;
}) {
  const connected = useHasConnectedWhatsApp();
  const connectedCopy = Boolean(connected.data);

  let description = 'Este lead não tem celular válido. O envio está bloqueado.';
  if (hasWhatsapp && connectedCopy) {
    description =
      'Confira o texto e envie pela conta WhatsApp conectada. A conversa aparece na Inbox.';
  } else if (hasWhatsapp) {
    description =
      'Confira o texto, abra o wa.me, marque enviado e registre o resultado. Sem sessão conectada o sistema não envia sozinho.';
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-balance">WhatsApp — {leadName}</DialogTitle>
          <DialogDescription className="text-pretty">{description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {open ? (
            <WhatsappLoop
              leadId={leadId}
              hasWhatsapp={hasWhatsapp}
              vars={vars}
              onSent={onSent}
            />
          ) : null}
        </DialogBody>
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}
