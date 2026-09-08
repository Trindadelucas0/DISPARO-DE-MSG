# Product

<!-- impeccable:product-schema 1 -->

> Nota de procedência: este registro foi escrito a partir do plano aprovado
> (`crm_prospecção_leads_4f8a9320.plan.md`) e do briefing de execução, sem rodada de entrevista.
> Fatos marcados **[inferido]** ainda não foram confirmados pelo usuário e devem ser revisados.

## Platform

web

## Stack

Decidida no plano aprovado, não delegada: Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui +
TanStack Query + Zustand + React Hook Form + Zod, sobre Prisma + PostgreSQL + Redis. Monólito modular.
Auth.js v5 com Credentials + `bcryptjs`. `exceljs` para planilha (lê `inlineStr`; o pacote `xlsx` do npm
está descartado por CVE de prototype pollution na versão publicada no registry).

## Users

Usuário primário: **vendedor de prospecção ativa (outbound)**, trabalhando em volume. Abre o sistema no
começo do turno e permanece nele. A tarefa dele é percorrer uma fila de empresas, decidir a quem falar
agora, disparar contato (WhatsApp, telefone ou e-mail), registrar o resultado e agendar o retorno.

Lê rápido, compara linhas, não lê parágrafo. Trabalha em monitor de desktop, com as duas mãos no teclado.

Papéis do sistema: `USER` (vê só os leads do próprio `responsavelId`), `MANAGER` (vê a equipe),
`ADMIN` (vê tudo e administra usuários, templates e importações).

## Product Purpose

Transformar duas planilhas de cadastro de empresas em uma operação de prospecção rastreável: quem foi
contatado, por qual canal, com que resultado, e qual é o próximo passo com data.

Sucesso é o vendedor terminar o dia sem lead esquecido: nenhuma empresa contatada sem resultado registrado
e nenhum follow-up vencido invisível.

## Positioning

O sistema é orientado a **interação e follow-up**, não a cadastro. A base de empresas é insumo, não produto:
o valor está no histórico de contato e na fila priorizada do dia (`atrasado → hoje → lead novo → futuro`).

Um CRM genérico trataria os 3.306 registros como lista. Aqui a lista é apenas a porta de entrada do funil
de 7 status de funil (resultado da interação é um campo separado), e cada mudança de funil é auditada.

## Operating Context

- Fonte de dados atual: duas planilhas XLSX exportadas de consulta de CNPJ (DF/GO e SP), 39 colunas,
  aba `empresas`, cabeçalho na linha 1, células em `inlineStr`.
- Canal principal de contato é WhatsApp Web via `wa.me` — o vendedor já trabalha com o WhatsApp aberto
  ao lado. Telefone fixo e e-mail são canais de primeira classe, não fallback.
- O trabalho acontece em rajadas: o vendedor abre a fila do dia, percorre, e volta ao Kanban para ver o
  funil. Trocas de contexto são frequentes, então estado de filtro e posição na lista precisam sobreviver
  à navegação.

## Capabilities and Constraints

Confirmado:

- 3.306 empresas na base inicial: 1.839 SP, 974 GO, 493 DF. Zero CNPJ duplicado hoje.
- 2.610 ATIVA, 473 BAIXADA, 216 INAPTA, 5 SUSPENSA, 2 NULA.
- 2.033 leads têm celular (WhatsApp viável); 1.273 só têm fixo; 2.986 têm e-mail.
- Todos os leads têm o **mesmo** CNAE principal (aluguel de palcos e coberturas). O filtro "Segmento"
  nasce com um único valor útil.
- `Telefones` vem como string separada por vírgula no formato `DDD-numero`, com 1 ou 2 telefones por lead.
- Porte assume três valores: Micro Empresa, Empresa de Pequeno Porte, Demais.
- 7 status de funil, 5 tipos de interação, 7 resultados de contato, 4 estados de follow-up — todos
  fechados em enum no Prisma e espelhados em `src/constants/` com rótulo, cor e ordem.

Restrições técnicas:

- O PostgreSQL deste deploy é o container `crm-postgres` (Compose), publicado em `127.0.0.1:5432`,
  banco `crm_prospeccao`.
- O Redis sobe em `127.0.0.1:6379` como `crm-redis`. Não exponha 5432/6379/3001 na internet.
- O job de importação roda no processo do Next. Se o servidor reiniciar no meio, o job é retomado pelo
  offset gravado em `ImportJob`.

Explicitamente indecidido:

- Origem futura de leads além das planilhas (integração de API de CNPJ, formulário público). Não presumir.
- Critério de pontuação do lead: o campo `score Int @default(0)` existe, a fórmula não. **[inferido]** que
  a fórmula virá em fase posterior.
- Estrutura de equipe do `MANAGER`: hoje a visibilidade de equipe é implementada como "todos os leads",
  porque não existe entidade de time. **[inferido]** e sinalizado como risco.

## Brand Commitments

Restrição binding declarada pelo usuário: **a interface não pode parecer feita por IA**. Isso está
codificado como regra versionada em `.cursor/rules/ux-ui-crm.mdc`, com lista negra nominal.

Referência de qualidade explícita: Linear e Height. Não há logo, nome comercial ou paleta de marca
herdada — o produto é interno.

## Evidence on Hand

- `paulo-df-go-ee001d9d-3042-4b9f-b856-8bbf304ce47b (1)/*.xlsx` — 1.467 empresas de DF e GO.
- `paulo-sp-1cf4f177-00cd-4639-ab3e-caba522b2cb1 (1)/*.xlsx` — 1.839 empresas de SP.

Não existe: histórico de contato anterior, taxa de conversão conhecida, texto de mensagem validado em
campo, depoimento de cliente, benchmark de mercado. Os três templates do seed são rascunhos operacionais
plausíveis, **não** copy validada — estão marcados como tal e devem ser reescritos pelo time de vendas.

## Product Principles

1. **Nada desaparece em silêncio.** Lead filtrado, linha rejeitada na importação e duplicado sempre
   aparecem com contagem e motivo. Filtro padrão esconde, nunca apaga.
2. **O próximo passo é sempre visível.** Todo lead em andamento tem status e, quando aplicável, data de
   próximo contato. Lead sem próximo passo é um defeito de operação que a interface precisa denunciar.
3. **Densidade acima de conforto visual.** O vendedor compara linhas. Tabela densa, monoespaçado em dado
   técnico, largura inteira do monitor.
4. **O servidor é a autoridade.** Permissão, filtro e regra de negócio são resolvidos no servidor. O
   cliente nunca é fonte de verdade sobre o que o usuário pode ver.
5. **Interface honesta.** Funcionalidade que não existe aparece marcada como não implementada, com a fase
   em que chega. Nunca um botão que finge.

## Accessibility & Inclusion

Contraste AA verificado nos dois temas (4.5:1 texto, 3:1 elemento gráfico). Operação completa por teclado
é requisito funcional, não cortesia: o usuário primário trabalha com as mãos no teclado o dia inteiro.
Cor nunca é o único portador de significado — todo status tem rótulo textual.
