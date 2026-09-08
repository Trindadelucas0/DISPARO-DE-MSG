import type { Metadata } from 'next';

import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { NotImplementedSection } from '@/components/ui/not-implemented';
import { PropertyRow } from '@/components/ui/property-row';
import { ROLE_META } from '@/constants/interactions';
import { SHORTCUTS } from '@/constants/shortcuts';
import { Section } from '@/features/leads/lead-fields';
import { UsersPanel } from '@/features/settings/users-panel';
import { requireSession } from '@/lib/auth/rbac';
import { isRedisAvailable } from '@/lib/redis';

export const metadata: Metadata = { title: 'Configurações' };

export default async function SettingsPage() {
  const user = await requireSession();
  const role = ROLE_META[user.role];
  const cacheOn = isRedisAvailable();

  return (
    <>
      <PageHeader title="Configurações" />

      <div className="scroll-thin grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-4 xl:grid-cols-2">
        <Section title="Sua conta">
          <PropertyRow label="Nome">{user.name}</PropertyRow>
          <PropertyRow label="E-mail">{user.email}</PropertyRow>
          <PropertyRow label="Perfil">{role.label}</PropertyRow>
          <PropertyRow label="O que o perfil permite">{role.description}</PropertyRow>
        </Section>

        <Section
          title="Infraestrutura"
          aside={
            <Badge variant={cacheOn ? 'accent' : 'outline'}>
              {cacheOn ? 'Redis conectado' : 'Redis ausente'}
            </Badge>
          }
        >
          <p className="text-pretty text-xs text-muted-foreground">
            {cacheOn
              ? 'Cache de listagem e limite de tentativas de login estão ativos.'
              : 'Sem Redis o sistema continua funcionando: o cache vira operação vazia e o limite de tentativas de login libera as requisições. É uma degradação deliberada, registrada na documentação.'}
          </p>
        </Section>

        <Section title="Atalhos de teclado">
          {SHORTCUTS.map((shortcut) => (
            <PropertyRow key={shortcut.id} label={shortcut.label} numeric>
              <kbd className="numeric rounded-sm border border-border bg-muted px-1.5 py-0.5 text-2xs text-foreground">
                {shortcut.keys}
              </kbd>
            </PropertyRow>
          ))}
        </Section>

        {user.role === 'ADMIN' ? (
          <UsersPanel />
        ) : (
          <NotImplementedSection
            title="Gestão de usuários"
            phase={9}
            what="Só o administrador cria vendedor, troca perfil e desativa conta. Equipe (recorte do Gestor) ainda não existe no modelo — o Gestor enxerga a base inteira."
          />
        )}
        <NotImplementedSection
          title="Preferências de notificação"
          phase={9}
          what="A fila de follow-up atrasado já aparece em Contatos e Follow-ups. Push/e-mail de aviso ainda não existe."
        />
      </div>
    </>
  );
}
