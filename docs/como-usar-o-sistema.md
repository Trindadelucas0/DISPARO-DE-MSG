# Como usar o CRM de Prospecção

Este é o **tutorial do cliente**. Linguagem do dia a dia. Um passo = um clique.

Nomes de botão, menu, campo e texto cinza dos campos são **iguais aos da tela**.

Regras completas (para quem mantém o sistema): `[DOCUMENTACAO-SISTEMA.md](../DOCUMENTACAO-SISTEMA.md)`.

A parte técnica no **final** deste arquivo é só para TI. **Não entregue o apêndice ao time de vendas.**

---

## 1. Capa para o cliente

### O que é

Uma tela de trabalho para **procurar empresas e falar com elas**.

CRM e disparo de WhatsApp são **a mesma ferramenta**: lista (Leads), lote (Campanhas), respostas
(Inbox). Não existe um sistema separado de disparo.

Você entra, vê a lista (ou o quadro), manda WhatsApp, anota o que aconteceu e marca o próximo contato.

### O que não é

Não é site da empresa. Não é e-mail. Não avisa sozinho no celular quando um retorno atrasa.

O atraso aparece nas telas **Contatos** e **Follow-ups** (quem tem esses menus).

### Sessão de 8 horas

Depois de **Entrar**, você fica logado por **8 horas** (um turno).

Acabou o tempo: abra o endereço de novo, preencha **E-mail** e **Senha**, clique em **Entrar**.

---



## 2. Como entrar e sair

```
+------------------------------------------+
| CRM Prospecção                           |
| Entre com a conta cadastrada.            |
|                                          |
| E-mail  [________________________]       |
| Senha   [________________________]       |
|                                          |
|              [ Entrar ]                  |
+------------------------------------------+
```



### Entrar

1. Abra o endereço que o responsável passou (no computador da empresa costuma ser **[http://localhost:3001](http://localhost:3001)**).
2. No campo **E-mail**, digite o e-mail da sua conta.
3. No campo **Senha**, digite a senha.
4. Clique no botão **Entrar**.

- Administrador e Gestor caem na tela **Leads**.
- Vendedor cai na tela **Kanban**.

Se a senha estiver errada, a conta não existir ou estiver desligada, a mensagem é a mesma. O sistema **não** diz se o e-mail existe.

Não existe botão “esqueci minha senha”. Peça senha nova para o Administrador.

Depois de várias tentativas no mesmo e-mail em pouco tempo, o login trava um pouco. Espere e tente de novo.

### Sair

1. No canto superior direito, clique nas **suas iniciais** (o círculo com a letra do seu nome).
2. Clique em **Sair**.

---



## 3. Mapa da casca (o que você vê o dia inteiro)

```
+--------------------------------------------------------------------+
| CRM Prospecção   [ Buscar empresa, tela ou status… ]  [Ctrl K]  [lua]  [iniciais]
+------------+-------------------------------------------------------+
| Leads      |                                                       |
| Contatos   |            (aqui abre a tela do menu)                 |
| Campanhas  |                                                       |
| Inbox      |                                                       |
| Kanban     |                                                       |
| Follow-ups |                                                       |
| ---------- |                                                       |
| Dashboard  |                                                       |
| Relatórios |                                                       |
| Mensagens  |                                                       |
| ---------- |                                                       |
| WhatsApp   |                                                       |
| Importar   |                                                       |
| Supervisão |                                                       |
| Configurações                                                      |
+------------+-------------------------------------------------------+
```

- **Menu da esquerda:** as telas. Clique no nome (exemplo: **Leads**).
- **Barra de cima:** o nome **CRM Prospecção**, a busca, o atalho **Ctrl K**, o botão de tema claro/escuro (sol ou lua) e as suas iniciais.

Quem é **Vendedor** vê a busca escrita **Buscar tela…** (não busca empresa). Quem é Administrador ou Gestor vê **Buscar empresa, tela ou status…**.

Clique na busca da barra de cima (ou **Ctrl K**) para ir a outra tela. No Vendedor isso só muda de tela (Inbox / Kanban).

### Quem vê o quê


| No menu da esquerda | Administrador | Gestor | Vendedor |
| ------------------- | ------------- | ------ | -------- |
| **Leads**           | sim           | sim    | não      |
| **Contatos**        | sim           | sim    | não      |
| **Campanhas**       | sim           | sim    | não      |
| **Inbox**           | sim           | sim    | sim      |
| **Kanban**          | sim           | sim    | sim      |
| **Follow-ups**      | sim           | sim    | não      |
| **Dashboard**       | sim           | sim    | não      |
| **Relatórios**      | sim           | sim    | não      |
| **Mensagens**       | sim           | sim    | não      |
| **WhatsApp**        | sim           | sim    | não      |
| **Importar**        | sim           | sim    | não      |
| **Supervisão**      | sim           | sim    | não      |
| **Configurações**   | sim           | sim    | não      |


Se o Vendedor colar um endereço de outra tela, o sistema manda de volta para o **Kanban**.

O Vendedor **não** importa planilha, **não** cria usuário, **não** troca responsável, **não** vê Campanhas, Importar nem Supervisão.

Na Inbox, o Vendedor **não** vê a fila **Sem responsável**. Ele só vê conversa que já é **dele** (o Gestor clicou em **Transferir**, ou a campanha caiu na conta dele).

---



## 4. Dois conceitos (leia isto uma vez)

São coisas diferentes. A tela usa nomes diferentes.

### Funil (7 status da empresa)

É o **lugar da empresa no negócio**, da esquerda para a direita:

**Novo** → **Pronto para contato** → **Contatado** → **Qualificado** → **Negociação** → **Cliente** ou **Perdido**.


| Na tela             | Significado curto                |
| ------------------- | -------------------------------- |
| Novo                | Entrou na base, ainda não triado |
| Pronto para contato | Triado, dá para falar            |
| Contatado           | Já mandou mensagem ou ligou      |
| Qualificado         | Perfil e interesse conferidos    |
| Negociação          | Proposta em conversa             |
| Cliente             | Fechou                           |
| Perdido             | Encerrou sem fechar              |


Você muda o funil no **Kanban** (arrastar o card), no painel do lead (**Alterar status**), na barra de baixo da lista (**Mudar status**) ou, na Inbox, no campo **Funil** à direita.

O quadro **Kanban** só mostra empresa **já contatada**. **Novo** e **Pronto para contato** ficam em **Leads**, não no quadro.

### Resultado do contato (8 selos)

É o **o que aconteceu nessa conversa**, não o lugar no funil.


| Na tela          | Quando usar                                                                           |
| ---------------- | ------------------------------------------------------------------------------------- |
| Ação iniciada    | Sem WhatsApp ligado: o sistema grava ao clicar **Abrir WhatsApp**                     |
| Mensagem enviada | Com WhatsApp ligado: ao clicar **Enviar**. Sem sessão: você clicou **Marcar enviado** |
| Respondeu        | A empresa respondeu                                                                   |
| Sem resposta     | Não respondeu                                                                         |
| Pediu retorno    | Pediu para ligar ou escrever de novo                                                  |
| Sem interesse    | Recusou                                                                               |
| Número inválido  | Celular errado                                                                        |
| Outro            | Não cabe nos outros                                                                   |


**Exemplo:** a empresa está em **Novo**. Você registra **Respondeu**. O funil **não** vira **Qualificado** sozinho. Qualificado, Cliente e Perdido você muda **à mão**.

Se o funil ainda é Novo ou Pronto para contato, **Mensagem enviada**, **Sem resposta** e **Pediu retorno** sugerem ir para **Contatado**. Os outros resultados **não** andam o funil sozinhos.

**Sem resposta** agenda retorno em +2 dias (se você não puser data). **Pediu retorno** agenda em +1 dia. **Cliente** ou **Perdido** cancelam os retornos que ainda estavam pendentes.

### Selo da conversa (Inbox) — terceira coisa

Na Inbox a conversa tem outro selo: **Aguardando**, **Em atendimento** ou **Resolvida**.

Isso **não** é o funil. Resolver a conversa **não** vira a empresa em Cliente.

---



## 5. Fichas por tela

Ordem igual ao menu da esquerda.

---



### 5.1 Leads

**Quem usa:** Administrador e Gestor. O Vendedor **não** tem este menu.

**O que é:** a lista de empresas. Aqui você filtra, abre a ficha, manda WhatsApp, atribui vendedor e cadastra um contato à mão.

```
+--------------------------------------------------------------------+
| CRM Prospecção   [ Buscar empresa, tela ou status… ]      [Ctrl K] |
+------------+-------------------------------------------------------+
| Leads      |  Leads                    [ Adicionar contato ]       |
| Contatos   |  [ Nome, WhatsApp ou CNPJ ] [ Filtro ] [ Ordenar ] [ Opções ]
| Campanhas  |  (chips: Status: Novo )                    [ Limpar ] |
| Inbox      |  faixa: … fora da listagem …     [ Mostrar todas ]    |
| Kanban     |  faixa: N desta página. [ Selecionar os N do filtro atual ] |
| …          |  [ ] Empresa  CNPJ  Telefone  WhatsApp  Cidade / UF   |
| …          |      Status  Responsável  Próxima ação  Última interação  Ações |
|            |  barra: N selecionados  [ Mudar status ] [ Atribuir ] |
|            |    [ Tag ]  [data] [ Agendar retorno ] [ Disparar campanha ]
+------------+-------------------------------------------------------+
```



#### Passos

1. No menu da esquerda, clique em **Leads**.
2. Para achar uma empresa, digite no campo **Nome, WhatsApp ou CNPJ**.
3. Clique em **Filtro** e escolha, por exemplo, o status **Novo**, a **Cidade** ou a **Campanha**.
4. Clique em **Ordenar** se quiser mudar a ordem.
5. Clique em **Opções** para recortes extras (inclusive **Situação cadastral na Receita** e **Campanha**).
6. Clique numa linha para abrir o painel da empresa. Ou clique no ícone de WhatsApp na coluna **Ações**.
7. Para cadastrar à mão: no canto superior direito, clique em **Adicionar contato**. Preencha **Nome**, **WhatsApp** e, se tiver, **CNPJ (opcional)**. Clique em **Salvar contato**.
8. Para várias empresas de uma vez: clique em **Selecionar os N do filtro atual** (ou marque as caixinhas da página). Na barra de baixo, **Atribuir** escolhe o vendedor — confirme a quantidade e o nome. No máximo **500** por vez. **Tag**, **Agendar retorno** e **Disparar campanha** só na seleção da página. **Limpar seleção** tira as marcas.

A lista **começa** só com empresas **ATIVA** na Receita. Se “sumiu” gente, clique na faixa **Mostrar todas**, ou em **Opções** → **Situação cadastral na Receita** → **Todas as situações**.

No painel da empresa: **Alterar status** muda o funil. **Registrar contato** anota o resultado. Com WhatsApp da empresa **Conectada**, o botão é **Enviar**. Sem conexão, o botão é **Abrir WhatsApp**; depois clique em **Marcar enviado**.

Textos prontos (depois que o Administrador rodou a carga inicial): tags **HOT**, **URGENTE**, **VIP**, **INTERESSE**, **REVENDA**, **INDÚSTRIA**, **PRIORIDADE**. Mensagens: **Primeiro contato — WhatsApp**, **Follow-up — sem resposta**, **Apresentação — e-mail**. Reescreva os textos em **Mensagens** antes de disparar de verdade.

#### O que NÃO fazer

- Não espere **Respondeu** virar **Qualificado** sozinho.
- Não use planilha aqui: planilha é no menu **Importar**.
- Não deixe o filtro de situação em ATIVA e ache que a importação “apagou” empresas baixadas.

---



### 5.2 Contatos

**Quem usa:** Administrador e Gestor. Título na tela: **Contatos do dia**.

**O que é:** a fila do dia — quem está atrasado, quem é de hoje, lead novo, futuro.

```
+--------------------------------------------------------------------+
| CRM Prospecção   [ Buscar empresa, tela ou status… ]      [Ctrl K] |
+------------+-------------------------------------------------------+
| Leads      |  Contatos do dia                                      |
| Contatos   |  [ Todos ] [ Atrasado ] [ Hoje ] [ Lead novo ] [ Futuro ]
| …          |  Prioridade  Empresa  UF  Status  Última interação    |
|            |  Próximo  Ação  (ícone WhatsApp)  [ Registrar ]       |
+------------+-------------------------------------------------------+
```



#### Passos

1. No menu da esquerda, clique em **Contatos**.
2. Clique em **Todos**, **Atrasado**, **Hoje**, **Lead novo** ou **Futuro**.
3. Clique no nome da empresa para abrir o painel.
4. Clique no ícone de WhatsApp na coluna **Ação** para mandar mensagem.
5. Clique em **Registrar** e escolha o resultado (por exemplo **Sem resposta**).
6. Se a lista for longa, clique em **Carregar mais**.



#### O que NÃO fazer

- Não confunda esta tela com a Inbox. Aqui é a **fila de trabalho**; conversa ao vivo é em **Inbox**.

---



### 5.3 Campanhas

**Quem usa:** Administrador e Gestor. O Vendedor **não** vê este menu.

**O que é:** disparo em lote pelo WhatsApp já conectado. Sai no ritmo de **5 envios por minuto**.

Se **Iniciar campanha** recusar, peça para o responsável de TI **deixar o sistema ligado** (detalhe só no apêndice).

```
+--------------------------------------------------------------------+
| CRM Prospecção   [ Buscar empresa, tela ou status… ]      [Ctrl K] |
+------------+-------------------------------------------------------+
| Campanhas  |  Campanhas                                            |
|            |  [ Nome da campanha        ]  [ Nova campanha ]       |
|            |  Nome  Status  Público  Conta  Criada                 |
+------------+-------------------------------------------------------+
```

Dentro de uma campanha (clique no **nome** na lista):

```
+--------------------------------------------------------------------+
|  Nome da campanha     [ Pausar ] [ Retomar ] [ Cancelar ]          |
|  Já nesta campanha / Enviados / Ainda no público                   |
|  público, [ Enviar para no máximo ], Template, Template de retorno |
|  Esperar (horas), distribuição, conta WhatsApp                     |
|  [ Incluir na campanha ]  [ Usar só os selecionados ]              |
|  [ Só cadastro manual ]  [ Salvar rascunho ]  [ Iniciar campanha ] |
|  [ Destinatários ]  Adicionar mais  [ Adicionar à fila ]           |
|  [ Disparar retorno agora ]                                        |
+--------------------------------------------------------------------+
```



#### Passos

1. No menu da esquerda, clique em **WhatsApp** e confira se a sessão está **Conectada** (veja a ficha WhatsApp). Conta só de abrir o WhatsApp do celular **não** dispara campanha.
2. No menu da esquerda, clique em **Campanhas**.
3. No campo **Nome da campanha**, digite um nome (pelo menos 2 letras).
4. Clique em **Nova campanha**.
5. No público: cadastre um número com **Incluir na campanha**, ou marque linhas e clique em **Usar só os selecionados**. Se você **não** marcar, o disparo usa o filtro inteiro. **Só cadastro manual** recorta quem não veio da planilha.
6. Em **Leads**, você também pode marcar empresas e clicar em **Disparar campanha**: abre o rascunho já com essas pessoas.
7. Preencha quantidade em **Enviar para no máximo** (vazio = todos com WhatsApp), o template da primeira mensagem, o **Template de retorno** (tem que ser **outro** texto; o padrão do sistema é **Follow-up — sem resposta**), **Esperar (horas)** (padrão **2**), como distribuir as respostas e a conta WhatsApp.
8. Clique em **Salvar rascunho** ou em **Iniciar campanha**.
9. Acompanhe **Já nesta campanha**, **Enviados**, **Ainda no público**. Clique em **Destinatários** para ver cada um.
10. **Próximo lote:** em **Adicionar mais**, coloque a quantidade e clique em **Adicionar à fila**. Quem já recebeu nesta campanha fica de fora.
11. **Retorno:** depois das horas de **Esperar (horas)**, o sistema tenta mandar sozinho se a pessoa **não** respondeu — **se o TI deixou o sistema ligado**. Se passou o tempo e nada saiu, clique em **Disparar retorno agora**. Quem já ganhou o retorno não recebe de novo. **Pausar** ou **Cancelar** para. Se o selo estiver **Em envio** e nada sair, clique em **Retomar**.

Cem contatos levam cerca de **20 minutos** nesse ritmo. Mensagem avulsa no lead e resposta na Inbox **não** entram nesse teto.

#### O que NÃO fazer

- Não inicie campanha sem a sessão **Conectada**.
- Não use o mesmo template na primeira mensagem e no retorno.
- Não entregue esta tela ao Vendedor: ele não tem o menu.

---



### 5.4 Inbox

**Quem usa:** todos. O Vendedor só vê as conversas **dele**. Administrador e Gestor veem a base, inclusive **Sem responsável**.

**O que é:** o WhatsApp dentro do CRM. Lista à esquerda, mensagens no meio, empresa à direita.

```
+--------------------------------------------------------------------+
| CRM Prospecção   [ Buscar empresa, tela ou status… ]      [Ctrl K] |
+------------+-------------------------------------------------------+
| Inbox      |  Inbox                                                |
| Kanban     |  [ Buscar empresa ou telefone ]                       |
|            |  [ Todas ] [ Não lidas ] [ Minhas ] [ Sem responsável]|
|            |  [ Em atendimento ] [ Aguardando ] [ Resolvidas ]     |
|            |  ----------------+------------------+---------------  |
|            |  lista           |  [ Assumir ] [ Resolver ] [ Reabrir]
|            |                  |  [ Excluir ]                        |
|            |                  |  [ Transferir para… ] [ Transferir ]
|            |                  |  [ Responder… ]                    |
|            |                  |  Anexar foto / vídeo / gravar      |
|            |                  |                         [ Enviar ] |
|            |                  |  Funil  [ Novo ▼ ]                 |
|            |                  |  Nome / WhatsApp / CNPJ (opcional) |
|            |                  |              [ Salvar contato ]    |
+------------+-------------------------------------------------------+
```

O Vendedor **não** vê o filtro **Sem responsável**. A busca dele é **Buscar empresa** (sem telefone). Ele **não** vê o número. **Transferir** e **Salvar contato** são do Gestor/Administrador.

#### Passos (Administrador / Gestor)

1. No menu da esquerda, clique em **Inbox**.
2. Clique numa conversa na lista da esquerda.
3. Se o número ainda não está na base: à direita, preencha **Nome**, confira **WhatsApp**, **CNPJ (opcional)** se tiver, clique em **Salvar contato**. O painel da direita deixa o formulário e mostra **empresa**, **WhatsApp**, **funil** e **responsável**.
4. Clique em **Assumir** para ficar com a conversa (também coloca a empresa no **Kanban** dessa pessoa).
5. Para passar a outro: em **Transferir para…**, escolha o nome. Clique em **Transferir**. A conversa da campanha **mais recente** e o card do Kanban vão para essa pessoa. Se a mesma empresa já tinha disparos de campanhas anteriores nesse fio, esses disparos antigos ficam numa conversa **Resolvida** — o vendedor não os recebe.
6. Digite em **Responder…**. Se quiser, **Anexar foto**, **Anexar vídeo**, ou o microfone (**Gravar áudio**; clique de novo para parar). Clique em **Enviar**. Vale só texto, só arquivo, ou os dois.
7. À direita, em **Funil**, escolha Novo, Contatado, Qualificado… Isso mexe no Kanban na hora.
8. Terminou? Clique em **Resolver**. Precisou voltar? Clique em **Reabrir**.
9. **Abrir lead** (só Admin/Gestor) abre a ficha. **Kanban** abre o quadro.
10. Para tirar a conversa da Inbox: clique em **Excluir**, confira o nome e clique em **Excluir (nome)**. A conversa e as mensagens somem do CRM e você volta para a lista. A empresa continua na base e no **Kanban**. No celular do cliente nada é apagado. Se ele mandar mensagem de novo, aparece uma conversa nova, sem o histórico antigo.

Disparo de campanha e **Enviar** no lead passam Novo/Pronto para **Contatado** sozinhos. Qualificado e Perdido você escolhe no **Funil**.

#### Passos (Vendedor)

1. No menu da esquerda, clique em **Inbox**.
2. Clique na conversa (só as suas).
3. Responda e clique em **Enviar**.
4. À direita, mude o **Funil** se a empresa avançou.
5. Clique em **Resolver** quando acabar.
6. Para tirar a conversa da sua Inbox: clique em **Excluir** e confirme. A empresa continua no seu **Kanban**. Não tem volta.

Se a lista estiver vazia: peça ao Gestor para **Transferir** uma conversa para você, ou espere a campanha cair na sua conta. Você **não** vê a fila **Sem responsável**.

#### O que NÃO fazer

- Não trate **Resolvida** como “virou Cliente”.
- Não peça ao Vendedor para salvar contato novo: isso é do Gestor.

---



### 5.5 Kanban

**Quem usa:** todos.

**O que é:** o funil em colunas. Só empresa **já contatada**. **Novo** e **Pronto para contato** não entram aqui.

```
+--------------------------------------------------------------------+
| CRM Prospecção   [ Buscar empresa, tela ou status… ]      [Ctrl K] |
+------------+-------------------------------------------------------+
| Kanban     |  Kanban              [ Compacto ] [ Encerrados ]      |
|            |  [ busca ] [ Filtro ] [ Ordenar ] [ Opções ]          |
|            |  Contatado | Qualificado | Negociação | Cliente | Perdido
|            |  (cards)     (cards)       (cards)      …               |
+------------+-------------------------------------------------------+
```

Administrador/Gestor: o quadro mostra **todos**. No card aparece **Você**, o nome do responsável, ou **Sem responsável**. Duplo clique abre o painel.

Vendedor: só os **seus**. Não vê telefone. **Não** abre a ficha (duplo clique não abre painel). Coluna vazia: **Nenhum lead seu** naquela coluna.

#### Passos

1. No menu da esquerda, clique em **Kanban**.
2. Arraste o card para outra coluna (exemplo: **Contatado** → **Qualificado**).
3. Clique em **Compacto** para linhas mais baixas.
4. Clique em **Encerrados** para mostrar também **Cliente** e **Perdido**.



#### O que NÃO fazer

- Não procure empresa **Novo** neste quadro. Ela está em **Leads**.
- Não espere **Respondeu** na Inbox mover o card para **Qualificado**.

---



### 5.6 Follow-ups

**Quem usa:** Administrador e Gestor.

**O que é:** agenda de retornos (atrasados, hoje, próximos).

```
+--------------------------------------------------------------------+
| CRM Prospecção   [ Buscar empresa, tela ou status… ]      [Ctrl K] |
+------------+-------------------------------------------------------+
| Follow-ups |  Follow-ups                                           |
|            |  [ Atrasados ] [ Hoje ] [ Próximos ] [ Todos ]        |
|            |  (também: Concluídos / Cancelados)                    |
|            |  tabela da empresa + WhatsApp + [ Registrar ]         |
+------------+-------------------------------------------------------+
```



#### Passos

1. No menu da esquerda, clique em **Follow-ups**.
2. Clique em **Atrasados**, **Hoje**, **Próximos** ou **Todos**.
3. Abra a empresa, mande WhatsApp ou clique em **Registrar**.

O retorno também pode ser marcado em **Leads**: selecione linhas, escolha a data, clique em **Agendar retorno**.

#### O que NÃO fazer

- Não espere e-mail avisando atraso. O atraso é esta tela (e **Contatos**).

---



### 5.7 Dashboard

**Quem usa:** Administrador e Gestor.

**O que é:** oito números da base. Começam em zero até alguém registrar contato. Não são números inventados.

```
+--------------------------------------------------------------------+
| CRM Prospecção   [ Buscar empresa, tela ou status… ]      [Ctrl K] |
+------------+-------------------------------------------------------+
| Dashboard  |  Dashboard                           [ Limpar filtros]|
|            |  [ Filtro ] [ Ordenar ] [ Opções ]                    |
|            |  Leads | Com WhatsApp | Para contato | Contatados     |
|            |  Responderam | Qualificados | Clientes | Follow-ups atrasados
|            |  barras do funil · atividade de hoje · próximas ações |
+------------+-------------------------------------------------------+
```



#### Passos

1. No menu da esquerda, clique em **Dashboard**.
2. Clique num número (KPI) ou numa barra do funil para filtrar a base.
3. **Follow-ups atrasados** abre a tela **Follow-ups** na aba **Atrasados**.
4. Se filtrou demais, clique em **Limpar filtros**.



#### O que NÃO fazer

- Não trate zero como “o sistema quebrou”. Zero = ainda não houve contato registrado.

---



### 5.8 Relatórios

**Quem usa:** Administrador e Gestor.

**O que é:** números do **período** (padrão: últimos 30 dias) e exportação da **base de empresas**.

```
+--------------------------------------------------------------------+
| CRM Prospecção   [ Buscar empresa, tela ou status… ]      [Ctrl K] |
+------------+-------------------------------------------------------+
| Relatórios |  Relatórios     [ Exportar CSV ] [ Exportar XLSX ]    |
|            |  Período  De [data]  Até [data]                       |
|            |  Interações | Enviados | Respostas | Taxa de resposta |
|            |  Por vendedor · por resultado                         |
+------------+-------------------------------------------------------+
```



#### Passos

1. No menu da esquerda, clique em **Relatórios**.
2. Ajuste **De** e **Até**.
3. Para baixar a base (mesmo sem interação), clique em **Exportar CSV** ou **Exportar XLSX**.



#### O que NÃO fazer

- Não espere a planilha exportada trazer só quem falou. A exportação é a **base de leads**.

---



### 5.9 Mensagens

**Quem usa:** Administrador e Gestor (editar). O Vendedor **não** tem o menu; quem dispara usa os textos daqui.

**O que é:** os textos prontos de WhatsApp e e-mail.

```
+--------------------------------------------------------------------+
| CRM Prospecção   [ Buscar empresa, tela ou status… ]      [Ctrl K] |
+------------+-------------------------------------------------------+
| Mensagens  |  Mensagens                      [ Novo template ]     |
|            |  lista à esquerda                                     |
|            |  Novo template / Editar template                      |
|            |  Nome  Canal  Assunto (e-mail)  Corpo                 |
|            |  Foto ou vídeo  [ Anexar foto ou vídeo ]              |
|            |  Preview                                              |
|            |  [ Salvar ]  [ Excluir ]                              |
+------------+-------------------------------------------------------+
```

Já vêm três textos: **Primeiro contato — WhatsApp**, **Follow-up — sem resposta**, **Apresentação — e-mail**. São rascunho: reescreva antes do primeiro disparo real.

No **Corpo**, trechos como `{{razaoSocial}}` viram o nome da empresa na hora do envio. O sistema também preenche `{{nomeFantasia}}`, `{{cidade}}`, `{{estado}}`, `{{cnpj}}`, `{{telefone}}`, `{{whatsapp}}`, `{{email}}`, `{{vendedor}}` (`vendedor` = quem está logado).

#### Passos

1. No menu da esquerda, clique em **Mensagens**.
2. Clique em **Novo template**, ou clique numa linha para editar.
3. Preencha **Nome**, **Canal**, **Assunto (e-mail)** se for e-mail, **Corpo**.
4. Opcional: **Anexar foto ou vídeo** (um arquivo). O texto vira legenda no WhatsApp.
5. Confira o **Preview**. Clique em **Salvar**.
6. **Excluir** pede o **nome** do texto na confirmação.

Campanha e **Enviar** no lead mandam a foto/vídeo do template se o WhatsApp Web estiver **Conectada**. Sem sessão, template com foto/vídeo **não** abre o WhatsApp do navegador — precisa conectar.

#### O que NÃO fazer

- Não mande o rascunho de seed para cliente real sem reler o texto.

---



### 5.10 WhatsApp

**Quem usa:** Administrador e Gestor. **Adicionar conta** é só do Administrador. Gestor pode **Importar contatos** se a sessão já estiver **Conectada**.

**O que é:** ligar o celular no CRM (QR) e, se quiser, puxar a agenda.

Se o QR não aparecer, peça para o responsável de TI **deixar o sistema ligado**.

```
+--------------------------------------------------------------------+
| CRM Prospecção   [ Buscar empresa, tela ou status… ]      [Ctrl K] |
+------------+-------------------------------------------------------+
| WhatsApp   |  WhatsApp                                             |
|            |  Nome  Telefone (opcional)     [ Adicionar conta ]    |
|            |  Nome  Provedor  Telefone  Sessão  …                  |
|            |  [ Conectar ] [ Novo QR ] [ Desconectar ]             |
|            |  [ Importar contatos ] [ Detalhes ]                   |
|            |  (QR para escanear no celular)                        |
+------------+-------------------------------------------------------+
```

Provedor na tabela: **WhatsApp Web (QR)**.

#### Passos (Administrador)

1. No menu da esquerda, clique em **WhatsApp**.
2. Em **Nome**, digite um nome (exemplo: o nome do vendedor). **Telefone (opcional)** pode ficar vazio.
3. Clique em **Adicionar conta**.
4. Na linha da conta, clique em **Conectar** (ou **Novo QR**).
5. No celular: abra o **WhatsApp** → **Aparelhos conectados** → escanear o QR da tela.
6. Espere o selo **Conectada**. Pode aparecer uma pausa curta depois do scan; não precisa escanear de novo.
7. Com **Conectada**, clique em **Importar contatos**. Confirme o nome da conta. O sistema grava os números (agenda + conversas 1 a 1) como empresas. **Não envia mensagem.** Quem já está na planilha (mesmo telefone) não duplica. Grupos não entram. Número da agenda **sem WhatsApp** não entra. Pode levar até um minuto. Confira em **Leads**.
8. **Desconectar** encerra a sessão e some o QR.

Só mensagens **novas** depois da conexão entram na Inbox.

Outro número = outra conta e outro QR. O mesmo celular não fica em dois lugares ao mesmo tempo.

Sem conta **Conectada**, no lead o botão continua **Abrir WhatsApp** (abre o WhatsApp do navegador). Com **Conectada**, o botão vira **Enviar**.

#### O que NÃO fazer

- Não peça ao Vendedor para conectar: ele não tem o menu.
- Não use **Importar contatos** achando que vai disparar mensagem. Só grava na base.

---



### 5.11 Importar

**Quem usa:** Administrador e Gestor. Título na tela: **Importar planilha**.

**O que é:** entrar empresas em lote pela planilha da Receita (arquivo `.xlsx` ou `.xlsm`, até 25 MB). Cadastro à mão é **Adicionar contato** em Leads, não aqui.

```
+--------------------------------------------------------------------+
| CRM Prospecção   [ Buscar empresa, tela ou status… ]      [Ctrl K] |
+------------+-------------------------------------------------------+
| Importar   |  Importar planilha                 [ Começar de novo ]|
|            |  Passo 1 de 4  Arquivo                                |
|            |  [ Escolher arquivo ]                                 |
|            |  [x] Importar somente empresas ativas                 |
|            |  Passo 2  Mapeamento          [ Ver prévia ]          |
|            |  Passo 3  Prévia     [ Importar N lead(s) ]           |
|            |  Passo 4  execução  [ Ver relatório ]                 |
|            |                   [ Importar outra planilha ]         |
|            |  Importações anteriores                               |
+--------------------------------------------------------------------+
```



#### Passos

1. No menu da esquerda, clique em **Importar**.
2. Arraste o arquivo ou clique em **Escolher arquivo**. O cabeçalho precisa estar na **primeira linha**.
3. **Importar somente empresas ativas** já vem ligada.
4. Confira os seletores das colunas. Sem CNPJ ou razão social, não avança. Clique em **Ver prévia**.
5. Na prévia **nada foi gravado ainda**. Clique em **Importar N lead(s)**. Se N for zero, o botão não funciona.
6. Pode sair da tela; a importação continua. No fim: **Ver relatório** ou **Importar outra planilha**. A tabela **Importações anteriores** mostra Na fila, Rodando, Concluída, Falhou, Cancelada.

Reimportar a mesma planilha **não duplica** (a chave é o CNPJ).

#### O que NÃO fazer

- Não use esta tela para cadastrar um WhatsApp solto. Use **Adicionar contato** em **Leads** ou **Salvar contato** na Inbox.

---



### 5.12 Supervisão

**Quem usa:** Administrador e Gestor.

**O que é:** visão das conversas de todo mundo.

```
+--------------------------------------------------------------------+
| CRM Prospecção   [ Buscar empresa, tela ou status… ]      [Ctrl K] |
+------------+-------------------------------------------------------+
| Supervisão |  Supervisão                                           |
|            |  Abertas | Sem responsável | Em atendimento | Resolvidas
|            |  Vendedor  Abertas  Respondidas  TMR 1ª resp.         |
|            |  Resolvidas  Qualificados                             |
+------------+-------------------------------------------------------+
```

Os quatro totais são de **todas** as conversas.

#### Passos

1. No menu da esquerda, clique em **Supervisão**.
2. Clique no **nome** na coluna **Vendedor** para ver as conversas daquela pessoa.
3. Sem gente na tabela: no menu da esquerda, clique em **Configurações** e crie vendedores (só Administrador).

Quem clicou em **Assumir** na Inbox aparece na linha, mesmo sendo administrador.

#### O que NÃO fazer

- Não some os quatro totais achando que cada conversa conta uma vez em cada caixa. São recortes diferentes.

---



### 5.13 Configurações

**Quem usa:** Administrador e Gestor. O bloco **Usuários** só o Administrador vê.

```
+--------------------------------------------------------------------+
| CRM Prospecção   [ Buscar empresa, tela ou status… ]      [Ctrl K] |
+------------+-------------------------------------------------------+
| Configurações |  Configurações                                     |
|               |  Sua conta  (Nome, E-mail, Perfil)                 |
|               |  Infraestrutura                                    |
|               |  Atalhos de teclado                                |
|               |  Usuários                                          |
|               |    Nome  E-mail  Senha inicial  Perfil             |
|               |    [ Criar usuário ]  [ Desativar ] / [ Ativar ]   |
+------------+-------------------------------------------------------+
```

Cadastro de **pessoa** (vendedor, gestor, administrador) é **só aqui**, e **só o Administrador**.

#### Passos (Administrador — criar gente)

1. No menu da esquerda, clique em **Configurações**.
2. Role até **Usuários**.
3. Preencha **Nome**, **E-mail**, **Senha inicial** (mínimo 10 caracteres).
4. Em **Perfil**, escolha **Vendedor**, **Gestor** ou **Administrador**.
5. Clique em **Criar usuário**.
6. Na lista: o seletor de perfil salva na hora. **Desativar** / **Ativar** liga ou desliga a conta.

Não dá para rebaixar o **último** administrador.

O Gestor vê **Sua conta**, **Infraestrutura** e **Atalhos de teclado**. No lugar de Usuários aparece um aviso: só o administrador cria gente.

#### O que NÃO fazer

- Não peça senha neste guia (não colocamos senha de exemplo aqui).
- Não procure “esqueci minha senha”. Troca de senha é com o Administrador / TI.

---



## 6. Roteiros



### 6.1 Administrador — primeira semana

1. Entre: **E-mail**, **Senha**, **Entrar**.
2. No menu da esquerda, clique em **Configurações**. Crie os vendedores: **Nome**, **E-mail**, **Senha inicial**, **Perfil** → **Criar usuário**.
3. No menu da esquerda, clique em **WhatsApp**. **Adicionar conta** → **Conectar** → escaneie o QR. Espere **Conectada**. (Se o QR não abrir, chame o TI.)
4. No menu da esquerda, clique em **Importar**. Suba a planilha nos 4 passos. Confira em **Leads**.
5. Opcional: em **WhatsApp**, **Importar contatos** (agenda do celular, sem mandar mensagem).
6. Em **Leads**, filtre (cidade, campanha, **Sem responsável**) → **Selecionar os N do filtro atual** → **Atribuir** → escolha o vendedor e confirme. Ou use **Adicionar contato** para um número solto.
7. No menu da esquerda, clique em **Mensagens**. Reescreva **Primeiro contato — WhatsApp** e **Follow-up — sem resposta**. **Salvar**.
8. Se for disparo em massa: **Campanhas** → **Nova campanha** → **Iniciar campanha**.
9. No dia a dia: **Inbox** (Transferir para o vendedor), **Supervisão**, **Dashboard**.



### 6.2 Vendedor — manhã

1. **E-mail**, **Senha**, **Entrar**. Você cai no **Kanban**.
2. O menu da esquerda só tem **Inbox** e **Kanban**.
3. No menu da esquerda, clique em **Inbox**. Responda. Clique em **Enviar**. Mude o **Funil** à direita se a empresa avançou.
4. No menu da esquerda, clique em **Kanban**. Arraste o card (**Contatado** → **Qualificado**, etc.). Você só vê os **seus** e só **já contatados**.
5. Não vê telefone. Não transfere. Não salva contato novo. Não importa planilha. Não cria usuário.

Se a Inbox estiver vazia: avise o Gestor para **Transferir** conversas para você.

### 6.3 Gestor — só o que muda em relação ao Administrador

Faça o roteiro do Administrador, **exceto** cadastrar gente.

- Em **Configurações** o bloco **Usuários** não aparece.
- Em **WhatsApp** você **não** vê **Adicionar conta**. Peça ao Administrador para criar a conta. Você pode clicar em **Conectar**, **Importar contatos**, etc., nas contas que já existem.
- Você vê a base inteira, importa planilha, atribui, edita template, exporta, vê relatórios.
- No **Kanban** você vê todo mundo no **mesmo** quadro (**Você** / nome / **Sem responsável**).
- **Inbox** → **Transferir para…** → **Transferir**: a conversa da campanha mais recente e o card passam para o vendedor. Disparos de campanhas anteriores no mesmo fio ficam Resolvidos.
- Ainda **não existe** recorte “só a minha equipe”: Gestor vê a base inteira, igual ao Administrador na leitura.

---



## 7. Atalhos (opcional)

**Você não precisa de teclado.** Tudo tem clique.

Se quiser, a lista também está em **Configurações** → **Atalhos de teclado**.

Enquanto você digita num campo, os atalhos de linha **não** disparam. **Esc** e **Ctrl K** (no Mac: **Cmd K**) valem mesmo digitando.


| Tecla                   | O que faz                                                        |
| ----------------------- | ---------------------------------------------------------------- |
| **Ctrl K** ou **Cmd K** | Abre a busca da barra de cima                                    |
| **/**                   | Foca a busca da tela                                             |
| **j** / **k**           | Próxima / anterior linha (na Inbox: próxima / anterior conversa) |
| **Enter**               | Abre o painel do lead                                            |
| **e**                   | Abre a página completa já em edição                              |
| **x**                   | Marca a linha para ação em lote                                  |
| **w**                   | Abre o painel já no WhatsApp                                     |
| **Esc**                 | Fecha o que estiver aberto por cima                              |
| **r**                   | Na Inbox: foca **Responder…**                                    |
| **a**                   | Na Inbox: **Assumir**                                            |
| **t**                   | Na Inbox: foca **Transferir para…** (Vendedor não transfere)     |
| **c**                   | Na Inbox: **Resolver**                                           |


---



## 8. Perguntas frequentes

**Onde cadastro uma empresa à mão?**  
Em **Leads**, clique em **Adicionar contato**, preencha **Nome** e **WhatsApp**, clique em **Salvar contato**. Na **Inbox**, se o número ainda não está na base, à direita clique em **Salvar contato**. Planilha da Receita continua em **Importar**.

**Onde cadastro o vendedor?**  
**Configurações** → **Usuários** → **Criar usuário**. Só o Administrador.

**Como trago os contatos salvos no WhatsApp?**  
Menu **WhatsApp**, sessão **Conectada** → **Importar contatos**. Confirme o nome da conta. Não envia mensagem. Se a tela falhar, peça para o TI deixar o sistema ligado.

**A lista de Leads está vazia e eu importei a planilha.**  
O filtro padrão mostra só empresas ATIVAS. Clique em **Mostrar todas**, ou **Opções** → **Situação cadastral na Receita** → **Todas as situações**.

**A empresa entrou sem e-mail, mas a planilha tinha e-mail.**  
O e-mail estava inválido e foi descartado. **Importar** → **Importações anteriores** → **Ver relatório**. A empresa entrou; o aviso está no relatório.

**A empresa entrou sem telefone.**  
DDD inválido. Mesmo caminho do item anterior.

**Apareceu “Sem permissão”.**  
Importar, trocar responsável e editar template: Gestor ou Administrador. Criar usuário: só Administrador. Vendedor só **Kanban** e **Inbox**.

**O WhatsApp abre outra janela em vez de enviar.**  
Não há conta **Conectada** em **WhatsApp**. Conecte o QR. Sem sessão, o botão é **Abrir WhatsApp**; depois **Marcar enviado**.

**A Inbox mostrou Enviada e o celular não recebeu.**  
Peça para o TI religar o sistema e envie de novo. Se o número não existir no WhatsApp, a bolha vai para **Falhou**. Mandar para o **mesmo número** do celular pareado pode cair como “mensagem para você mesmo”.

**Registrei “Respondeu” e a empresa não foi para Qualificado.**  
Correto. Resultado ≠ funil. Arraste no **Kanban** ou use **Alterar status** / **Funil**.

**Dashboard e Relatórios estão zerados.**  
Só sobem depois de **Enviar**, **Marcar enviado**, resultado ou **Registrar contato**.

**A exportação em Relatórios baixou leads sem interações.**  
A exportação da base **não** depende de ter contato. Os quatro números do relatório dependem.

**Como vejo o histórico de ligações e mensagens?**  
Abra o lead. **Histórico de interações** no painel ou na página completa.

**O Vendedor vê a fila sem dono na Inbox?**  
Não. Só conversas atribuídas a ele.

---



## Apêndice — ambiente (TI interno)

**Não entregar esta seção ao time de vendas.** Sem senhas reais.

Se campanha não inicia, QR não aparece ou a Inbox não atualiza sozinha: Redis + worker precisam estar no ar (`docker compose up -d` na pasta `CRM/`). Sem isso o sistema de vendas continua abrindo, mas disparo em lote e QR não andam.

### Subir o ambiente

Pré-requisitos: Node 24, PostgreSQL 18 (serviço `postgresql-x64-18`, porta 5432) e
Docker.

#### Primeira vez

Comandos abaixo rodam **dentro de** `CRM/` (pasta da aplicação).

```powershell
cd c:\Users\trind\Desktop\dash\CRM

# 1. Dependências
npm install

# 2. Redis do projeto (container próprio, porta 6380 — não mexe em container de outro projeto)
docker compose up -d

# 3. Configuração
Copy-Item .env.example .env
#    Edite o .env e preencha:
#    - DATABASE_URL com o usuário e a senha do seu PostgreSQL
#    - SEED_ADMIN_PASSWORD com a senha que você quer para o admin (mínimo 10 caracteres)

# 4. Segredo de sessão (grava no .env sem exibir o valor)
npm run auth:secret

# 5. Banco
#    Crie a base uma vez, se ainda não existir:
#    psql -U postgres -c "CREATE DATABASE crm_prospeccao"
npm run db:deploy     # aplica as migrations
npm run db:seed       # cria o admin, as 7 tags e os 3 templates

# 6. Carga das planilhas do workspace
npm run import:xlsx -- --all-situacoes
```



#### No dia a dia

O CRM escuta em **[http://localhost:3001](http://localhost:3001)** (a 3000 fica para outros sistemas). Ele **não**
sobe sozinho: precisa ligar no terminal. Fechou o terminal, o CRM para.

```powershell
docker compose up -d   # Redis (6380) + worker Baileys (crm-worker)
npm run dev            # desenvolvimento, http://localhost:3001
# Não rode npm run worker no terminal: o container já é o worker.
```

Versão compilada:

```powershell
npm run build
npm run start          # também na porta 3001
```

#### VPS (`/opt/disparo-de-msg`)

Produção: o **mesmo** código do `CRM/` local, publicado no GitHub
**https://github.com/Trindadelucas0/DISPARO-DE-MSG.git** (`npm run publish:github` na pasta `CRM/`).
Endereço previsto: **https://crm-exito.avadesk.com.br**. Next no **PM2** (`pm2 status` → `crm`)
ou systemd (`crm.service`). Containers: `crm-postgres`, `crm-redis`, `crm-worker` via
**`docker-compose.vps.yml`**. Atalho: `/root/PROJETOS/DISPARO-DE-MSG`.
Túnel: **https://crm-exito.avadesk.com.br**.

No `.env` da VPS (não versionado): `COMPOSE_FILE=docker-compose.vps.yml` e `REDIS_URL` na **6379**.
Não suba `docker-compose.yml` (Windows, Redis 6380) nesta máquina.

```bash
cd /opt/disparo-de-msg
git pull
npm ci
npx prisma migrate deploy
npm run build
docker compose -f docker-compose.vps.yml up -d --build worker
pm2 restart crm
# se systemd: sudo systemctl restart crm
```

E-mail do admin: o de `SEED_ADMIN_EMAIL` no `.env` do servidor. A senha não está neste guia.

`cloudflared` está instalado nesta VPS. Rotas (subdomínio → porta) se cadastram no painel
Cloudflare Zero Trust, não neste repositório. O CRM escuta `127.0.0.1:3001`.

#### Entrar (ambiente local)

[http://localhost:3001](http://localhost:3001). E-mail de `SEED_ADMIN_EMAIL` (padrão `admin@crm.local`) e a
senha definida em `SEED_ADMIN_PASSWORD`. Rodar o seed de novo **não** sobrescreve
uma senha já trocada.

Campanha: teto **5 envios/minuto** no worker. Retorno automático depois de **Esperar (horas)** (padrão 2 h) via job na fila; **Disparar retorno agora** é catch-up de quem já passou o intervalo. Inbox e Enviar no lead ficam fora do teto.

### Importar pelo terminal

Usa o mesmo serviço da tela:

```powershell
npm run import:xlsx                      # descobre os .xlsx do workspace, só empresas ativas
npm run import:xlsx -- --all-situacoes   # inclui BAIXADA, INAPTA, SUSPENSA e NULA
npm run import:xlsx -- caminho\a.xlsx    # arquivo específico
```



### Comandos úteis

```powershell
npm run dev                 # servidor de desenvolvimento (porta 3001)
npm run build               # build de produção
npm run start               # servir o build (porta 3001)
npm run lint                # ESLint
npm run typecheck           # TypeScript
npm run test                # Vitest
npm run design:check        # verificação do padrão visual
npm run db:status           # estado das migrations
npm run db:studio           # navegador do banco (Prisma Studio)
npm run db:seed             # recria admin, tags e templates (idempotente)
npm run import:xlsx         # importação pelo terminal
docker compose up -d        # sobe o Redis do projeto
docker compose down         # derruba o Redis do projeto
```

