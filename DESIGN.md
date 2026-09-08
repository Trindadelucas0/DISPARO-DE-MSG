# Design

Fonte visual do projeto. A fonte de **comportamento** é `DOCUMENTACAO-SISTEMA.md`.
Versão alinhada: 0.12.0 — Identidade.
A versão executável destas decisões vive em `src/app/globals.css` e `tailwind.config.ts`.
A versão fiscalizável vive em `.cursor/rules/ux-ui-crm.mdc`.

## Modo

`Operate`. O usuário completa uma tarefa. Escaneabilidade, consistência e velocidade de teclado
superam expressão. A marca aparece na precisão do detalhe, não em ornamento.

Referências de qualidade: **Twenty** para IA de tabela/filtro (identidade na 1ª coluna, chips
`Campo: valor`, Cmd+K que acha registro); **Linear/Height** para densidade e teclado. Não se
copia Inter, beige Notion, código AGPL nem GraphQL.

## Direção visual

Painel de operação de vendas em neutro frio quase-preto, com um único acento azul. A superfície é
plana: a hierarquia vem de borda hairline, peso de texto e cor de texto — não de sombra, não de
gradiente, não de cartão empilhado. Dado técnico em monoespaçado alinhado, para que 3.306 linhas
possam ser comparadas com o olho descendo a coluna.

Anti-referências, explícitas: dashboard de SaaS com gradiente violeta; cartão flutuante com
`backdrop-blur`; hero dentro do produto; bege de IA; `Inter` como fonte de tudo.

## Tipografia

| Token | Tamanho | Line-height | Uso |
| --- | --- | --- | --- |
| `text-2xs` | 11px | 14px | rótulo de cabeçalho de tabela (maiúsculas, `tracking-wide`), metadado |
| `text-xs` | 12px | 16px | legenda, texto auxiliar, badge |
| `text-sm` | 13px | 18px | **corpo de tabela**, corpo de formulário, padrão do sistema |
| `text-base` | 14px | 20px | texto de leitura, descrição de campo |
| `text-lg` | 16px | 22px | título de seção, valor de KPI secundário |
| `text-xl` | 20px | 26px | título de página, valor de KPI principal |

Escala fechada: nenhum outro tamanho existe no sistema. Sem `text-2xl` e acima.

- `Geist Sans` (`font-sans`) na interface.
- `Geist Mono` (`font-mono`) em dado técnico, sempre combinado com `tabular-nums` — a classe do
  projeto é `.numeric`.
- Pesos usados: 400 (corpo), 500 (rótulo, cabeçalho de tabela), 600 (título, valor de KPI). Sem 700+.
- `text-balance` em `h1`–`h3`. `text-pretty` em parágrafo corrido.

## Cor

Todos os tokens em OKLCH. Matiz neutra 262 (frio). Acento único em 263 (`#2563EB`).
Dado de tabela (CNPJ, cidade, responsável, próxima ação) usa `foreground`, não `muted-foreground`.
Muted só em rótulo (`col-label`), placeholder e metadado inativo. Nunca `#94A3B8` em texto essencial.

### Neutros

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `background` | `oklch(0.984 0.003 262)` | `oklch(0.165 0.012 262)` | fundo da aplicação (`#F8FAFC`) |
| `foreground` | `oklch(0.208 0.040 262)` | `oklch(0.955 0.004 262)` | texto primário e dado de tabela (`#0F172A`) |
| `card` | `oklch(1 0 0)` | `oklch(0.198 0.012 262)` | superfície elevada (um nível só) |
| `popover` | `oklch(1 0 0)` | `oklch(0.222 0.013 262)` | camada flutuante |
| `muted` | `oklch(0.968 0.004 262)` | `oklch(0.232 0.012 262)` | fundo de cabeçalho de tabela |
| `muted-foreground` | `oklch(0.420 0.018 262)` | `oklch(0.780 0.014 262)` | rótulo e placeholder (AA ≥ 4.5:1) |
| `border` | `oklch(0.900 0.005 262)` | `oklch(0.300 0.010 262)` | hairline 1px, separador principal |
| `input` | `oklch(0.880 0.007 262)` | `oklch(0.320 0.011 262)` | borda de campo |

### Acento único

`primary` / `--accent-brand` = `oklch(0.546 0.215 263)` (claro) / `oklch(0.640 0.170 263)` (escuro).
Aplicado em: ação primária, foco (`ring`), link, indicador 2px da nav ativa.
Em nenhum outro lugar — barras de Relatórios (UF/responsável/timeline) usam `--chart-ink`.

`destructive` = `oklch(0.545 0.205 27)` / `oklch(0.628 0.192 25)`. Só ação destrutiva e erro.
`success` / `warning` = alerta de KPI (follow-up atrasado), não reutilizam cor de funil.

### Cores de funil (reservadas)

Uma cor por status de funil, nada mais. Cada uma tem `--status-<x>-fg` (texto/ícone, AA ≥ 4.5:1) e
`--status-<x>-bg` (fundo tênue do badge). Todo badge carrega o rótulo em português; a cor
é redundância, nunca o único sinal. Resultado da interação usa tokens `--result-*` — paleta própria.

| Status | Rótulo | Intenção hex | Matiz OKLCH | Forma do badge |
| --- | --- | --- | --- | --- |
| `NEW` | Novo | `#64748B` | slate 257 | contorno |
| `READY_TO_CONTACT` | Pronto para contato | `#2563EB` | azul 263 | contorno |
| `CONTACTED` | Contatado | `#F59E0B` | âmbar 70 | contorno |
| `QUALIFIED` | Qualificado | `#059669` | verde 163 | contorno |
| `NEGOTIATION` | Negociação | `#8B5CF6` | violeta 293 | contorno |
| `CUSTOMER` | Cliente | `#16A34A` | verde 149 | **preenchido** — único status sólido |
| `LOST` | Perdido | `#DC2626` | vermelho 27 | contorno |

`CUSTOMER` é o único badge preenchido porque é o único estado terminal de ganho.

Resultados: `OPENED` (Ação iniciada) = acento, contorno; `SENT` = azul da primária; Respondeu `#10B981`;
Sem resposta e Sem interesse = slate; Pediu retorno = âmbar; Número inválido `#EF4444`; Outro = slate.

Nav ativa: fundo `muted`, texto `foreground`, barra 2px `primary` à esquerda. Sem wash azul no item.

StatusBadge: `h-6` + `text-xs` + ponto. ResultBadge: mesmo tamanho, paleta `--result-*`.

### Identidade de registro (`--identity-0` … `--identity-5`)

Avatar de iniciais (razão social / nome). Matiz estável por hash de CNPJ ou id. Croma baixo.
**Não** reutiliza `--status-*` nem `--result-*`. Texto do avatar: `--identity-fg`.
Componente: `src/components/ui/record-avatar.tsx`.

FilterBar = busca + **Filtro** + **Ordenar** + **Opções**; filtros ativos viram chips
`Campo: valor` (querystring inalterada). Primitivas: `filter-chips.tsx`, `property-row.tsx`.

Funil do dashboard: barras HTML (`src/components/ui/funnel-bars.tsx`), uma por status, clicáveis.
Relatórios continuam com Recharts e `--chart-ink` nas séries que não são funil.

Drawer (Sheet): `w-[28rem]`, lado direito, overlay. Esc e clique fora fecham.

## Forma e densidade

- Raio único: `--radius: 6px` (`rounded-md`). Aninhado usa `rounded-sm` (4px).
- Grade de 4px. Padding de tela operacional: `px-4 py-3`. Nunca `max-w-*` centralizado.
- Linha de dados: `h-8` (32px). Cabeçalho de tabela: `h-9` (36px).
- Borda hairline 1px é o separador. Sombra apenas em `dialog`, `dropdown`, `popover`, `command`,
  `tooltip`, `sheet` — token `--shadow-overlay`.
- Sidebar fixa de 224px (`w-56`), colapsável para 48px em ícones.
- Um nível de superfície elevada. Card dentro de card é proibido.

## Movimento

`--motion-fast: 100ms` (hover, foco), `--motion: 150ms` (entrada/saída de camada, mudança de status).
Curva única `cubic-bezier(0.16, 1, 0.3, 1)`. Press = `scale(0.98)`.

Nada além disso. Sem stagger, sem pulso, sem animação de entrada de página.

## Estados obrigatórios

Todo componente de dados entrega os quatro, via `src/components/ui/data-state.tsx`:

- **Carregando**: skeleton com a geometria real — linhas `h-8`, larguras de coluna idênticas às finais.
- **Vazio**: frase + ação que resolve (ex.: "Nenhum lead importado ainda." + botão *Importar planilha*).
- **Erro**: causa legível + *Tentar novamente*.
- **Sem permissão**: o motivo ("Você só vê leads atribuídos a você").

## Ícones

`lucide-react`, exclusivamente. Tamanho `16px` em linha de texto, `14px` dentro de badge, `18px` na
navegação. Traço 1.5. Ícone nunca substitui rótulo em ação destrutiva ou em item de navegação expandido.

## Teclado

`Cmd/Ctrl+K` paleta · `/` busca · `j`/`k` linhas · `Enter` abre · `e` edita · `w` WhatsApp · `Esc` fecha.
Foco visível em todo alvo interativo: `focus-visible:ring-1 ring-ring`.
