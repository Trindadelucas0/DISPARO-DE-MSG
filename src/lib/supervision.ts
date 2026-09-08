import type { Prisma } from '@prisma/client';

/**
 * Quem entra na tabela de Supervisão.
 *
 * Inbox **Assumir** e transferência aceitam qualquer usuário ativo (inclusive ADMIN).
 * Filtrar só USER/MANAGER esconde o responsável real: KPIs sobem e a tabela fica vazia.
 * Inativo com conversa ainda atribuída também entra, para o gestor achar o atendimento.
 */
export function supervisionSellersWhere(): Prisma.UserWhereInput {
  return {
    OR: [{ active: true }, { conversationsAssigned: { some: {} } }],
  };
}
