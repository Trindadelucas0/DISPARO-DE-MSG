import { prisma } from '@/lib/db';
import { nationalPhoneDigits } from '@/lib/validation/phone';

/**
 * Opt-out é do NÚMERO, não do lead.
 *
 * O mesmo WhatsApp aparece em mais de um lead: a empresa trazida pela lista
 * da Receita e o contato avulso da mesma pessoa vindo de uma lista de
 * telefones. Quem pediu para sair pediu para sair do número — a checagem por
 * `leadId + phone` (a chave única da tabela) deixaria o disparo passar pelo
 * outro lead.
 *
 * `opt_outs.phone` e `campaign_recipients.phone` guardam o número nacional
 * (DDD + número, sem o 55). Registro antigo com 55 na frente continua valendo:
 * tudo é comparado depois de `nationalPhoneDigits`.
 */

/** Chunk do `IN` para não estourar o limite de parâmetros do Postgres. */
const LOOKUP_CHUNK = 5_000;

/** As duas formas em que o número pode ter sido gravado. */
export function optOutPhoneVariants(phone: string | null | undefined): string[] {
  const national = nationalPhoneDigits(phone);
  if (national.length === 0) return [];
  return [national, `55${national}`];
}

/**
 * Dos números informados, quais estão em opt-out — em qualquer lead.
 * Devolve sempre o número nacional, pronto para comparar com o do destinatário.
 */
export async function optedOutPhoneSet(
  phones: Iterable<string>,
): Promise<Set<string>> {
  const wanted = new Set<string>();
  for (const phone of phones) {
    const national = nationalPhoneDigits(phone);
    if (national.length > 0) wanted.add(national);
  }
  if (wanted.size === 0) return new Set();

  const lookup = [...wanted].flatMap((national) => [national, `55${national}`]);
  const found = new Set<string>();

  for (let index = 0; index < lookup.length; index += LOOKUP_CHUNK) {
    const rows = await prisma.optOut.findMany({
      where: { phone: { in: lookup.slice(index, index + LOOKUP_CHUNK) } },
      select: { phone: true },
    });
    for (const row of rows) {
      const national = nationalPhoneDigits(row.phone);
      if (wanted.has(national)) found.add(national);
    }
  }

  return found;
}

/** Opt-out do número, independente do lead a que ele esteja ligado. */
export async function isPhoneOptedOut(phone: string | null | undefined): Promise<boolean> {
  const variants = optOutPhoneVariants(phone);
  if (variants.length === 0) return false;
  const found = await prisma.optOut.findFirst({
    where: { phone: { in: variants } },
    select: { id: true },
  });
  return found !== null;
}
