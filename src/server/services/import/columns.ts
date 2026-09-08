/**
 * Auto-detecção de colunas da planilha.
 *
 * O cabeçalho da fonte atual está na linha 1 da aba `empresas`, mas o mapeamento
 * é por nome normalizado (sem acento, sem caixa, sem pontuação), não por posição.
 * O usuário pode sobrescrever qualquer coluna na tela /import.
 */

export const IMPORT_FIELDS = [
  'cnpj',
  'razaoSocial',
  'nomeFantasia',
  'situacaoCadastral',
  'naturezaJuridica',
  'logradouro',
  'numero',
  'complemento',
  'cep',
  'bairro',
  'cidade',
  'estado',
  'dataAbertura',
  'telefones',
  'email',
  'capitalSocial',
  'cnaePrincipalCodigo',
  'cnaePrincipalDescricao',
  'cnaeSecundariosCodigos',
  'cnaeSecundariosDescricoes',
  'ibge',
  'socios',
  'porte',
  'optanteMei',
  'optanteSimples',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export interface ImportFieldSpec {
  readonly field: ImportField;
  readonly label: string;
  readonly required: boolean;
  /** Nomes de cabeçalho aceitos, já normalizados. */
  readonly aliases: readonly string[];
}

export const IMPORT_FIELD_SPECS: readonly ImportFieldSpec[] = [
  { field: 'cnpj', label: 'CNPJ', required: true, aliases: ['cnpj', 'cnpj completo', 'numero cnpj'] },
  {
    field: 'razaoSocial',
    label: 'Razão social',
    required: true,
    aliases: ['razao social', 'razaosocial', 'nome empresarial', 'empresa'],
  },
  {
    field: 'nomeFantasia',
    label: 'Nome fantasia',
    required: false,
    aliases: ['nome fantasia', 'nomefantasia', 'fantasia'],
  },
  {
    field: 'situacaoCadastral',
    label: 'Situação cadastral',
    required: false,
    aliases: ['situacao cadastral', 'situacao'],
  },
  {
    field: 'naturezaJuridica',
    label: 'Natureza jurídica',
    required: false,
    aliases: ['descricao natureza juridica', 'natureza juridica'],
  },
  { field: 'logradouro', label: 'Logradouro', required: false, aliases: ['logradouro', 'endereco'] },
  { field: 'numero', label: 'Número', required: false, aliases: ['numero'] },
  { field: 'complemento', label: 'Complemento', required: false, aliases: ['complemento'] },
  { field: 'cep', label: 'CEP', required: false, aliases: ['cep'] },
  { field: 'bairro', label: 'Bairro', required: false, aliases: ['bairro'] },
  {
    field: 'cidade',
    label: 'Cidade',
    required: false,
    aliases: ['municipio', 'cidade', 'nome do municipio'],
  },
  { field: 'estado', label: 'UF', required: false, aliases: ['uf', 'estado', 'sigla uf'] },
  {
    field: 'dataAbertura',
    label: 'Data de abertura',
    required: false,
    aliases: ['data de abertura', 'data abertura', 'data de inicio atividade'],
  },
  {
    field: 'telefones',
    label: 'Telefones',
    required: false,
    aliases: ['telefones', 'telefone', 'ddd telefone'],
  },
  { field: 'email', label: 'E-mail', required: false, aliases: ['e mail', 'email', 'correio eletronico'] },
  {
    field: 'capitalSocial',
    label: 'Capital social',
    required: false,
    aliases: ['capital social'],
  },
  {
    field: 'cnaePrincipalCodigo',
    label: 'Código do CNAE principal',
    required: false,
    aliases: ['codigo da atividade principal', 'cnae fiscal', 'codigo cnae principal'],
  },
  {
    field: 'cnaePrincipalDescricao',
    label: 'Descrição do CNAE principal',
    required: false,
    aliases: ['descricao da atividade principal', 'cnae fiscal descricao', 'atividade principal'],
  },
  {
    field: 'cnaeSecundariosCodigos',
    label: 'Códigos dos CNAEs secundários',
    required: false,
    aliases: ['codigos das atividades secundarias', 'cnaes secundarios'],
  },
  {
    field: 'cnaeSecundariosDescricoes',
    label: 'Descrições dos CNAEs secundários',
    required: false,
    aliases: ['descricao das atividades secundarias', 'atividades secundarias'],
  },
  {
    field: 'ibge',
    label: 'Código IBGE',
    required: false,
    aliases: ['codigo ibge do municipio', 'codigo ibge', 'ibge'],
  },
  { field: 'socios', label: 'Sócios', required: false, aliases: ['socios', 'quadro societario'] },
  {
    field: 'porte',
    label: 'Porte',
    required: false,
    aliases: ['porte da empresa', 'porte'],
  },
  { field: 'optanteMei', label: 'Optante MEI', required: false, aliases: ['optante mei', 'mei'] },
  {
    field: 'optanteSimples',
    label: 'Optante Simples',
    required: false,
    aliases: ['optante simples', 'simples nacional', 'simples'],
  },
];

/** Minúsculas, sem acento, sem pontuação, espaços colapsados. */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** field → índice da coluna (0-based). Coluna ausente fica fora do mapa. */
export type ColumnMapping = Partial<Record<ImportField, number>>;

export interface DetectionResult {
  readonly mapping: ColumnMapping;
  readonly headers: readonly string[];
  /** Colunas do arquivo que não casaram com nenhum campo: vão para `rawImport`. */
  readonly unmappedHeaders: readonly { index: number; header: string }[];
  readonly missingRequired: readonly ImportField[];
}

export function detectColumns(headers: readonly string[]): DetectionResult {
  const normalized = headers.map((header) => normalizeHeader(header ?? ''));
  const mapping: ColumnMapping = {};
  const used = new Set<number>();

  for (const spec of IMPORT_FIELD_SPECS) {
    // Os aliases são testados na ordem declarada, e só por igualdade exata.
    // A ordem importa: "Descrição das Atividades Secundarias" (só descrições)
    // tem de ganhar de "Atividades Secundarias" (código + descrição juntos).
    // Igualdade exata evita que "Numero" case com "Numero da Filial".
    for (const alias of spec.aliases) {
      const index = normalized.findIndex(
        (value, position) => !used.has(position) && value === alias,
      );
      if (index !== -1) {
        mapping[spec.field] = index;
        used.add(index);
        break;
      }
    }
  }

  const unmappedHeaders = headers
    .map((header, index) => ({ index, header }))
    .filter((entry) => !used.has(entry.index) && entry.header.trim().length > 0);

  const missingRequired = IMPORT_FIELD_SPECS.filter(
    (spec) => spec.required && mapping[spec.field] === undefined,
  ).map((spec) => spec.field);

  return { mapping, headers, unmappedHeaders, missingRequired };
}

export function fieldLabel(field: ImportField): string {
  return IMPORT_FIELD_SPECS.find((spec) => spec.field === field)?.label ?? field;
}
