# Como usar o sistema — CRM de Prospecção

Manual para passar ao time. Linguagem do dia a dia. Nomes de botão e menu são os que
aparecem na tela.

Regra de negócio, campo e código: [`DOCUMENTACAO-SISTEMA.md`](../DOCUMENTACAO-SISTEMA.md).
Subir o sistema numa VPS: [`README.md`](../README.md) na raiz do repositório.

Endereço típico em produção: o domínio HTTPS configurado em `AUTH_URL`. Em desenvolvimento
local: **http://localhost:3001**. Depois do login o sistema abre em **Leads** (admin/gestor)
ou **Kanban** (vendedor).

---

## 1. O que é e o que não é

Ferramenta de **prospecção outbound**. O time importa uma planilha de empresas (CNPJ da
Receita), filtra quem vale contato, registra o que aconteceu e agenda o retorno.

- Com WhatsApp **conectado**, o botão **Enviar** no lead manda pela conta (aparece na Inbox).
  Sem sessão, o sistema **abre wa.me** e você marca enviado depois.
- **Campanhas** (Gestor/Admin) disparam pela fila Redis + gateway (**WhatsApp Web**, Chatwoot ou Simulado). Sem Redis a campanha **não inicia**.
- Em **WhatsApp**, conta **WhatsApp Web (QR)** → **Conectar** → aparece o **QR Code** para escanear no celular. Precisa de `docker compose up -d` (Redis + worker). Sem chave de API.
- **Inbox:** o vendedor só vê conversas **atribuídas a ele** e **não vê o telefone**.
  Só responde e move o funil. Admin/Gestor vê números, transfere e a fila sem dono.
- Número que responde e **não está na base** aparece na Inbox sem empresa. Use **Salvar contato** à direita (nome + WhatsApp; CNPJ se tiver).
- Em **Leads**, **Adicionar contato** cria o mesmo tipo de registro (nome + WhatsApp, CNPJ opcional). Planilha da Receita continua em **Importar**.
- Cadastro de **pessoa** (vendedor, gestor, administrador) é só em **Configurações**, e só
  o Administrador faz isso.
- Não há e-mail nem push de follow-up atrasado: o atraso aparece em **Contatos** e
  **Follow-ups**.

Sessão dura **8 horas** (um turno). Depois, entre de novo.

---

## 2. Mapa do menu (o que existe hoje)

Menu à esquerda, nesta ordem e com estes nomes:

| Grupo | Menu | Rota | Quem vê |
| --- | --- | --- | --- |
| Operação | **Leads** | `/leads` | Administrador e Gestor |
| Operação | **Contatos** | `/contacts/today` | Administrador e Gestor |
| Operação | **Campanhas** | `/campaigns` | Administrador e Gestor |
| Operação | **Inbox** | `/inbox` | todos |
| Operação | **Kanban** | `/kanban` | todos (admin/gestor: base inteira no mesmo quadro; vendedor: só o dele) |
| Operação | **Follow-ups** | `/follow-ups` | Administrador e Gestor |
| Visão | **Dashboard** | `/dashboard` | Administrador e Gestor |
| Visão | **Relatórios** | `/reports` | Administrador e Gestor |
| Visão | **Mensagens** | `/messages` | Administrador e Gestor |
| Sistema | **WhatsApp** | `/whatsapp` | Administrador e Gestor |
| Sistema | **Importar** | `/import` | Administrador e Gestor |
| Sistema | **Supervisão** | `/admin/atendimento` | Administrador e Gestor |
| Sistema | **Configurações** | `/settings` | Administrador e Gestor |

Na barra de cima: nome do workspace, busca **Buscar empresa, tela ou status…**
(**Ctrl+K** / **Cmd+K**), tema claro/escuro, iniciais da conta → **Sair**.

### Campanhas (Gestor / Admin)

Antes: em **WhatsApp**, conta **WhatsApp Web (QR)** precisa estar **Conectada** (escanear o QR).
Conta **Manual (wa.me)** não dispara campanha.

1. Menu **Campanhas** → nome → **Nova campanha**.
2. No público: cadastre o número (**Incluir na campanha**) ou busque pelo WhatsApp / nome.
   Marque as linhas e clique **Usar só os selecionados** — senão o disparo usa o filtro inteiro
   (a planilha da Receita). **Só cadastro manual** recorta origem `MANUAL`.
3. Em **Leads**: marque os contatos na tabela → **Disparar campanha** (Gestor/Admin). Abre o
   rascunho já com esses ids.
4. Quantidade (vazio = todos com WhatsApp) → template da primeira mensagem → **template de
   retorno** (outro texto, padrão **Follow-up — sem resposta**) e esperar **2 horas** →
   distribuição das respostas → conta WhatsApp conectada.
5. **Salvar rascunho** ou **Iniciar campanha**. Sem Redis a API recusa. O worker sobe no
   Docker (`docker compose up -d`). O disparo sai no ritmo de **5 contatos por minuto** (1 a cada 12 s).
   Cem contatos levam cerca de 20 minutos. Inbox e o Enviar no lead não entram nesse teto.
   Se o selo já estiver **Em envio** e nada sair, **Retomar** reenfileira os pendentes.
6. Acompanhe métricas (**Já nesta campanha**, **Enviados**, **Ainda no público**) e
   **Destinatários** (filtro de status para ver os já contatados). Respostas aparecem na **Inbox**.
7. **Próximo lote:** **Adicionar mais** 100 (ou o número que quiser). O sistema pega os
   próximos do mesmo público que **ainda não** estão nesta campanha.
8. **Retorno:** sai **sozinho** 2 horas depois da primeira mensagem, se a pessoa não respondeu.
   Pausar ou cancelar para parar. **Disparar retorno agora** só pega quem já passou o
   intervalo e o job automático ainda não rodou. Quem já ganhou o retorno não recebe de novo.

### Inbox (todos)

1. Menu **Inbox**. Lista à esquerda, mensagens no meio, lead à direita.
2. Se o número não está na base: à direita, **Nome** + WhatsApp (já preenchido) + CNPJ opcional → **Salvar contato**. O sistema grava o mesmo número em Telefone e em WhatsApp, para a campanha enxergar o contato.
3. **Assumir** / **Transferir** / **Resolver**. Teclado: `j`/`k`, `r`, `a`, `t`, `c`.
4. Responder: texto e/ou **foto**, **vídeo** ou **áudio** (ícone do microfone grava; clique de novo para parar). Enviar vale só com texto ou só com arquivo.
5. O selo da conversa (Em atendimento / Aguardando / Resolvida) **não** é o funil. À direita,
   **Funil** muda o Kanban na hora (Novo, Contatado, Qualificado…). Disparo e Enviar passam
   Novo/Pronto para **Contatado** sozinhos; Qualificado e Perdido você escolhe.
6. Vendedor: só conversas **dele**, **sem o número**. Responde e altera o **Funil**. Transferir e
   Salvar contato são do gestor.

### Supervisão (Gestor / Admin)

1. Menu **Supervisão**. Os quatro totais são de **todas** as conversas.
2. A tabela lista quem pode atender: administrador, gestor e vendedor. Quem **Assumir** na
   Inbox aparece na linha, mesmo sendo administrador.
3. Clique no nome para ver as conversas daquela pessoa. Sem usuários cadastrados, use
   **Configurações** para criar vendedores.

### WhatsApp — conectar com QR (Admin)

Não precisa digitar o número. Evolution **não** é o caminho: o QR sai do próprio CRM.

1. Menu **WhatsApp**.
2. Um nome (ex. LUCAS) → **Adicionar conta**. Só existe WhatsApp Web. Telefone é opcional;
   o scan liga o aparelho.
3. Na pasta CRM: `docker compose up -d` (Redis **e** o worker do WhatsApp). Em outro
   terminal: `npm run dev`. Não rode `npm run worker` na máquina — o container `crm-worker`
   já faz isso. Se você parar o site, o QR some da tela; o worker no Docker continua.
4. **Conectar** (ou **Novo QR**) → a tela mostra o QR. No celular: WhatsApp → Aparelhos
   conectados → escanear.
5. Depois do scan a tela pode mostrar **Pareamento ok. Reiniciando sessão…** por uns segundos
   (o WhatsApp pede restart; não precisa escanear de novo). Status vira **Conectada**.
   O container `crm-worker` fica no ar sozinho (`restart: unless-stopped`). **Só um** worker:
   não ligue `npm run worker` no terminal ao mesmo tempo.
   Só mensagens **novas** depois da conexão entram na Inbox. **Desconectar** encerra a sessão
   e apaga o QR. Queda curta da rede aparece como **Conectando** e volta sozinha; **Desconectada**
   só depois de Desconectar ou se o celular desparear o aparelho. A lista atualiza sozinha a
   cada poucos segundos.
6. Com a sessão **Conectada**, Administrador ou Gestor clica **Importar contatos** e confirma o
   nome da conta. O sistema grava **todos** os números vinculados a essa conta WhatsApp (agenda
   salva no WhatsApp + conversas 1:1) como leads. **Não envia mensagem.** Quem já está na base —
   inclusive importado pela **planilha** — não duplica; o telefone é o que casa. Conferir em
   **Leads**. Pode levar até um minuto. Depois de atualizar o código do worker:
   `docker compose up -d --build worker`.
   Grupos não entram. Número da agenda do celular **sem WhatsApp** não entra.
7. Outro número = outra conta **WhatsApp Web (QR)** e outro QR. O mesmo celular não fica em
   dois lugares: se já estiver no Chamado, o scan aqui derruba o outro.
8. Contas antigas (Manual, Simulado, Chatwoot) não aparecem nesta tela e não enviam pelo
   botão **Enviar** do lead. Sem WhatsApp Web **Conectada**, o lead ainda pode abrir wa.me.
   Na tabela a sessão aparece como **Só Leads**. Sem outra conta conectada, o lead não envia.

---

## 3. Os três perfis

| Perfil na tela | Quem é | Enxerga | Cadastra gente | Importa planilha | Troca responsável |
| --- | --- | --- | --- | --- | --- |
| **Administrador** | dono / TI | toda a base | sim | sim | sim |
| **Gestor** | supervisor | toda a base (hoje igual ao Administrador; ainda não existe “equipe”) | não | sim | sim |
| **Vendedor** | funcionário | só Kanban e Inbox dos leads **dele** (não vê cards de outros); sem telefone | não | não (o menu some) | não |

“Funcionário” neste manual = perfil **Vendedor**.

---

## 4. Dois conceitos (leia antes de clicar)

São coisas diferentes. A tela usa selos diferentes para cada um.

### Funil (7 status)

Novo → Pronto para contato → Contatado → Qualificado → Negociação → Cliente **ou** Perdido.

| Na tela | Significado curto |
| --- | --- |
| Novo | Importado, ainda não triado |
| Pronto para contato | Triado, com canal válido |
| Contatado | Mensagem ou ligação enviada |
| Qualificado | Perfil e interesse confirmados |
| Negociação | Proposta em discussão |
| Cliente | Fechou (terminal) |
| Perdido | Encerrou sem fechamento (terminal) |

Muda no **Kanban** (arrastar), no painel do lead (**Alterar status**), na página **Editar**,
na barra de lote (**Mudar status para…**) ou no **Funil** à direita da Inbox.

### Resultado do contato (8 resultados)

| Na tela | Quando usar |
| --- | --- |
| Ação iniciada | Sem sessão: o sistema grava ao clicar **Abrir WhatsApp** |
| Mensagem enviada | Conta conectada: o sistema grava ao clicar **Enviar**. Sem sessão: você clicou **Marcar enviado** |
| Respondeu | Empresa respondeu |
| Sem resposta | Não respondeu |
| Pediu retorno | Pediu para ligar/escrever de novo |
| Sem interesse | Recusou |
| Número inválido | Celular errado / inexistente |
| Outro | Caso que não cabe nos demais |

**Exemplo:** empresa em **Novo**. Você marca **Respondeu**. O funil **não** vira Qualificado.
Qualificado, Cliente e Perdido o vendedor move à mão (Kanban ou **Alterar status**).

Se o funil ainda está em Novo ou Pronto para contato, os resultados **Mensagem enviada**,
**Sem resposta** e **Pediu retorno** sugerem **Contatado**. Os outros resultados não
andam o funil sozinhos.

**Sem resposta** cria retorno em +2 dias (se você não informar data). **Pediu retorno**
cria em +1 dia. Cliente ou Perdido cancelam os retornos pendentes.

---

## 5. O que já vem no sistema (seed)

Depois de `npm run db:seed`, a base já tem usuário admin, tags e três textos de mensagem.
Os templates são **rascunho operacional** — o time de vendas deve reescrever antes do
primeiro disparo real.

### Tags prontas

`HOT` · `URGENTE` · `VIP` · `INTERESSE` · `REVENDA` · `INDÚSTRIA` · `PRIORIDADE`

Use em lote na lista de Leads: marque linhas → **Aplicar tag…** → escolha, por exemplo, `HOT`.

### Templates prontos

| Nome na tela | Canal | Variáveis usadas |
| --- | --- | --- |
| **Primeiro contato — WhatsApp** | WhatsApp | `{{razaoSocial}}`, `{{cidade}}`, `{{estado}}`, `{{vendedor}}` |
| **Follow-up — sem resposta** | WhatsApp | `{{nomeFantasia}}` |
| **Apresentação — e-mail** | E-mail | `{{razaoSocial}}`, `{{cidade}}`, `{{estado}}`, `{{vendedor}}` (+ assunto com razão social) |

Variáveis que o sistema preenche em qualquer template:

`{{razaoSocial}}` · `{{nomeFantasia}}` · `{{cidade}}` · `{{estado}}` · `{{cnpj}}` ·
`{{telefone}}` · `{{whatsapp}}` · `{{email}}` · `{{vendedor}}` (`vendedor` = nome de quem
está logado).

**Preview ilustrativo** (não é dado real de cliente). Template **Primeiro contato — WhatsApp**,
com empresa fictícia “Estruturas Exemplo Ltda”, cidade Goiânia, UF GO, vendedor Ana:

```text
Olá! Falo com o responsável da Estruturas Exemplo Ltda?

Sou Ana e trabalho com locação de estrutura para eventos.
Vi que vocês atuam em Goiânia/GO no mesmo segmento e queria entender
se hoje vocês terceirizam palco e cobertura em alguma demanda.

Se fizer sentido, te mando a tabela. Posso?
```

---

## 6. Exemplos com o que já existe

Copie estes fluxos no ambiente local. Nomes de botão e menu são os da tela.

### Exemplo A — Primeiro contato WhatsApp

1. Entre e vá em **Contatos** (ou **Leads** e abra uma empresa com celular).
2. Clique no ícone **WhatsApp** da linha (ou no painel: **Template** + **Enviar** / **Abrir WhatsApp**).
3. Em **Template**, escolha **Primeiro contato — WhatsApp**.
4. Confira a **Mensagem** (pode editar antes de enviar).
5. Se houver conta conectada, clique **Enviar** — a mensagem sai pela sessão e o CRM grava
   **Mensagem enviada**. A conversa aparece na **Inbox**.
6. Sem sessão, o botão é **Abrir WhatsApp**: o CRM grava **Ação iniciada**, abre o WhatsApp Web;
   envie lá e volte em **Marcar enviado**.
7. Se ainda não houve resposta, em **O que aconteceu** escolha depois **Sem resposta**,
   **Respondeu**, etc.

### Exemplo B — Sem resposta e retorno

1. Depois do envio na Inbox, no painel do lead use **Registrar contato** e escolha **Sem resposta**.
2. Se não informar data, o sistema agenda retorno em **+2 dias**.
3. Ou use os chips **+1 dia**, **+3 dias**, **+7 dias**.
4. No dia seguinte, a empresa aparece em **Contatos** (aba **Atrasado** ou **Hoje**) e em
   **Follow-ups**.
5. No retorno, use o template **Follow-up — sem resposta**.

### Exemplo C — Filtrar a lista de Leads

1. Menu **Leads**.
2. Clique **Filtro** → Status = **Novo**, UF = **SP**.
3. Aparecem chips no formato **Campo: valor** (ex.: `Status: Novo`, `UF: SP`).
4. O X no chip tira só aquele recorte. **Limpar** zera tudo.
5. A barra de endereços guarda o filtro: copie o link ou use F5 / voltar do navegador.

Lista padrão: só empresas **ATIVA** na Receita. Se “sumiu” gente: faixa **Mostrar todas**
ou **Opções → Situação cadastral na Receita → Todas as situações**.

### Exemplo D — Ação em lote (atribuir + tag)

1. Em **Leads**, filtre como no exemplo C (ex.: UF SP + Status Novo).
2. Marque caixas à esquerda ou tecla **x** na linha focada.
3. Na barra inferior (“N selecionados”):
   - **Atribuir a…** → escolha o vendedor (só Admin/Gestor)
   - **Aplicar tag…** → `HOT` ou `PRIORIDADE`
   - **Mudar status para…** → Pronto para contato (se já triou)
4. Máximo **500** por vez. Trocar de página ou de filtro **limpa** a seleção.

### Exemplo E — Kanban (funil à mão)

1. Menu **Kanban**. Sete colunas = os 7 status do funil.
2. **Administrador / Gestor:** o quadro mostra **todos** os leads (os seus e os dos vendedores).
   No card aparece **Você**, o nome do responsável ou Sem responsável. Arraste qualquer card.
   Duplo clique abre o painel.
3. **Vendedor:** só os cards atribuídos a você. Não vê os dos outros. Não abre ficha.
4. Arraste um card de **Novo** para **Contatado** — o status muda na hora.
5. Quando a empresa responder e tiver perfil, arraste para **Qualificado** (o resultado
   **Respondeu** sozinho **não** faz isso).
6. **Compacto** / **Encerrados** alteram a vista (não são o botão azul de ação).

---

## 7. Entrar, sair e a barra de cima (todos os perfis)

1. Abra o endereço do sistema.
2. Preencha **E-mail** e **Senha**.
3. Clique **Entrar**.
4. Depois do login o sistema abre em **Leads**.

A mesma mensagem de erro vale para senha errada, conta inexistente ou conta inativa. O
sistema não confirma se o e-mail existe. Depois de **8 tentativas no mesmo e-mail em 5
minutos**, o login trava temporariamente.

**Sair:** iniciais no canto superior direito → **Sair**.

Paleta (**Ctrl+K** / **Cmd+K**): buscar empresa da base (Enter abre o registro), ir para
outra tela, filtrar por status, trocar tema.

Não existe “esqueci minha senha” na tela. Troca de senha é operação interna.

---

## 8. Tutorial do Administrador

Ordem sugerida na primeira semana: criar o time → importar a planilha → atribuir
responsáveis → conferir os textos de WhatsApp → acompanhar.

### 8.1 Onde cadastra gente

Menu **Configurações**.

No topo: **Sua conta** e **Atalhos de teclado**. O bloco **Usuários** só aparece para
Administrador.

No rodapé do bloco **Usuários**:

1. **Nome**
2. **E-mail**
3. **Senha inicial** (mínimo 10 caracteres)
4. **Perfil** — Vendedor, Gestor ou Administrador
5. Clique **Criar usuário**

Na lista: seletor de perfil (salva na hora), **Desativar** / **Ativar**. Não dá para
rebaixar o **último** administrador.

### 8.2 Onde entram as empresas

Há dois caminhos:

1. **Adicionar contato** em **Leads** (ou **Salvar contato** na Inbox): nome, WhatsApp e CNPJ se
   você tiver. Sem CNPJ da Receita, a coluna CNPJ mostra um traço. Serve para quem falou no
   WhatsApp e ainda não está na planilha. Depois de **Salvar contato**, o painel do lead abre.
2. Menu **Importar**. Título: **Importar planilha** — base da Receita em lote.

#### Passo 1 de 4 — Arquivo

1. Arraste `.xlsx` ou `.xlsm` (até 25 MB) ou clique **Escolher arquivo**.
2. **Importar somente empresas ativas** vem ligada (só ATIVA na Receita).
3. Cabeçalho na **primeira linha**.

#### Passo 2 de 4 — Mapeamento

O sistema associa colunas pelo **nome** do cabeçalho. Exemplos que reconhece:

| Campo no CRM | Exemplos de cabeçalho |
| --- | --- |
| CNPJ (obrigatório) | CNPJ, CNPJ completo |
| Razão social (obrigatório) | Razão social, Nome empresarial, Empresa |
| Nome fantasia | Nome fantasia, Fantasia |
| Situação cadastral | Situação cadastral, Situação |
| Cidade | Município, Cidade |
| UF | UF, Estado |
| Telefones | Telefones, Telefone |
| E-mail | E-mail, Email |
| Porte | Porte da empresa, Porte |
| CNAE principal | Código da atividade principal, CNAE fiscal |

1. Confira cada seletor. **— não importar —** ignora o campo.
2. Sem CNPJ ou razão social, o avanço trava.
3. Clique **Ver prévia**.

#### Passo 3 de 4 — Prévia

**Nada foi gravado ainda.**

| Contador | Significado |
| --- | --- |
| Linhas no arquivo | Total lido |
| Vão entrar | Leads novos |
| Já existem (CNPJ) | Já na base; ignora |
| Fora por situação | Filtro de ativas |
| Duplicadas no arquivo | CNPJ repetido no arquivo |
| Rejeitadas | Validação (CNPJ inválido, etc.) |

Clique **Importar N lead(s)**. Se N for zero, o botão fica travado.

#### Passo 4 de 4 — Execução

Pode sair da tela; a importação continua. No fim: **Ver relatório** ou
**Importar outra planilha**. Tabela **Importações anteriores** com status: Na fila,
Rodando, Concluída, Falhou, Cancelada.

Reimportar a mesma planilha **não duplica** (chave = CNPJ).

### 8.3 Distribuir a fila

Menu **Leads** — mesmo fluxo do [Exemplo D](#exemplo-d--ação-em-lote-atribuir--tag).

### 8.4 Textos de WhatsApp / e-mail

Menu **Mensagens**.

1. **Novo template** (ou edite os três do seed).
2. **Nome**, **Canal**, **Assunto** (se e-mail), **Corpo** com `{{variáveis}}`.
3. Opcional: **Foto ou vídeo** (um arquivo). O texto vira legenda no WhatsApp.
4. Confira o **Preview** → **Salvar**.
5. Clique na linha para editar. **Excluir** pede o **nome** do texto na confirmação.

Campanha e o botão **Enviar** do lead mandam a mídia do template se a conta WhatsApp Web estiver
conectada. Sem sessão, template com foto/vídeo **não** abre wa.me — precisa conectar o QR.

O vendedor só lê e usa no envio.

### 8.5 Acompanhar

**Dashboard** — oito números clicáveis (Leads, Com WhatsApp, Para contato, Contatados,
Responderam, Qualificados, Clientes, Follow-ups atrasados), barras do funil, atividade de
hoje, próximas ações. Zero até alguém registrar interação (não é número inventado).

**Relatórios** — período (padrão últimos 30 dias): Interações, Enviados, Respostas, Taxa.
**Exportar CSV** / **Exportar XLSX** exportam a **base de leads**, não dependem de ter
interação.

---

## 9. Tutorial do Vendedor (funcionário)

### 9.1 Manhã

1. **E-mail**, **Senha**, **Entrar**.
2. O sistema abre no **Kanban**. O menu só tem **Inbox** e **Kanban**.
3. Só vê empresas **atribuídas a você**. No Kanban não aparecem cards de outro vendedor.
   Não vê o telefone nem conversa de outro vendedor.

### 9.2 Conversar

Menu **Inbox**. Lista à esquerda, mensagens no meio, funil à direita.

- `j` / `k` navegam. `r` foca a resposta. `c` resolve.
- Responda texto, foto, vídeo ou áudio. O número do lead **não aparece**.
- **Funil** à direita move o Kanban (Novo, Contatado, Qualificado…).

### 9.3 Funil

Menu **Kanban**. Só os seus leads, no mesmo tipo de quadro. Arraste o card para a coluna.
Não abre ficha do lead nem mostra telefone. Coluna vazia: “Nenhum lead seu em …”.

### 9.4 O que o vendedor não faz

- Não vê Leads, Contatos, Follow-ups, Dashboard, Relatórios, Mensagens, WhatsApp, Importar, Supervisão nem Configurações (endereço direto → volta ao Kanban).
- Não vê o telefone do lead.
- Não transfere conversa, não salva contato novo, não cria usuário, não troca responsável.

---

## 10. Tutorial do Gestor (só as diferenças)

Faça tudo da seção do Administrador, **exceto** cadastrar gente.

- Vê a base inteira, importa, atribui, edita template, exporta, vê relatórios.
- No **Kanban** vê os leads dele e os dos demais no **mesmo** quadro (rótulo **Você** / nome).
- Em **Configurações** o bloco **Usuários** não aparece.
- Ainda **não existe** recorte “minha equipe”.

---

## 11. Atalhos de teclado

Não disparam enquanto você digita num campo (exceto **Esc** e **Ctrl+K**).

| Tecla | O que faz |
| --- | --- |
| **Ctrl+K** ou **Cmd+K** | Paleta: busca empresa, telas, status, tema |
| **/** | Foca a busca da tela |
| **j** / **k** | Próxima / anterior linha |
| **Enter** | Abre o painel do lead |
| **e** | Abre a página completa já em edição |
| **x** | Marca a linha para ação em lote |
| **w** | Foca Próxima ação / WhatsApp no painel |
| **Esc** | Fecha o que estiver aberto por cima |

Lista completa também em **Configurações → Atalhos de teclado**.

---

## 12. Perguntas frequentes

**Como trago os contatos salvos no WhatsApp para o CRM?**
Menu **WhatsApp**, sessão **Conectada** → **Importar contatos** (Administrador ou Gestor).
Confirme o nome da conta. O sistema grava **todos** os números daquela conta WhatsApp
(agenda + conversas 1:1) como leads; **não envia mensagem**. Quem já veio da
planilha (mesmo telefone) não duplica. A planilha da Receita continua em **Importar**.
Pode levar até um minuto. Depois de atualizar o código: `docker compose up -d --build worker`.
Se a tela disser que o worker não respondeu, o container `crm-worker` não estava no ar
(`docker compose up -d` na pasta CRM). Não rode `npm run worker` junto com o container.
Se disser que não achou telefone brasileiro, reinicie o worker (`docker compose restart worker`),
espere a sessão **Conectada** e importe outra vez.

**Onde cadastro uma empresa à mão?**
Não cadastro. Menu **Importar** (Administrador ou Gestor) e a planilha `.xlsx`.

**Onde cadastro o vendedor?**
**Configurações → Usuários → Criar usuário**. Só Administrador.

**A lista de Leads está vazia e eu importei a planilha.**
O filtro padrão mostra só empresas ATIVAS. Clique **Mostrar todas** na faixa, ou
**Opções → Situação cadastral na Receita → Todas as situações**.

**A empresa entrou sem e-mail, mas a planilha tinha e-mail.**
O e-mail estava inválido e foi descartado. **Importar → Importações anteriores →
Relatório**. O motivo aparece como aviso. A empresa entrou.

**A empresa entrou sem telefone.**
DDD inválido (`00`, `01`, `10` e outros não atribuídos). Mesmo caminho do item
anterior.

**Apareceu “Sem permissão”.**
Importar, trocar responsável e editar template: Gestor ou Administrador. Criar
usuário: só Administrador.

**O WhatsApp abre o WhatsApp Web em vez de enviar.**
Não há conta **Conectada** em **WhatsApp**. Conecte o QR (`docker compose up -d`) e o botão
passa a **Enviar**. Sem sessão, o CRM abre wa.me e você marca enviado depois.

**A Inbox mostrou Enviada e o celular não recebeu.**
Reinicie o worker (`docker compose restart worker`) e envie de novo. O sistema confirma o número
no WhatsApp (DDI 55 e nono dígito). Se o número não existir, a bolha vai para **Falhou**.
Enviar para o **mesmo número** do celular pareado pode cair em “Mensagem para você mesmo”,
não como conversa de cliente.

**Registrei “Respondeu” e a empresa não foi para Qualificado.**
Correto. Resultado ≠ funil. Arraste no **Kanban** ou use **Alterar status**.

**Dashboard e Relatórios estão zerados.**
Só sobem depois de **Enviar** (conta conectada), **Marcar enviado**, resultado ou **Registrar contato**.

**A exportação em Relatórios baixou leads sem interações.**
A exportação da base **não** depende de ter contato. Os quatro números do relatório
dependem.

**O Redis não está ligado. Perco o trabalho?**
Não. Some o cache, o limite de tentativas de login e o aviso **entre abas** (campanha
andando, mensagem chegando). Na **mesma aba**, mudar o funil em Leads ainda atualiza
Kanban, Contatos e Dashboard. **Configurações → Infraestrutura** mostra “Redis conectado”
ou “Redis ausente”. Sem Redis, Inbox ao vivo e progresso de campanha não andam sozinhos:
reabra a tela.

**Como vejo o histórico de ligações e mensagens?**
Abra o lead. **Histórico de interações** no painel ou na página completa.

**Quais templates e tags já existem?**
Veja [seção 5](#5-o-que-já-vem-no-sistema-seed).

---

## Apêndice — ambiente (TI interno)

Esta seção **não** é para o time de vendas. Sem senhas reais.

Hospedagem na VPS (clone, Docker, systemd, Nginx, TLS, backup): siga o
[`README.md`](../README.md) na raiz. Não use os scripts PowerShell de keep-alive.

Comandos abaixo rodam na **raiz deste repositório**.

```bash
docker compose up -d          # Postgres + Redis + crm-worker
npx prisma migrate deploy
npm run db:seed
npm run build
sudo systemctl restart crm    # Next em 127.0.0.1:3001
```

Login: URL pública + `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Rodar o seed de novo
**não** sobrescreve uma senha já trocada.

### Importar pelo terminal

Usa o mesmo serviço da tela. Planilhas `.xlsx` não entram no git.

```bash
npm run import:xlsx                      # descobre os .xlsx do workspace, só empresas ativas
npm run import:xlsx -- --all-situacoes   # inclui BAIXADA, INAPTA, SUSPENSA e NULA
npm run import:xlsx -- caminho/a.xlsx    # arquivo específico
```

### Comandos úteis

```bash
npm run build               # build de produção
npm run start               # Next em 127.0.0.1:3001
npm run lint
npm run typecheck
npm run test
npm run design:check
npm run db:status
npm run db:studio
npm run db:seed
docker compose up -d
docker compose down         # NÃO use -v em produção (apaga o banco)
```
