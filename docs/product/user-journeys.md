# Jornadas do usuário — LinkedIn Ops

- Versão: 0.2 · 2026-10-13 · Farol (modos de autonomia conforme PRD §6 v0.2 / §13.11)
- Persona: Rodrigo (único usuário). Referência: `prd.md` §3, §6, §7, §8.
- Convenções: **[tela]** = tela do dashboard; **(estado)** = estado do item de conteúdo; **TG** = notificação Telegram. Cada jornada termina com critérios de aceite verificáveis que o backlog referencia.

Mapa de navegação proposto (a validar com Aurora): **Início** (lote atual + em andamento) · **Curadoria** (lote, histórico) · **Estúdio** (item/versões) · **Calendário** · **Memória editorial** (Voice Profile, Story Bank, pilares) · **Fontes** · **Configurações** (autonomia, integrações, notificações, conta) · **Auditoria**.

---

## J1 · Curadoria e seleção (modo assistido)

**Gatilho:** segunda, 09:00 `America/Sao_Paulo`. O worker executa o ciclo.

1. 09:00 — ciclo inicia: coleta, normalização, dedup, classificação, score, seleção de 5. Até 09:10 o lote existe com `status = ready`.
2. 09:10 — TG: "Curadoria de segunda pronta: 5 oportunidades. [Abrir]" (link profundo para **[Curadoria]**).
3. Rodrigo abre **[Curadoria]**. Vê 5 cards (campos do PRD §7.3) ordenados por score; chips de pilar; badges de atualidade e gates; cada card com **Selecionar**, **Descartar**, **Ver fontes**.
4. Abre "Ver fontes" de um card: lista de fontes com domínio, data, link externo escapado. Fecha.
5. Descarta um card com motivo "já vi". O card recolhe para a seção "descartadas" do lote (reversível até o lote expirar).
6. Seleciona um card. Confirmação inline: "Gerar rascunho para *<título>*? Isso cria um item de conteúdo e consome uma geração." → **Gerar**.
7. Item criado (SELECTED) → (GENERATING). O card mostra "gerando…" com progresso indeterminado; Rodrigo pode navegar para outra tela.
8. Ao concluir (DRAFT), TG: "Rascunho pronto: *<título>*. [Abrir no estúdio]". No dashboard, o card vira link para o estúdio.

**Variações**
- V1 Lote com menos de 5 acima do limiar: cards extras exibem faixa "abaixo do limiar de relevância" com o score. (Decisão pendente, PRD §13.1.)
- V2 Rodrigo seleciona 2 cards: 2 itens criados; banner "2 itens em andamento esta semana".
- V3 Rodrigo não abre até quarta 09:00: lote expira; cards passam a `expired` e ficam em "Lotes anteriores" com **Reativar**.
- V4 "Rodar curadoria agora": gera lote `manual` extra; botão desabilita por 1 h.
- V5 Ciclo falhou após 3 tentativas: TG "Curadoria de hoje falhou: <motivo resumido>"; **[Curadoria]** exibe estado de erro com **Tentar novamente**.

**Critérios de aceite**
- [ ] Lote disponível até 09:10 em dia de ciclo, com exatamente 5 cards quando há candidatos suficientes.
- [ ] Nenhum card repete cluster de assunto selecionado/descartado nos últimos 30 dias sem marcação "atualização".
- [ ] Selecionar cria item e enfileira geração em ≤ 2 s; descartar grava motivo e é reversível até expirar.
- [ ] Conteúdo de fonte é exibido escapado; links externos abrem em nova aba com `rel="noopener noreferrer"`.

---

## J2 · Geração, edição e regeneração

1. Rodrigo abre **[Estúdio]** do item (DRAFT → IN_REVIEW ao abrir). Layout: editor à esquerda; à direita abas **Prévia** (fiel ao LinkedIn, com "ver mais" após 3 linhas), **Hooks** (3 alternativas; clicar substitui a primeira linha e cria versão), **Fontes** (lista com trechos; afirmações factuais destacadas no texto ao passar o mouse), **Mídia** (sugestão; para `code-card`, prévia renderizada), **Versões**.
2. Edita o texto. Autosave cria versão a cada pausa ≥ 5 s ou ao sair; contador mostra `n/3000` caracteres; badges de gates reavaliam (debounce).
3. Clica **Regenerar** → campo "instrução para a regeneração" (ex.: "mais curto, menos lista, cite a fonte 2"). (IN_REVIEW → GENERATING → DRAFT/IN_REVIEW). Nova versão aparece no topo; a anterior permanece.
4. Abre **Versões**: lista com autor (Rodrigo/IA), horário, instrução usada, diff entre duas versões; **Restaurar** cria nova versão cópia.
5. Em **Fontes**, remove uma fonte que considera fraca: o sistema marca as afirmações que dependiam dela como "sem fonte" (badge G5 amarelo) para Rodrigo decidir.

**Variações**
- V1 Geração falhou (OpenAI indisponível): item volta a SELECTED com mensagem "Falha ao gerar: tente novamente"; retries automáticos até 3× com backoff; TG só se esgotar.
- V2 Resposta da IA inválida (JSON fora do schema): tratada como falha; log com `correlationId`; sem exibir conteúdo parcial.
- V3 Duas abas editando: segunda gravação recebe "conflito de versão" e vê diff; nada é perdido.
- V4 Rodrigo cola um número que não está em nenhuma fonte: badge G5 "afirmação sem fonte" com ação **Vincular fonte** ou **Marcar como fato do autor** (vai para o Story Bank, opcional).

**Critérios de aceite**
- [ ] Regenerar nunca apaga versão; histórico lista todas com diff.
- [ ] Prévia reflete o texto em ≤ 300 ms; contador bloqueia aprovação acima de 3 000 caracteres.
- [ ] Hooks alternativos substituem só a primeira linha e geram versão.
- [ ] Falha de IA não corrompe estado; retry manual disponível.

---

## J3 · Aprovação e agendamento

1. No **[Estúdio]**, Rodrigo clica **Aprovar esta versão**. Diálogo resume: versão nº, gates (verde/amarelo), nº de fontes, idioma. → **Aprovar** (IN_REVIEW → APPROVED). Registro `approval` humano.
2. Botão **Agendar** abre o **[Calendário]** com slot sugerido (próximo slot livre na janela configurada, ex.: quarta 10:00 `America/Sao_Paulo`). Rodrigo aceita ou escolhe outro horário; o seletor mostra o timezone explicitamente e o horário UTC equivalente.
3. Confirma (APPROVED → SCHEDULED). TG: "Agendado: *<título>* para qua 15/10 10:00 (America/Sao_Paulo)".
4. No **[Calendário]** o item aparece no slot; arrastar para outro slot reagenda (auditoria registra).
5. Rodrigo volta ao estúdio e corrige uma vírgula: aviso "Editar revoga a aprovação e desagenda. Continuar?" → nova versão (SCHEDULED → IN_REVIEW); slot liberado. Reaprova e reagenda em 2 cliques (slot anterior pré-selecionado).

**Variações**
- V1 Assistido com `assistedPrefetchDraft` ligado: o item chega já com rascunho e "proposto para qua 10:00"; Rodrigo ainda precisa clicar **Aprovar e manter horário** (nada publica sem isso).
- V2 Piloto automático controlado: Rodrigo recebe TG "Vai publicar *<título>* qua 10:00; cancele até 09:00 no dashboard". Abre o item, vê a razão da aprovação automática (gates com valores) e pode **Cancelar** (volta a aprovado, sem slot), **Editar** (revoga a aprovação automática) ou **Reagendar** (nova janela). Sem ação, publica às 10:00.
- V2b Piloto automático completo: sem janela; TG "Publicado automaticamente *<título>* (razão)" depois do fato.
- V2c Versão com mídia em qualquer modo piloto: para em `IN_REVIEW` com "mídia exige sua aprovação" (`require_human_for_media`).
- V2d Veredito editorial `warn` em modo piloto: segura em `IN_REVIEW` e notifica "precisa de você: avisos editoriais" (proposta, PRD §13.18).
- V3 Slot no passado ou fora da janela: validação impede com mensagem.
- V4 Dois itens no mesmo dia: aviso de cadência (limite 1/dia), permitido manualmente.

**Critérios de aceite**
- [ ] Aprovação vincula versão específica; qualquer edição posterior revoga e cria nova versão.
- [ ] `scheduledAt` armazenado em UTC com `timezone` IANA; UI mostra ambos ao confirmar.
- [ ] Razão de aprovação automática visível no item com gates, limiares e valores.
- [ ] No controlado, o despacho só ocorre após `cancel_window_minutes` da notificação; cancelar dentro da janela impede a publicação (teste).
- [ ] Reagendar e desagendar registram auditoria.

---

## J4 · Publicação e acompanhamento

1. Quarta 10:00 — scheduler enfileira o job de publicação com `idempotencyKey` (SCHEDULED → PUBLISHING). O job revalida: versão ainda aprovada, modo permite, token válido.
2. Chamada à API oficial do LinkedIn (texto; se houver imagem, upload prévio). Sucesso → `Publication` com `linkedinPostUrn` (PUBLISHING → PUBLISHED).
3. TG: "Publicado: *<título>* [Ver no LinkedIn]". **[Início]** mostra "Publicados esta semana" com link.
4. Rodrigo abre **[Auditoria]** do item: linha do tempo (selecionado 09:14, gerado 09:15, 4 versões, aprovado 09:31, agendado 09:32, publicado 10:00:07).

**Variações (falhas)**
- V1 Timeout após a API aceitar: retry usa a mesma `idempotencyKey`; antes de republicar, reconcilia consultando a `Publication` e, se houver URN, finaliza como PUBLISHED. **Nunca** cria post duplicado.
- V2 Erro 4xx de conteúdo (ex.: texto inválido): (PUBLISHING → FAILED) com motivo legível; TG "Falha ao publicar: <motivo>"; ações **Editar** / **Reagendar** / **Descartar**.
- V3 Erro 5xx/rate limit: retries com backoff (3×, 1/5/15 min); se esgotar, FAILED + DLQ + alerta interno.
- V4 Token expirado/revogado no momento da publicação: FAILED com motivo "LinkedIn desconectado"; TG com link para **[Configurações › Integrações]**; item fica reagendável após reconectar.
- V5 Modo rebaixado entre agendamento e publicação (aprovação automática revogada): job aborta → IN_REVIEW; TG explica.
- V6 Controlado: janela de cancelamento ainda não decorrida no slot (ex.: notificação atrasada): despacho adiado até completar a janela; auditoria registra o adiamento.

**Critérios de aceite**
- [ ] Zero duplicatas em teste de injeção de falha (timeout após aceite, reinício do worker durante PUBLISHING).
- [ ] Publicação executada em ≤ 5 min do horário agendado em condições normais.
- [ ] Toda falha tem motivo legível em PT-BR e ação possível.
- [ ] Linha do tempo de auditoria completa por item.

---

## J5 · Configuração de fontes e watchlists

1. **[Fontes]** vazio (estado empty): explicação curta + **Adicionar fonte** + "importar OPML" (opcional).
2. Adicionar: URL do feed → o sistema valida (busca, parseia, mostra 3 itens mais recentes e o domínio canônico). Campos: nome, pilar padrão (opcional), peso (0,5–2,0), ativo.
3. Domínios permitidos: lista gerada a partir das fontes + edição manual. Só URLs de domínios permitidos viram fontes de oportunidades (URLs manuais exibem aviso quando fora da lista, mas são aceitas como fonte `manual`).
4. Watchlist: termos/entidades (ex.: "PostgreSQL", "Anthropic", "engenharia de plataforma") com peso; itens que os contêm ganham bônus de score.
5. Saúde: tabela com último sucesso, falhas consecutivas, itens/semana; fonte com 5 falhas seguidas é pausada automaticamente e aparece em alerta interno.

**Variações**
- V1 Feed inválido ou sem itens: erro inline, não salva.
- V2 Feed com HTML/script nos campos: exibido escapado; sanitizado antes do motor.
- V3 Remover fonte: oportunidades passadas mantêm referência histórica; novos ciclos a ignoram.

**Critérios de aceite**
- [ ] Teste de fonte na hora do cadastro, com prévia.
- [ ] Pausa automática após falhas consecutivas e alerta interno.
- [ ] Watchlist altera score de forma observável no card ("+0,1 watchlist: PostgreSQL").

---

## J6 · Voice Profile e Story Bank

1. **[Memória editorial › Voice Profile]** no primeiro acesso: assistente em etapas (tom, estrutura preferida, vocabulário que usa / que evita, temas que não publica, 3–5 posts antigos aprovados colados como exemplos, idioma padrão). Salvar cria a versão 1.
2. Editar depois gera nova versão; a geração sempre usa a versão vigente e registra qual.
3. **[Story Bank]**: lista de entradas (título, história/fato, números com origem, pilar, pode usar publicamente sim/não, data). **Nova entrada** manual; opcionalmente "entrevista guiada" (perguntas inspiradas no `linkedin-interviewer`) que transforma respostas em entradas — Rodrigo revisa antes de salvar.
4. No estúdio, a aba **Fontes** mostra entradas do Story Bank usadas; qualquer experiência citada no post deve apontar para uma entrada ou ser marcada como "fato do autor".
5. **[Pilares e públicos]**: lista de pilares (nome, descrição, cor) e públicos; usados pelo classificador e pelos filtros.

**Critérios de aceite**
- [ ] Voice Profile versionado; versão usada gravada em cada `ContentVersion`.
- [ ] A IA não cita experiência fora do Story Bank (eval adversarial de Pena passa).
- [ ] Entradas "não pública" nunca aparecem em rascunhos.

---

## J7 · Notificação Telegram

1. **[Configurações › Integrações › Telegram]**: instruções para iniciar conversa com o bot; o bot responde com um código; Rodrigo cola o código no dashboard → chat vinculado (`chatId` autorizado). **Testar notificação** envia "Olá, LinkedIn Ops conectado".
2. Preferências por evento (ligado/desligado): lote pronto, rascunho pronto, aguardando aprovação, agendado, publicado, falha, token expirando, vai publicar (piloto controlado, com hora-limite de cancelamento), publicado automaticamente, precisa de você (gate/mídia/warn), curadoria falhou. `quiet_hours` opcional (22:00–07:00) exceto falhas.
3. Mensagens curtas, PT-BR, com link profundo; nunca incluem token, prompts ou conteúdo de fonte não sanitizado; texto do post só em prévia de 200 caracteres.
4. Mensagens recebidas pelo bot (qualquer texto) são ignoradas no MVP com resposta fixa "Use o dashboard: <link>". Comandos ficam para fase posterior (PRD §13.5).

**Variações**
- V1 Telegram indisponível: a notificação fica em fila com retry (até 1 h); a central interna sempre registra.
- V2 Mensagem de chat não autorizado: ignorada e logada (sem responder detalhes).

**Critérios de aceite**
- [ ] Só o `chatId` vinculado recebe mensagens; vínculo via código de uso único com expiração.
- [ ] Todo evento notificado também aparece na central interna.
- [ ] Nenhum segredo ou conteúdo externo bruto nas mensagens.

---

## J8 · Falhas e recuperação

| Cenário | O que Rodrigo vê | O que o sistema faz |
|---|---|---|
| LinkedIn fora do ar no slot | TG "Falha ao publicar (LinkedIn indisponível); tentando novamente"; item em PUBLISHING com tentativas visíveis | Retry 3× com backoff; depois FAILED + alerta; reagendável em 1 clique |
| Token LinkedIn expirado/revogado | Banner persistente "LinkedIn desconectado" em todas as telas; TG; itens agendados ficam em aviso | Alerta 7 dias e 24 h antes de expirar (G9); publicação bloqueada até reconectar; reconectar não perde agendamentos |
| OpenAI falhou/latência alta | "Gerando…" com tempo; após 3 falhas, "Falha ao gerar, tente novamente" | Retry com backoff; log com `correlationId`; sem conteúdo parcial |
| Resposta de IA fora do schema | Mesma mensagem de falha | Validação Structured Outputs/Zod; conta como falha; evento para Pena |
| Feed RSS quebrado | Fonte em alerta na tela de fontes | Pausa após 5 falhas; ciclo segue com as demais |
| Ciclo não rodou (worker caído às 09:00) | TG "curadoria atrasada"; ao voltar, lote gerado com marca "atrasado" | Scheduler reconhece ciclo perdido na retomada e executa 1× (sem duplicar lote) |
| Telegram fora | Nada no celular; central interna com o evento | Fila com retry até 1 h; no piloto controlado, a janela de cancelamento conta a partir do registro interno e o despacho não é antecipado |
| Storage S3 indisponível ao renderizar card | Rascunho segue como `text`; aviso na aba Mídia | Render reagendado; publicação de imagem bloqueada até existir o arquivo |
| Banco restaurado de backup | Aviso de operação | Jobs idempotentes; publicações com URN não se repetem (reconciliação) |

**Critérios de aceite**
- [ ] Cada cenário acima tem teste automatizado (fault injection) ou roteiro de QA com evidência.
- [ ] Nenhum cenário resulta em post duplicado ou publicação fora do modo configurado.

---

## J9 · Troca de modo de autonomia

1. **[Configurações › Autonomia]**: três cartões (Assistido · Piloto automático controlado · Piloto automático completo) com "o que acontece sem você" (PRD §6.2) e guardrails ativos; o atual destacado. No Assistido, o toggle `assistedPrefetchDraft` (pré-gerar rascunho e propor slot).
2. Subir: diálogo com resumo + reautenticação; confirmação. Auditoria registra.
3. Descer: imediato; lista de itens cujas aprovações automáticas foram revogadas (se houver) com link.
4. Guardrails editáveis na mesma tela (`auto_approve_min_score`, `allowed_pillar_ids`, `max_auto_posts_per_week`, janela de publicação, `cancel_window_minutes`, `require_human_for_media`, `quiet_hours`, tópicos sensíveis), cada edição versiona a política.

**Critérios de aceite**
- [ ] Padrão em instalação nova = Assistido.
- [ ] Subir exige reautenticação; descer revoga aprovações automáticas pendentes e notifica.
- [ ] `require_human_for_media` nasce ligado; desligar gera auditoria e aviso.
- [ ] Política versionada; `policyVersion` aparece nas razões de aprovação.
