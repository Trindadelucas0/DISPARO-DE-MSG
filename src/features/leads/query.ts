import { type LeadFilters, leadFiltersSchema } from '@/features/leads/schema';

/**
 * Ponte entre a URL da tela e o contrato da API.
 *
 * Os filtros moram na querystring: a tela é compartilhável, o botão voltar
 * funciona e o mesmo objeto que desenha a barra de filtros é o que a API
 * recebe. Nenhum filtro é aplicado em JavaScript sobre a lista.
 */

const DEFAULTS = {
  situacao: 'ATIVA',
  page: 1,
  limit: 50,
  sort: 'createdAt',
  dir: 'desc',
} as const;

/** Aceita os `searchParams` do Next (valor pode vir como array) e valida. */
export function parseFiltersFromParams(
  params: Record<string, string | string[] | undefined>,
): LeadFilters {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined) flat[key] = single;
  }
  const parsed = leadFiltersSchema.safeParse(flat);
  // URL inválida (link velho, parâmetro editado à mão) não deve derrubar a
  // tela: cai no filtro padrão em vez de estourar erro.
  return parsed.success ? parsed.data : leadFiltersSchema.parse({});
}

/** Só o que difere do padrão vai para a URL, para o link ficar legível. */
export function filtersToSearchParams(filters: LeadFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (DEFAULTS[key as keyof typeof DEFAULTS] === value) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      params.set(key, value.join(','));
      continue;
    }
    params.set(key, String(value));
  }
  return params;
}

export function leadsApiUrl(filters: LeadFilters): string {
  const params = filtersToSearchParams(filters);
  // A API precisa dos valores explícitos: o default dela é o mesmo, mas mandar
  // o que está em uso evita depender da coincidência entre os dois lados.
  params.set('page', String(filters.page));
  params.set('limit', String(filters.limit));
  params.set('sort', filters.sort);
  params.set('dir', filters.dir);
  params.set('situacao', filters.situacao);
  return `/api/leads?${params.toString()}`;
}
