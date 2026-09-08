/**
 * Variáveis de template no formato `{{nome}}`.
 * O corpo nunca é interpretado como HTML: a UI escapa na saída.
 */

const VARIABLE_RE = /\{\{\s*([a-zA-Z][\w]*)\s*\}\}/g;

export const TEMPLATE_VARIABLES = [
  'razaoSocial',
  'nomeFantasia',
  'cidade',
  'estado',
  'cnpj',
  'telefone',
  'whatsapp',
  'email',
  'vendedor',
  'primeiroNome',
  'nomeContato',
  'segmento',
  'porte',
  'responsavel',
  'empresa',
  'pais',
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export type TemplateVars = Partial<Record<TemplateVariable, string>>;

export function extractTemplateVariables(body: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  VARIABLE_RE.lastIndex = 0;
  for (const match of body.matchAll(VARIABLE_RE)) {
    const name = match[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(VARIABLE_RE, (_full, name: string) => {
    const value = vars[name as TemplateVariable];
    return value && value.trim().length > 0 ? value : '';
  });
}

export function encodeWhatsappText(text: string): string {
  return encodeURIComponent(text);
}
