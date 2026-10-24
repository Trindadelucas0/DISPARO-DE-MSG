export type TemplateSaveInput = {
  id?: string;
  name: string;
  channel: string;
  subject?: string | null;
  body: string;
  active?: boolean;
  mediaId?: string | null;
};

/**
 * O id identifica a rota do PATCH, mas não faz parte do contrato JSON da API.
 */
export function prepareTemplateSaveRequest(input: TemplateSaveInput) {
  const { id, ...body } = input;
  return { id, body };
}
