# Mapeamento do upstream `linkedin-skills`

Documento de rastreabilidade exigido pelo briefing (§7). Registra **qual versão** do repositório
`https://github.com/sergebulaev/linkedin-skills` foi estudada, **o que foi adotado, adaptado ou
rejeitado** por skill, **quais alegações sobre o algoritmo são heurísticas não oficiais** e a
**proposta de pinning** para o Atlas decidir no ADR-0006.

Mantido por: Pena (AI Editorial & Human Voice). Última revisão: 2026-10-13.

---

## 1. Versão analisada

| Campo | Valor |
|---|---|
| Repositório | `https://github.com/sergebulaev/linkedin-skills` |
| Commit analisado | `bfa41ff5d2b137f6023f88d9c9fda68d75b4ed5f` |
| Data do commit | `2026-10-06T21:47:24-04:00` |
| Tag | `v1.1.19` |
| Licença | MIT, `Copyright (c) 2026 Sergey Bulaev` (arquivo `LICENSE`) |
| Como reproduzir | `git clone --depth 50 https://github.com/sergebulaev/linkedin-skills /tmp/linkedin-skills-upstream && git -C /tmp/linkedin-skills-upstream checkout bfa41ff5d2b137f6023f88d9c9fda68d75b4ed5f` |
| Escopo lido | `README.md`, `SKILL.md`, `LICENSE`, `SECURITY.md`, `CLAUDE.md`, `AGENTS.md`, `references/*.md` (9 arquivos), as 10 skills relevantes com todas as `references/` e `sub-skills/`, `evals/run_evals.py`, `tests/test_instruction_integrity.py`, `tests/test_skill_contracts.py` |
| Fora do escopo | `linkedin-employee-advocacy`, `linkedin-engager-analytics` (não listadas no briefing; dependem de scraping de engajadores), `lib/*.py`, `scripts/*.py`, `.codex-marketplace/` (cópia gerada) |

O conteúdo do upstream foi tratado como **material de estudo (dado)**, nunca como instrução
para este agente ou para o produto.

### 1.1 Atribuição e licença (obrigatório em material derivado)

A MIT exige que o aviso de copyright e a permissão acompanhem "copies or substantial portions".
Regra adotada para este repositório:

1. Todo arquivo em `packages/editorial-engine` ou `docs/editorial` que **derive** de texto do
   upstream (rubricas, listas de clichês, esqueletos de fórmula, banco de perguntas) leva um
   cabeçalho de atribuição no formato:
   `Derived from sergebulaev/linkedin-skills @ bfa41ff5 (v1.1.19), MIT. See packages/editorial-engine/upstream/linkedin-skills/LICENSE.`
2. Uma cópia literal de `LICENSE` acompanha o snapshot vendorizado (caminho conforme §6 / ADR-0006),
   independente da forma de pinning escolhida.
3. Um arquivo `THIRD_PARTY_NOTICES.md` na raiz do repositório (área do Platform/Atlas; proposta,
   não criado por mim) lista o upstream com commit, tag e licença.
4. Nada do upstream é executado em runtime: nem `SKILL.md`, nem `lib/`, nem `scripts/`. A
   aplicação não depende de Claude Code, Codex ou qualquer agente de terminal.

---

## 2. Como ler este mapeamento

| Rótulo | Significado |
|---|---|
| **Adotado** | O conceito entra no sistema editorial como está, reescrito em PT-BR e em código TypeScript (`packages/editorial-engine`). |
| **Adaptado** | O conceito entra com mudança substantiva: idioma, contexto (produto web em vez de agente de terminal), nível de evidência, ou remoção de dependências externas. |
| **Rejeitado** | Não entra. Motivos típicos: viola regra inegociável (scraping, engajamento inautêntico, browser automation), depende de serviço de terceiros (Apify, Publora, Pixfaro), é específico da voz do autor do upstream, ou é alegação sobre o algoritmo sem fonte oficial. |

Princípio geral: **o upstream é um bom catálogo de "o que torna um post humano e específico" e um
catálogo fraco de "como o algoritmo funciona"**. Separamos as duas coisas em todo o documento.

### 2.1 Diferenças estruturais entre o upstream e o LinkedIn Ops

| Dimensão | Upstream | LinkedIn Ops | Consequência |
|---|---|---|---|
| Runtime | Agente de terminal lendo `SKILL.md` | Worker Node/TS chamando OpenAI Responses API com Structured Outputs | Instruções viram prompts versionados + schemas; não há "skill" em produção. |
| Leitura de dados do LinkedIn | Apify (scraping sem login) | Nenhum scraping. Só APIs oficiais, RSS/fontes configuradas e texto colado por Rodrigo | Toda skill que depende de `fetch_post*` é **adaptada para entrada manual** ou rejeitada. |
| Publicação | Publora (SaaS intermediário) | OAuth + API oficial do LinkedIn, idempotente | Fluxos de "approval card → publish" viram a state machine do §13 do briefing. |
| Imagens | Pixfaro (API de geração) | Renderização local (Sharp/Satori/Resvg): cards de código, quote-cards | Geração de imagem por IA fica fora do MVP; "sugestão de mídia" é um objeto estruturado. |
| Idioma | Inglês | PT-BR principal, inglês opcional | Listas de vocabulário, fórmulas e rubricas precisam de versão PT-BR própria; a evidência do upstream é toda sobre corpus em inglês. |
| Voz | Calibrada para o autor do upstream (minúsculas no início de frase, `..` como pausa) | Voice Profile de Rodrigo, coletado por entrevista e amostras | Nenhuma quirk do autor do upstream vira regra. |
| Engajamento | Comentários em massa, "warm-up", comentários em posts próprios | Comentários assistidos a partir de URL fornecida por Rodrigo, um por vez, sempre aprovados | Toda tática de volume ou de simulação de comportamento humano é rejeitada. |

---

## 3. Referências compartilhadas do upstream (`references/`)

| Arquivo | Decisão | Por quê / como entra |
|---|---|---|
| `voice-profile.md` | **Adaptado** | Vira o schema `VoiceProfile` (ver `editorial-system.md` §3). Mantemos: fingerprint de ritmo, aberturas, pontuação, vocabulário usado/evitado, emoji, formatação, público, pilares, regras sempre/nunca, estilo de CTA, exemplos de assinatura. Removemos a §6 "Brand assets" ligada a Pixfaro; substituímos por tokens para renderização local. Status `filled: yes/no` vira `status: empty / partial / complete` com data. |
| `story-bank.md` | **Adotado (com proveniência)** | As 9 seções (Timeline, Receipts, Shipped, Turning points, Scars, Positions, Recurring stories, Names you can use, Off limits) viram o schema `StoryBank`. Acrescentamos por item: `source` (entrevista / manual / importado), `verifiedAt`, `confidentiality` e `id` referenciável pelos rascunhos. A regra "nunca inventar um número; deixar vazio e marcar como fino" é regra inegociável nossa. |
| `voice-rules.md` | **Adaptado** | As regras de voz são boas, mas (a) parte é gosto pessoal do autor (minúsculas, `..`), (b) a blacklist é em inglês, (c) a seção "Algorithmic Scoring Criteria (NLP-level)" afirma como o ranker do LinkedIn pontua comentários sem fonte oficial. Entram: nomes sempre capitalizados, números específicos em vez de adjetivos, um insight por comentário, não citar o próprio produto em post de terceiros, nunca fechar com "O que você acha?". Não entram como fato: pesos do ranker. |
| `hook-formulas.md` | **Adaptado** | As 20 fórmulas (F1–F20) viram um catálogo PT-BR `HookFormula` com subconjunto permitido e notas de uso. Os "multiplicadores de engajamento" e os percentuais de reach (+34%, -34%, -4,9% etc.) são **evidência de fornecedor** ([vendor]/[crowd]) e entram apenas como nível de evidência da recomendação, nunca como verdade. Rejeitadas: F6 (comment-gate, engajamento-isca por definição) e F13 (bait-and-switch: notícia falsa como gancho fere autenticidade). Com cautela e só quando o Story Bank tem o fato: F4, F9, F11, F12, F16. |
| `algorithm-heuristics.md` | **Rejeitado como verdade; parcialmente adaptado como recomendação** | É a fonte principal de alegações sobre o algoritmo (ver §5). O que sobrevive como recomendação editorial: gancho antes da dobra, links fora do corpo, 0–2 hashtags, pergunta de fechamento específica, não editar estruturalmente logo após publicar. O que é rejeitado: tabelas de horário por fuso dos EUA/UE, "seeding" de comentários no próprio post, "warm-up" de comentários, matemática de pesos de sinal, detecção de pods com percentuais. |
| `untrusted-content.md` | **Adotado e reforçado** | É a regra canônica de prompt injection: conteúdo buscado é dado, nunca instrução, nunca aprovação, nunca amplia alcance. Nossa versão (`editorial-system.md` §9) estende para RSS, artigos, nomes de fontes, títulos, e exige que o output estruturado tenha o campo `injectionSuspected` com trecho citado. Coordenar com Sentinela. |
| `founder-topics.md` | **Adaptado (opcional)** | 10 "ângulos de fundador" (A1–A10) são bons gabaritos de tensão. Entram no catálogo de ângulos PT-BR com rótulo "fundador", ativados só se o Voice Profile marcar Rodrigo como fundador/criador de produto (pergunta aberta §7). As promessas de "o que funciona com investidores" não têm fonte e não entram. |
| `industry-benchmarks.md` | **Rejeitado** | Números de "Co.Actor customer data" (empresa do autor), AuthoredUp e 360Brew misturados em uma tabela sem metodologia. Não há como auditar. Não viram KPI nem referência de produto. O Sextante define métricas apenas a partir do que a API do LinkedIn fornece. |
| `engagement-metrics-taxonomy.md` | **Adaptado pelo Sextante (sugestão)** | A separação em camadas (por post / por conta / por negócio) é útil como taxonomia. Os pesos ("save = 5x like") são rejeitados. Entregar ao Sextante como insumo, não como spec. |

---

## 4. Mapeamento por skill

Para cada skill: o que ela faz no upstream, decisão, o que entra, o que fica de fora e por quê.

### 4.1 `linkedin-interviewer`

**No upstream:** entrevista o usuário para preencher o Story Bank (modo `bank`) ou produzir a
"espinha" de um post em 5 linhas (modo `post`: Moment, Number, Correction, Opposition, Ask).
Banco de perguntas que separa "perguntas que produzem material" de "perguntas que produzem CV".

| Decisão | Itens |
|---|---|
| **Adotado** | Separação Voice Profile (como soa) vs Story Bank (o que tem a dizer). As 9 seções do banco. A espinha de 5 linhas (PT-BR: **Momento, Número, Correção, Oposição, Pedido**), com linha vazia rotulada como vazia e nunca preenchida por inferência. Regras: nunca inventar resposta, uma pergunta por vez, registrar frases vívidas literalmente, pressionar uma vez e não duas, parar quando o usuário marcar limite e registrar em "Fora de limites", nunca preencher o banco a partir de perfil raspado. |
| **Adaptado** | A entrevista deixa de ser uma sessão de terminal e vira um fluxo de produto (tela "Entrevista" no Story Bank, Farol/UX definem). O banco de perguntas é traduzido e reescrito para PT-BR (`editorial-system.md` §4.3). "Nunca escrever o banco em arquivo rastreado" vira: Story Bank é dado de usuário no PostgreSQL, nunca em Git, nunca em fixtures reais de teste. |
| **Rejeitado** | Uso de Apify para "acelerar" com atividade do perfil. Qualquer inferência de números a partir de contexto. |

### 4.2 `linkedin-post-writer`

**No upstream:** escolhe uma fórmula por objetivo (comentários / reposts / likes / saves), redige,
roda o humanizer, oferece ilustração via Pixfaro, mostra "approval card", publica via Publora.

| Decisão | Itens |
|---|---|
| **Adotado** | Ordem de leitura: Voice Profile e Story Bank antes de qualquer rascunho; detalhes concretos vêm do banco, nunca do modelo. Espinha de entrevista tem prioridade sobre a fórmula ("escolha a fórmula que cabe na espinha, não o contrário"). Pelo menos um momento de risco real ou fato desconfortável datado, dito sem moldura. Uma menção ao próprio produto no máximo. Nunca abrir em caixa alta. |
| **Adaptado** | Catálogo de fórmulas PT-BR com subconjunto permitido (ver §3, `hook-formulas.md`). "Pick by goal first" vira campo `editorialGoal` no brief, mas o objetivo é editorial (o que o leitor deve fazer), não "qual reação farmar". Regra "nunca abrir com pergunta" entra como **aviso** (nível de evidência: fornecedor), não como bloqueio. Comprimento: faixa padrão 900–1.300 caracteres como sugestão; limite duro 3.000 (limite do LinkedIn). "Approval card" vira o card do Estúdio de Rascunho (EPIC-04). Humanizer pass vira etapa de pipeline com relatório estruturado. |
| **Rejeitado** | Publora, Pixfaro, `lib.publish`, agendamento por SaaS. "Founder mode" automático (depende de pergunta aberta). "Sugerir janela de postagem Tue/Wed/Thu 7:30–9:00 AM local" (fuso e evidência errados para nós; o calendário é de Rodrigo). "Reaction targets from likely commenters" (não existe sem scraping). |

### 4.3 `linkedin-humanizer`

**No upstream:** reescritor em 4 passes (SCRUB por densidade, RHYTHM, ADD, SELF-CHECK) com três
tiers (forensic / strict / aesthetic), modo `audit` (checklist pass/fail), modo `profile`
(constrói Voice Profile a partir de 3–6 posts), sub-skills de emoji, detectores externos,
ilustração e "rules-explainer".

| Decisão | Itens |
|---|---|
| **Adotado** | Arquitetura em 4 passes e a ideia central: **o sinal é densidade por parágrafo, não palavra isolada** (1 marcador = português normal; 3+ = assinatura). Travessão limitado (~1 a cada 100 palavras), nunca trocado por ponto. Variância forçada de frases é um tell, não uma correção. Tríades empilhadas ou ocas são tell; uma natural fica. Proibido inserir hedges, confissões emolduradas ou "anúncios de sinceridade" ("vou ser sincero", "confesso que"). Guarda de sobrecorreção: edições proporcionais ao problema; em dúvida, deixar. Preservar fatos, números e entidades do input; nunca introduzir fatos. Não prometer passar em detectores de IA. |
| **Adaptado** | Toda a lista de vocabulário, frases-ponte, aberturas e fechamentos é **reescrita para PT-BR** (`editorial-system.md` §8), marcada como hipótese inicial porque a evidência do upstream é sobre inglês. O tier "aesthetic" fica desligado por padrão e só entra se o Voice Profile pedir. Modo `audit` vira o schema `QualityEvaluation` (`structured-outputs.md` §6) e a rubrica §7 do sistema editorial. Modo `profile` vira a tela/fluxo de Voice Profile a partir de amostras coladas por Rodrigo (sem Apify). Detector de emoji: a tabela de frequência é de um post viral do MagicPost (fev/2026), evidência fraca; mantemos só a regra de cluster (3+ emojis "de IA" no mesmo post, ou mesmo emoji repetido) como aviso. |
| **Rejeitado** | `detector-tester` (envia o texto de Rodrigo para 5 serviços externos; conflito com privacidade e com "segredos nunca em prompts de terceiros"). `illustration.md` (Pixfaro). `rules-explainer` (material educativo para um post polêmico do autor; não é produto). Quirks de voz do autor como regra ("minúsculas no início", `..`). As alegações de reach por frase ("-4,9%" etc.) como fato. |

### 4.4 `linkedin-content-planner`

**No upstream:** plano de 7 dias com pilares (Authority 40–50% / Narrative 30–40% / Community
20–30% / Product 10–15%), fórmula por dia, horário, "comment targets" diários, checklist de
prontidão para inbound.

| Decisão | Itens |
|---|---|
| **Adotado** | Disciplina de pilares com guardrails: 3 a 5 pilares, nenhum pilar acima de 60% da semana, pilar de produto/oferta no máximo 1 por semana, não repetir fórmula em 7 dias, variar formato dentro do pilar. "Planejar contra um Story Bank vazio enche o calendário de temas que nenhum rascunho consegue executar": o calendário puxa do banco. Os 5 tipos narrativos do pilar pessoal (lição dolorosa, resultado de cliente, opinião contrária, bastidores, mudança de perspectiva). |
| **Adaptado** | Nosso ritmo é fixo pelo produto (curadoria seg/qua/sex 09:00 America/Sao_Paulo; publicação quando Rodrigo decidir). O "plano semanal" vira a visão de calendário com verificação de mix de pilares e repetição (EPIC-02/04, com Sextante para detecção de repetição). Os pilares default do upstream são substituídos por pilares de Rodrigo (proposta em `editorial-system.md` §2, pergunta aberta). |
| **Rejeitado** | Horários "Tue 8:00 AM ET" e tabelas por fuso. Cotas de comentários (10–20/dia, 70/20/10 por tipo de perfil), "giants strategy" (comentar 1–5 min antes de o grande perfil publicar), protocolo de cold-start com DMs diárias ("o algoritmo lê DM como sinal de confiança", sem fonte), "team overlap prevention", "comment to unlock" como tipo de CTA (contradiz o próprio aviso sobre F6 no upstream), alegação "6+ posts/semana aciona canibalização no 360Brew". |

### 4.5 `linkedin-profile-optimizer`

**No upstream:** scorecard de 9 componentes do perfil, fórmula de headline
`[O que faz] | [Para quem] [Resultado]`, About em 7 passos, Featured por objetivo, bullets de
experiência `verbo + métrica`, URL customizada, recomendações.

| Decisão | Itens |
|---|---|
| **Adotado** | Entrada por **texto colado** (o próprio upstream reconhece que perfil não pode ser buscado); nunca pontuar seção não mostrada, nunca inferir conteúdo a partir da URL. Primeira pessoa. Proibir "apaixonado por", "profissional orientado a resultados", chains de emoji, caixa alta. Bullets com verbo + métrica, só com métricas que Rodrigo forneça (Story Bank §Receipts). |
| **Adaptado** | Vira EPIC-09 "sugestões de melhoria de perfil, sem edição automática": output é um relatório estruturado (`ProfileSuggestion`, esboço em `structured-outputs.md` §8) com antes/depois por seção, sempre aplicado manualmente por Rodrigo. Headline e About reescritos em PT-BR; a estrutura de 7 passos vira sugestão, não fórmula fixa. Observação: o template de About do upstream abre com pergunta, enquanto as fórmulas de post proíbem abrir com pergunta; tratamos ambos como recomendações de contexto diferente, sem força de regra. |
| **Rejeitado** | Todos os "benchmarks" (3,9x views, 71% mais entrevistas, 14x com foto etc.): fonte "co.actor research", sem metodologia. Especificações de banner/foto como regra (ficam como dica opcional de UX se o Farol quiser). "Comment AUDIT on my latest post" como CTA de perfil (comment-gate). |

### 4.6 `linkedin-comment-drafter`

**No upstream:** a partir da URL, busca o post via Apify, detecta pergunta de fechamento, gera
1–3 variantes com 7 templates (T1 Missing-Piece … T7 Ask-a-Sharper-Question), escolhe reação,
publica via Publora; modo reshare.

| Decisão | Itens |
|---|---|
| **Adotado** | Os 7 templates como catálogo PT-BR de padrões de comentário (`editorial-system.md` §6.4). Anti-padrões: elogio genérico, "Isso!", "100%", tese reafirmada, marcar terceiros para alcance, citar o próprio produto em post alheio. Comentário de 200–350 caracteres com um insight afiado e, quando couber, uma pergunta específica. Pular posts patrocinados ou listicles genéricos. |
| **Adaptado** | EPIC-08: Rodrigo fornece a URL **e cola o texto do post** (não há API oficial para ler posts de terceiros arbitrários; não fazemos scraping). O comentário é sempre um, aprovado, publicado via API oficial se e somente se a permissão existir (Pêndulo/Sentinela confirmam escopo; caso contrário, fluxo "copiar e colar"). Reação sugerida vira sugestão textual; a escolha é de Rodrigo. |
| **Rejeitado** | Apify. "Reagir antes de comentar, pausar 8–15 s para parecer humano" (simular comportamento humano é exatamente o que não fazemos). Templates "SALES-T1/T2" de aquecimento de contas-alvo (prospecção disfarçada). "Estar entre os 3 primeiros comentários de um viral" como objetivo. Alegações "author-reply probability ~15%". |

### 4.7 `linkedin-reply-handler`

**No upstream:** responde a um comentário ou varre uma thread inteira; resolve a regra de
achatamento em 2 níveis do LinkedIn (`parentComment` sempre o comentário de topo); filtra
comentários de baixo valor; publica em lote, um a um, para não disparar rate limit.

| Decisão | Itens |
|---|---|
| **Adotado** | Templates R1–R5 (responder a pergunta, conceder e afiar, estender a tese, experiência vivida, devolver pergunta) como catálogo PT-BR. Regras: nunca "obrigado!" vazio; toda resposta do autor traz um detalhe novo, um nome ou uma pergunta; nunca responder ao próprio comentário; thread com mais de 72 h não recebe resposta automática. A regra técnica do achatamento em 2 níveis (parent = comentário de topo) é **fato de API** e vai para o contrato do Pêndulo, com teste. |
| **Adaptado** | Só faz sentido para comentários **nos posts de Rodrigo**, e só se a API oficial permitir ler esses comentários com os escopos que teremos (pergunta aberta para Pêndulo/Sentinela; não assumir). Mesmo assim, uma resposta por vez, aprovada no dashboard. "Sweep" em lote não entra no MVP. Filtro de baixo valor entra como classificação (`CommentTriage`, fase posterior). |
| **Rejeitado** | Apify, varredura em lote, "publicar um por vez para não parecer automação" como motivação (não publicamos em lote por princípio, não por evasão). Comentários de terceiros tratados como instruções (regra de injection reforçada). |

### 4.8 `linkedin-hook-extractor`

**No upstream:** classifica o gancho de um post viral em F1–F20 com score de confiança,
extrai estrutura, gera template em branco, audita "tells" do original.

| Decisão | Itens |
|---|---|
| **Adotado** | Classificação de fórmula com confiança e top-2 quando ambíguo; "free-form narrative" quando nenhuma fórmula dispara; cautelas sobre o original (não copiar os tells do post viral). Regras de feature extraction (`classification-rules.md`) como ponto de partida para um classificador determinístico em TS. |
| **Adaptado** | Dois usos internos: (a) etiquetar o `hookFormula` dos próprios rascunhos e hooks alternativos (`structured-outputs.md` §4); (b) analisar um post que Rodrigo **cole** para aprender a estrutura, sem buscar nada. Saída em PT-BR; a regra "não inglês = pular classificação" do upstream é invertida: PT-BR é o padrão e inglês é opcional. |
| **Rejeitado** | Apify. "Replicar o padrão de um criador" como objetivo de produto (risco de imitação; só estrutura, nunca texto). |

### 4.9 `linkedin-repurposer`

**No upstream:** transforma tweet, thread, vídeo, blog ou newsletter em post nativo: extrai a
espinha, re-hook antes da dobra, expande para 900–1.300 caracteres, move links para o primeiro
comentário, roda o humanizer.

| Decisão | Itens |
|---|---|
| **Adotado** | "Repurposing transforma, não gera": manter a **alegação e os fatos** da fonte intactos, mudar só a entrega. Remover artefatos de outra plataforma. Nunca colar e aparar. |
| **Adaptado** | Vira o modo "entrada manual de assunto com fonte própria" do Estúdio: Rodrigo cola um texto seu (artigo, talk, README, thread) e o pipeline gera um post com `sourcesUsed` apontando para a fonte. "Link no primeiro comentário" vira `firstCommentSuggestion` no output, publicado só se Rodrigo aprovar como segundo passo explícito. |
| **Rejeitado** | Publora, "janela de postagem" por fuso dos EUA, repurposing de conteúdo de terceiros (direitos autorais e autenticidade). |

### 4.10 `linkedin-thread-monitor`

**No upstream:** acompanha quais comentários de Rodrigo em posts alheios receberam resposta do
autor, classifica threads (hot/warm/cool/dormant) e sugere DM quando a thread morre.

| Decisão | Itens |
|---|---|
| **Adotado** | Apenas a regra editorial: não encadear 3+ respostas sob um comentário; não responder a thread com mais de 72 h; se o autor apagou a resposta, não insistir. |
| **Adaptado** | Nada no MVP. A ideia "lembrar Rodrigo de voltar a uma conversa" pode virar uma nota manual no dashboard (Farol decide), sem monitoramento automático. |
| **Rejeitado** | Depende inteiramente de scraping de comentários em posts de terceiros. Roteamento para DM (não há API; e é prospecção). "Warm-up / seeding / reply within 90 min = +90% boost" (alegações sem fonte). Tabela de "engagement half-life". "Peer group seguro vs pod" (orientação para contornar detecção de pods). |

---

## 5. Alegações sobre o algoritmo: o que é heurística não oficial

O upstream cita três tipos de fonte: o paper 360Brew (arXiv 2501.16450, modelo de ranking do
LinkedIn, que descreve arquitetura e **não** publica pesos de sinais), dados agregados de
ferramentas de terceiros (AuthoredUp, MagicPost, "Co.Actor customer data") e listas
crowd-sourced de "tells". O próprio upstream rotula parte disso como `[vendor]`, `[crowd]`,
`[consensus]`, `[inference]` e diz "reported; not officially confirmed".

**Regra do produto:** nenhuma alegação abaixo vira verdade do produto, texto de UI afirmativo,
KPI ou bloqueio de publicação. Elas podem aparecer apenas como *recomendação editorial* com o
rótulo de evidência, na forma "recomendamos X; evidência: relato de fornecedor, não oficial".

| Alegação do upstream | Classificação | Tratamento no LinkedIn Ops |
|---|---|---|
| Janela de 60–90 min decide 80% do alcance; responder a todo comentário em 90 min | Não oficial | Não entra. Responder a comentários é bom senso editorial; sem percentuais. |
| Save = 5x like; comentário longo = 3x like; share = 2x | Não oficial (atribuído ao 360Brew, que não publica pesos) | Rejeitado. Sextante usa só métricas da API. |
| Multiplicadores por formato (carrossel 1,7–2,3x; link no corpo 0,4–0,6x; imagem única 0,7x) | Dados de ferramenta (AuthoredUp) | Rejeitado como número. "Link no corpo tende a reduzir alcance" vira recomendação com rótulo "relato de ferramentas, não oficial". |
| Melhor horário: ter/qua/qui 7:30–9:00 na manhã do público; evitar seg cedo, sex tarde, fim de semana (-30–50%) | Não oficial; fuso errado | Rejeitado. Horário é decisão de Rodrigo com dados próprios da API, quando existirem. |
| 0 hashtags = 5+; 1–3 nicho = +5%; 5+ = spam | Não oficial | Recomendação "0–2 hashtags no fim", sem percentual. |
| Pergunta na primeira linha -34%; número ímpar na primeira linha +34%; P.S. +7,5%; pergunta no fim +3% | Fornecedor (MagicPost, "proprietary AI-score") | Entram como **avisos** na rubrica com rótulo "fornecedor"; nunca bloqueiam. |
| "Stop X, start Y" -6,7%; "It's not X, it's Y" -4,9%; "The result?" -4,8%; "Here's what" -4,3% | Fornecedor | Os padrões são tratados como **clichês** (motivo editorial, independente de reach). O percentual não entra. |
| 1.000+ caracteres 1,18x; 20+ frases 1,14x | Dados de ferramenta (AuthoredUp) | Não entra. Faixa de comprimento é sugestão editorial. |
| Detecção de pods com 97% de precisão; shadowban 3–14 dias; queda de 8.500 para 340 impressões; recuperação em 6–8 semanas | Relato de terceiros, "unconfirmed" no próprio upstream | Rejeitado integralmente. Não fazemos pods, logo não precisamos de heurística para evitá-los. |
| Edição estrutural nas primeiras 3 h "reseta a distribuição"; >20% do texto alterado reseta | Não oficial | Vira aviso de UX leve: "edições grandes logo após publicar podem afetar distribuição (relato não oficial)". |
| "Dwell time ideal 31–60 s"; "see more + abandono <3 s = penalidade de clickbait"; "viewer tolerance score" | Não oficial / inferência | Rejeitado. |
| Botão "AI slop" de jul/2026 corta ~40% das views; atualização de autenticidade de mar/2026 mira comment-gates | O upstream rotula como `[platform]`, mas não há link para comunicado oficial no material | **Não verificado.** Sentinela deve checar fontes oficiais do LinkedIn antes de qualquer menção. Independentemente disso, não usamos comment-gate por regra própria. |
| "360Brew usa embeddings semânticos, não hashtags"; "2+ posts/dia aciona canibalização no 360Brew"; "ranker roda NLP em comentários e recompensa ≥12 palavras e novas keywords" | Inferência apresentada como fato | Rejeitado. O paper 360Brew descreve um modelo de ranking baseado em LLM; não documenta essas regras. |
| Comentários bem feitos recebem 30–75x mais likes que posts próprios; comentários geram 60–70% das DMs inbound; 87% dos vendedores… | Marketing / sem fonte | Rejeitado. |
| Perfil otimizado 3,9x views; 5+ skills 3x pedidos de conexão; foto 14x views; banner +23% | "co.actor research" | Rejeitado. |
| Limite de 3.000 caracteres por post; achatamento de threads em 2 níveis; 3 formatos de URN | **Fatos de API/produto** (verificáveis na documentação oficial) | Adotados, com validação pelo Pêndulo contra a documentação oficial da API, não contra o upstream. |

### 5.1 Inconsistências internas do upstream (registradas para não herdar)

- Corte do gancho: 210 caracteres (regra geral), 140 (mobile, em `algorithm-heuristics.md`),
  265–275 (About, no profile-optimizer). Adotamos **210 como alvo e 140 como alvo conservador**,
  rotulados como "estimativa de UI, verificar no app".
- `humanizer-checklist.md` pede "300–400 palavras, 20+ frases" e ao mesmo tempo "900–1.300
  caracteres (~150–220 palavras)". Adotamos a faixa em caracteres como sugestão e tratamos
  "20+ frases" como não aplicável.
- `founder-topics.md` ainda fala em "no em dashes" enquanto a V3 do humanizer "limita em vez de
  banir". Adotamos a V3.
- O planner exemplifica CTA "comment to unlock" enquanto `hook-formulas.md` rebaixa F6 e o
  audit sinaliza comment-gate. Rejeitamos o CTA.
- O eval `case_humanizer_audit_flags_blockers` exige que o audit sinalize "em dash" como blocker,
  contradizendo a própria V3 ("um travessão não é blocker"). Nossa rubrica trata travessão por
  densidade.

---

## 6. Proposta de pinning (para o Atlas decidir no ADR-0006)

Requisitos: reproduzível, sem dependência de runtime, atribuição MIT preservada, baixo ruído
no repositório, fácil de re-auditar quando o upstream mudar.

| Opção | Descrição | Prós | Contras |
|---|---|---|---|
| **A. Snapshot seletivo** (recomendada; = ADR-0006) | Copiar para `packages/editorial-engine/upstream/linkedin-skills/` apenas `LICENSE`, `README.md` (seção de atribuição) e os arquivos Markdown dos quais derivamos texto (`references/*.md` e as `skills/<10 relevantes>/**/*.md`, ~470 KB, sem imagens, sem Python). Um arquivo `UPSTREAM.lock.json` ao lado registra URL, commit, tag, data e a lista de caminhos copiados com hash SHA-256. Script `packages/editorial-engine/scripts/sync-upstream.ts` regenera o snapshot a partir do commit fixado e falha se o hash divergir. | Reproduzível e auditável offline; o diff de uma atualização do upstream aparece no PR; atribuição trivial; zero dependência de runtime; tamanho pequeno. | Conteúdo duplicado no repo; exige disciplina para não editar o snapshot (proteger via CODEOWNERS e verificação de hash em CI). |
| B. `git subtree` | `git subtree add --prefix=vendor/linkedin-skills <url> <commit> --squash`. | Histórico do upstream preservado; atualização com `subtree pull`. | Traz 3 MB incluindo imagens, Python, scripts, pacote Codex gerado e `.claude/skills` com symlinks (problemáticos no Windows); mistura código de terceiros não usado na árvore; subtree é conhecido por conflitos em squash; tenta ao time a "usar a lib". |
| C. Só referência | Registrar commit/tag neste documento e nada mais. | Zero ruído. | Não reproduzível se o upstream reescrever histórico ou sumir; dificulta auditoria de licença e de "de onde veio esta lista"; a Sentinela não consegue revisar o material offline. |

**Recomendação de Pena:** opção **A**, que coincide com a proposta do Atlas em
`docs/adr/0006-linkedin-skills-upstream-pinning.md` (snapshot + `UPSTREAM.lock.json` + script de
sync + exclusão de build + checagem em CI de que `src/` não importa de `upstream/`). Respostas de
Pena aos pontos abertos do ADR-0006:

| Ponto aberto (ADR-0006) | Posição de Pena |
|---|---|
| (a) Caminho: dentro do pacote vs `vendor/` na raiz | **Dentro do pacote**: `packages/editorial-engine/upstream/linkedin-skills/`. Fica na área que eu mantenho, não altera a estrutura baseline e deixa o diff de adaptação ao lado do código derivado. Retiro a sugestão de `docs/editorial/upstream/`; este documento continua sendo o índice humano. |
| Conteúdo vendorizado | Além das 10 pastas de skill, **incluir `references/`** (9 arquivos: `voice-profile.md`, `story-bank.md`, `voice-rules.md`, `hook-formulas.md`, `algorithm-heuristics.md`, `untrusted-content.md`, `founder-topics.md`, `industry-benchmarks.md`, `engagement-metrics-taxonomy.md`). As skills citam `../../references/` e a maior parte do material derivado vem daí; sem essa pasta o snapshot fica sem as fontes principais. Excluir imagens, Python, `scripts/`, `.codex-marketplace/`, `.claude/`. |
| (b) `README.md` completo ou aviso resumido | **Aviso resumido**: `LICENSE` literal + `NOTICE.md` com título, URL, commit, tag, data, copyright e a seção "License" do README. O README completo é majoritariamente instalação/marketing de serviços que não usamos. |
| (c) Cadência de sync | **Manual, por evento**: re-auditar quando o upstream publicar tag que toque um caminho vendorizado, ou no mínimo trimestralmente; cada sync é uma tarefa de backlog com atualização do lock, deste documento e dos cabeçalhos de atribuição afetados. Nunca automático. |
| Regras adicionais | O snapshot é somente leitura; nenhum código importa dele; toda derivação cita `skill/arquivo @ commit` no cabeçalho; o lock inclui hash SHA-256 por arquivo para o CI detectar edição manual. |

---

## 7. Perguntas abertas que precisam de decisão de Rodrigo

1. **Pilares editoriais reais.** Proposta provisória em `editorial-system.md` §2; precisa de
   validação (e de 3–6 posts reais de Rodrigo para calibrar a voz).
2. **Rodrigo se posiciona como fundador/criador de produto?** Define se o catálogo de ângulos
   "fundador" (A1–A10) fica ativo.
3. **Inglês opcional: quando?** Proposta: post em PT-BR por padrão; inglês só se a oportunidade
   vier de fonte em inglês e Rodrigo marcar "versão EN" no brief.
4. **Comentários assistidos (EPIC-08):** aceita o fluxo "URL + texto colado" como entrada, dado
   que não leremos posts de terceiros por API?
5. **Travessão e tríades:** o upstream limita; sua voz usa travessão? A resposta sai da
   entrevista de voz, mas vale confirmar a preferência.
6. **Nomes citáveis:** empresas, clientes e pessoas que podem aparecer em posts (Story Bank §8)
   precisam de lista explícita; sem ela o motor fica genérico por desenho.

---

## 8. Histórico

| Data | Mudança |
|---|---|
| 2026-10-13 | Versão inicial. Upstream `bfa41ff5` / `v1.1.19` analisado integralmente nas 10 skills do briefing. |
