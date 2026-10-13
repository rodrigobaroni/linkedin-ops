# PRD — LinkedIn Ops

- Versão: 0.2 (Onda 1 — alinhamento do Maestro; semântica dos modos conforme decisão provisória, ver §13.11)
- Data: 2026-10-13
- Autor: Farol (Product & Delivery Lead)
- Fonte canônica do briefing: `docs/product/maestro-prompt.md`
- Documentos relacionados: `user-journeys.md`, `mvp-scope.md`, `docs/backlog/README.md`
- Status: v0.2 após alinhamento do Maestro (2026-10-13); aguardando ratificação de Rodrigo. Perguntas abertas marcadas com **[DECISÃO RODRIGO]** ou **[DEPENDE: agente]**.

---

## 1. Visão

LinkedIn Ops é uma aplicação web self-hosted que opera, de ponta a ponta, a estratégia editorial do perfil pessoal de Rodrigo no LinkedIn. O sistema observa fontes configuradas, propõe **cinco oportunidades editoriais** três vezes por semana, e só produz um post completo depois que Rodrigo escolhe uma delas. O post é editado, aprovado, agendado e publicado pela API oficial do LinkedIn, com histórico, auditoria e três níveis de autonomia.

A tese do produto: **menos volume, mais critério.** O gargalo de quem publica com consistência não é escrever, é decidir *sobre o que* escrever com relevância e sem perder a própria voz. O sistema resolve a decisão (curadoria + justificativa) e acelera a execução (rascunho com voz própria), mantendo Rodrigo como autor.

## 2. Problema

| Dor atual | Consequência | O que o produto faz |
|---|---|---|
| Acompanhar dezenas de fontes manualmente é caro e inconstante | Pautas boas passam; publicação vira esporádica | Coleta, deduplica, classifica e ranqueia automaticamente, três vezes por semana |
| Ferramentas de IA genéricas escrevem com voz artificial e inventam experiências | Conteúdo soa falso; risco reputacional | Voice Profile + Story Bank + regras de autenticidade: nada de histórias ou números inventados |
| Fluxos n8n anteriores geravam posts prontos sem escolha prévia | Desperdício de geração; decisão editorial feita pela máquina | Geração só após seleção humana; a IA propõe, Rodrigo decide |
| Publicar via browser automation/scraping viola políticas | Risco de bloqueio da conta | Somente OAuth e APIs oficiais; sem Selenium/Playwright, sem scraping |
| Sem rastreabilidade de versões, aprovações e fontes | Não se sabe o que foi publicado, por quê, com que base | Versionamento de rascunhos, fontes vinculadas, auditoria de cada decisão |

## 3. Personas

### 3.1 Rodrigo — autor e operador (único usuário inicial)

- Engenheiro de software e líder técnico; publica sobre engenharia, IA aplicada, liderança técnica e carreira. **[DEPENDE: Pena]** confirmar pilares editoriais no `editorial-policy`.
- Quer publicar 2–3 vezes por semana com qualidade, sem gastar mais de ~20 minutos por post.
- Valoriza autenticidade: prefere não publicar a publicar algo que não diria.
- Usa o dashboard no desktop para decidir e editar; usa o celular (Telegram) para ser avisado.
- Tolerância a risco baixa com a conta do LinkedIn: nunca aceita automação que viole políticas.

### 3.2 Personas futuras (não são escopo, mas moldam o modelo de dados)

- **Operador delegado** (assistente/ghostwriter que prepara, Rodrigo aprova): exige papéis e separação entre "quem edita" e "quem aprova".
- **Segundo autor** (outro perfil pessoal na mesma instância): exige escopo por usuário em fontes, voz, Story Bank, tokens e publicações.

Requisito derivado: toda entidade de domínio pertence a um `userId`; a autorização é verificada no servidor; nenhum segredo (token OAuth) é compartilhado entre usuários.

## 4. Objetivos e métricas de sucesso

### 4.1 Objetivos do produto (12 semanas após o MVP em produção)

| # | Objetivo | Métrica | Meta |
|---|---|---|---|
| O1 | Curadoria confiável | % de ciclos (seg/qua/sex) que entregam os cards até 09:10 `America/Sao_Paulo` | ≥ 95 % |
| O2 | Curadoria relevante | % de ciclos em que Rodrigo seleciona ao menos 1 oportunidade | ≥ 60 % |
| O3 | Rascunho com voz própria | Mediana da proporção de caracteres alterados entre a versão gerada e a publicada | ≤ 30 % |
| O4 | Velocidade de decisão | Mediana do tempo entre seleção da oportunidade e aprovação da versão | ≤ 20 min |
| O5 | Publicação confiável | Publicações duplicadas causadas por retry | 0 |
| O5b | Publicação confiável | % de publicações agendadas executadas em até 5 min do horário | ≥ 98 % |
| O6 | Consistência | Posts publicados por semana | 2–3 |
| O7 | Autenticidade | Posts publicados com afirmação factual relevante sem fonte vinculada (auditoria amostral) | 0 |

### 4.2 Métricas de guarda (não podem piorar)

- Zero publicações fora do modo de autonomia configurado (verificável em auditoria).
- Zero segredos em logs, Git, frontend ou prompts (secret scanning em CI + revisão de Sentinela).
- Zero ações no LinkedIn fora das APIs oficiais.

Observação: métricas de desempenho de posts (impressões, reações) dependem do que a API do LinkedIn disponibiliza para perfis pessoais. Não serão prometidas no PRD até que Pêndulo/Sentinela confirmem os endpoints e escopos disponíveis. **[DEPENDE: Pêndulo, Sentinela]**

## 5. Escopo por fase

Detalhe por épico em `mvp-scope.md`. Resumo:

| Fase | Conteúdo | Critério de saída |
|---|---|---|
| **MVP (Fase 1)** | EPIC-00 Foundation · EPIC-01 Product & Design · EPIC-02 Identity & Editorial Memory · EPIC-03 Sources & Opportunities · EPIC-04 Draft Studio · EPIC-05 Scheduling & Publishing · EPIC-06 Notifications · essenciais do EPIC-10 | Rodrigo completa o ciclo "card → seleção → rascunho → aprovação → agendamento → publicação real" em modo assistido, em produção (Oracle Cloud), com Telegram avisando, por 2 semanas sem incidente de duplicação ou vazamento |
| **Fase 2** | EPIC-07 Analytics (eventos, métricas disponíveis, recomendações semanais) · ativação dos modos piloto automático em produção (o MVP entrega motor e UI; ativação só após 2 semanas de Assistido sem incidente) · cards de código se cortados do MVP | Recomendação semanal entregue 4 semanas seguidas; modo controlado usado por ≥ 2 semanas sem publicação indevida |
| **Fase 3** | EPIC-08 Assisted Engagement (comentário a partir de URL) · EPIC-09 Profile Optimization · idioma inglês no motor · repurposing | Dentro das políticas do LinkedIn; revisão de Sentinela |

Durante o MVP, EPIC-07/08/09 recebem apenas contratos (taxonomia de eventos, esqueleto de telas), sem atrasar a publicação confiável.

## 6. Modos de autonomia

> **Decisão provisória do Maestro (2026-10-13), a ratificar por Rodrigo (§13.11):** adotada a semântica modelada por Atlas em `docs/architecture/data-model.md` (`AutonomyMode = ASSISTED | AUTOPILOT_CONTROLLED | AUTOPILOT_FULL`). Nomes em PT-BR na UI: **Assistido**, **Piloto automático controlado**, **Piloto automático completo**.

### 6.1 Princípios

1. **Padrão = Assistido.** Uma instalação nova nasce em Assistido; mudar de modo é ação explícita.
2. **Nada é publicado sem uma versão aprovada.** A aprovação é humana (Rodrigo) ou automática por política (`Approval.actor = SYSTEM`). Aprovação automática sempre grava a razão (6.5).
3. **O modo governa decisões automáticas; nunca restringe ações manuais.** Em qualquer modo Rodrigo pode selecionar, editar, regenerar, aprovar, agendar, publicar ou descartar.
4. **Mídia sempre exige humano por padrão.** `require_human_for_media = true`: nenhum modo aprova ou publica automaticamente uma versão com imagem, code-card ou documento; o item para em `IN_REVIEW` com aviso "mídia exige sua aprovação". Rodrigo pode desligar essa trava na política (gera auditoria).
5. **Telegram notifica; não aprova nem cancela.** Aprovação e cancelamento acontecem no dashboard. Comandos via Telegram ficam para fase posterior (§13.5).
6. **Guardrails valem em todos os modos**, mas só bloqueiam ação automática. Para ação manual geram aviso, não bloqueio (exceto limites da política do LinkedIn, como 3 000 caracteres).

### 6.2 Matriz de automação

| Etapa | Assistido (padrão) | Piloto automático controlado | Piloto automático completo |
|---|---|---|---|
| Coleta, dedup, classificação, 5 oportunidades | Automático | Automático | Automático |
| Seleção da oportunidade | **Rodrigo**. Opção `assistedPrefetchDraft` (desligada por padrão): o sistema pré-gera rascunho da melhor candidata elegível e propõe slot, sem aprovar nada | Automática: melhor candidata que passe G1–G4 e G8, dentro de `allowed_pillar_ids` e com `score ≥ auto_approve_min_score`; Rodrigo pode trocar | Automática, idem |
| Geração do rascunho | Após seleção (ou pré-geração opcional) | Automática | Automática |
| Edição / regeneração | Rodrigo | Rodrigo (opcional, a qualquer momento antes de `PUBLISHING`) | Rodrigo (opcional; após publicado, só no LinkedIn) |
| Aprovação da versão | **Rodrigo, explícita** | **Automática por política** se G5–G10 passam e sem mídia; senão `IN_REVIEW` + "precisa de você" | Idem |
| Agendamento | Rodrigo escolhe o slot (sugestão exibida) | Automático no próximo slot livre da janela configurada que respeite `now + cancel_window_minutes` | Automático no próximo slot livre |
| Publicação | No slot, só se `APPROVED` por Rodrigo | No slot, **somente se** a notificação "vai publicar" foi enviada há ≥ `cancel_window_minutes` (padrão 60) e o item não foi cancelado/editado | No slot, sem janela de cancelamento |
| Notificação Telegram | Lote pronto; rascunho pronto; aguardando aprovação; agendado; publicado; falhas | + "Vai publicar *<título>* em <data/hora>; cancele até <hora> no dashboard" (`AUTOPILOT_WILL_PUBLISH`) + "publicado automaticamente (razão)" | "Publicado automaticamente (razão)" após o fato; `AUTOPILOT_WILL_PUBLISH` opcional como aviso informativo |

### 6.3 O que cada modo exige de aprovação explícita

- **Assistido:** selecionar, aprovar versão e confirmar agendamento. Sem aprovação, o item fica em `IN_REVIEW` até expirar ou ser descartado. Com `assistedPrefetchDraft` ligado, Rodrigo recebe "rascunho pronto, proposto para <slot>" e ainda precisa aprovar e confirmar.
- **Controlado:** nenhuma, desde que todos os gates passem e não haja mídia. A intervenção humana é **por exceção**: cancelar, editar ou reagendar dentro da janela de cancelamento. Se Rodrigo editar, a aprovação automática é revogada (`IN_REVIEW`) e o item só volta a publicar com aprovação humana.
- **Completo:** nenhuma; sem janela. Mesmas exceções de gate e de mídia. Pensado para quando o controlado já rodou semanas sem intervenção.

### 6.4 Guardrails (quality gates) para ação automática

Avaliados pelo motor editorial (Pena: veredito `pass | warn | fail` de `docs/editorial/structured-outputs.md`) e pela política de autonomia (Alicerce), com resultado gravado por versão:

| Gate | Regra (proposta inicial) | Bloqueia seleção automática | Bloqueia aprovação automática |
|---|---|---|---|
| G1 Fonte válida | Toda oportunidade tem ≥ 1 fonte com URL de domínio permitido e `publishedAt` conhecido | Sim | Sim |
| G2 Atualidade | `publishedAt` dentro da janela de atualidade (padrão 7 dias; manual isento) | Sim | — |
| G3 Score mínimo | `score ≥ auto_approve_min_score` (valor inicial **[DEPENDE: Sextante]**) e pilar em `allowed_pillar_ids` | Sim | — |
| G4 Diversidade | Mesmo pilar não publicado nos últimos 2 posts; mesmo cluster não publicado nos últimos 30 dias; mix de pilares conforme `editorial-system.md` §2.2 | Sim | Aviso |
| G5 Fidelidade factual | Veredito editorial sem `fact.unsupported` nem `experience.invented`; `factRefs` todos `supported`; `slots` vazio | — | Sim |
| G6 Voz e naturalidade | Veredito `pass`; `warn` → ver §13.18 (proposta: segura e notifica); `fail` bloqueia | — | Sim |
| G7 Tópicos sensíveis e nomes | Sem blocker `safety.off-limits` / `safety.naming`; entidades só com `namingPolicy = public`; lista de tópicos que exigem revisão humana (configurável) | — | Sim |
| G8 Limites de cadência | `max_auto_posts_per_week` (padrão 3) e 1/dia; dentro da janela de publicação; fora de `quiet_hours` | Sim | Sim |
| G9 Integração saudável | Token LinkedIn `ACTIVE` com margem ≥ 24 h; última chamada sem erro de autorização | — | Sim |
| G10 Idioma e formato | Idioma configurado (PT-BR padrão); ≤ 3 000 caracteres; sem URL no corpo; sem mídia (ou `require_human_for_media = false`) | — | Sim |

Em Assistido, os gates aparecem como *badges* no card e no rascunho (verde/amarelo/vermelho) para apoiar a decisão humana, sem bloquear.

### 6.5 Registro da razão da aprovação automática

Toda aprovação automática gera um registro imutável `Approval` com:

- `draftVersionId`, `actor = SYSTEM`, `policyId` e `policyVersion` (a política é versionada; mudar limiar cria nova versão).
- `autonomyMode` vigente e `reason` legível em PT-BR, por exemplo: "Aprovado automaticamente pela política v3 (piloto automático controlado): score 0,82 ≥ 0,70; pilar engineering-ai permitido; 4 afirmações com fonte; veredito editorial pass; sem mídia; 2º post da semana (limite 3)."
- `gateResults[]` com cada gate, valor medido, limiar e resultado; `evalRunId` da execução de eval.
- `cancelWindowEndsAt` (controlado) e `notifiedAt`.
- Espelhado como `AuditEvent`, consultável na linha do tempo do item e exportável.

Aprovações humanas também geram registro (`actor = USER`, `reason` opcional).

### 6.6 Janela de cancelamento (piloto automático controlado)

- Após aprovação automática, o item vai a `SCHEDULED` para o próximo slot livre que respeite `now + cancel_window_minutes` (padrão **60 min**, mínimo técnico 15 min; §13.4). A notificação `AUTOPILOT_WILL_PUBLISH` é enviada imediatamente, com link profundo.
- O despacho para `PUBLISHING` só ocorre se a notificação foi enviada há ≥ `cancel_window_minutes`; se o envio falhou (Telegram fora), a central interna conta como notificação e o Telegram fica em fila, mas o despacho **espera** a janela contada a partir do registro interno.
- Dentro da janela, no dashboard: **Cancelar** (volta a `APPROVED`, slot liberado, não re-agenda automaticamente), **Editar** (revoga aprovação, `IN_REVIEW`), **Reagendar** (mantém aprovação; nova janela conta do novo slot).
- Piloto automático completo não tem janela: publica no slot e notifica depois.

### 6.7 Troca de modo

- Local: Configurações › Autonomia. Três cartões com descrição de "o que acontece sem você" e os guardrails ativos.
- Subir de autonomia (assistido → controlado → completo) exige reautenticação (ADR-0007) e aceite de um resumo do que passa a acontecer sem você.
- Descer de autonomia é imediato, sem reautenticação.
- Efeitos na troca:
  - **Subir:** vale para decisões futuras. Itens existentes não são reprocessados (nada é aprovado retroativamente).
  - **Descer:** toda aprovação automática ainda não publicada é revogada: itens `SCHEDULED`/`APPROVED` com `Approval.actor = SYSTEM` voltam a `IN_REVIEW`, o slot é liberado e Rodrigo recebe a lista. Itens aprovados por humano não mudam.
- Toda troca e toda edição de política geram `AuditEvent` com modo/versão anterior, novo, horário e método de confirmação. O modo é por usuário.

## 7. As cinco oportunidades editoriais

### 7.1 Ciclo

- **Gatilho:** segunda, quarta e sexta-feira às 09:00 `America/Sao_Paulo`, timezone explícito no agendador (não "hora do servidor"). Se o horário local não existir ou for ambíguo por mudança de horário de verão, usar a primeira ocorrência válida após 09:00.
- **Janela de coleta:** itens com `publishedAt` desde o ciclo anterior, com retroativo máximo de 7 dias (configurável) para absorver fontes lentas. Itens sem data são tratados como "data desconhecida" e penalizados no score, nunca descartados silenciosamente.
- **Pipeline:** coletar → normalizar → deduplicar → classificar (pilar, público) → pontuar → selecionar 5 com restrições de diversidade → publicar o lote (`opportunity_batch`) no dashboard → notificar.
- **Prazo:** o lote deve estar disponível até 09:10. Se o pipeline falhar, o sistema tenta novamente (backoff) até 3 vezes e, persistindo, notifica "curadoria de hoje falhou" com o motivo, sem apresentar lote parcial como se fosse completo.
- **Execução manual:** botão "Rodar curadoria agora" no dashboard, limitado a 1 execução manual por hora, gera um lote extra marcado como `manual`.

### 7.2 Regras de seleção

- Exatamente 5 oportunidades por lote quando houver candidatos suficientes acima do limiar.
- Diversidade: no máximo 2 por pilar editorial e no máximo 2 originadas da mesma fonte; ao menos 1 de "assunto quente" (publicado nas últimas 48 h) se existir.
- Nunca repetir assunto (mesmo cluster de dedup) de oportunidade `selected` ou `dismissed` nos últimos 30 dias, salvo desdobramento novo (nova fonte com `publishedAt` posterior) — nesse caso o card indica "atualização de assunto já visto".
- Se houver menos de 5 candidatos acima do limiar: apresentar os que passaram e preencher os slots restantes com os melhores abaixo do limiar, marcados visivelmente como "abaixo do limiar de relevância". O sistema não inventa candidatos. **[DECISÃO RODRIGO]** alternativa: mostrar menos de 5 e deixar slots vazios.

### 7.3 Campos do card (contrato §13 do briefing + complementos de produto)

| Campo | Origem | Exibição |
|---|---|---|
| `title` (assunto) | Motor editorial | Título do card, ≤ 90 caracteres |
| `summary` (resumo) | Motor editorial, 2–3 frases, PT-BR, sem opinião atribuída a Rodrigo | Corpo |
| `sourceIds[]` → fontes | Coletor | Nome da fonte, domínio, link externo (abre em nova aba, `rel=noopener`); múltiplas fontes listadas |
| `publishedAt` + atualidade | Coletor | "há 6 h", "ontem", "há 5 dias"; badge "data desconhecida" quando nulo |
| `contentPillar` | Classificador | Chip colorido (cor por pilar) |
| `targetAudience` | Classificador | Texto curto ("líderes técnicos", "devs sênior") |
| `relevanceReason` | Motor editorial | "Por que isso importa agora": 1–2 frases |
| `suggestedAngle` | Motor editorial | Ângulo proposto, em 1 frase, com indicação se depende de experiência própria (puxa Story Bank) |
| `suggestedFormat` | Classificador | `text` · `code-card` · `image` · `carousel` (carousel só se suportado pela API) |
| `score` | Ranking | Barra/valor 0–1 e badges dos gates (6.4) |
| `status` | Estado | `candidate` · `selected` · `dismissed` · `expired` |
| Ações | — | **Selecionar**, **Descartar** (motivo opcional: "não é meu tema", "já vi", "fonte fraca", "outro"), **Ver fontes** |

Todo texto vindo de fonte externa é dado não confiável: é exibido escapado, nunca interpretado, e os prompts do motor o recebem em blocos marcados como conteúdo, não como instrução.

### 7.4 Expiração e oportunidades não escolhidas

- Um lote é válido até o início do ciclo seguinte (seg → qua 09:00; qua → sex 09:00; sex → seg 09:00). Ao abrir o novo lote, os `candidate` do lote anterior passam a `expired`.
- Expiradas e descartadas ficam no histórico (filtro "lotes anteriores") por 90 dias, somente leitura, com a possibilidade de **"Reativar"** (cria uma oportunidade `selected` a partir da expirada, marcando origem). Alimentam o ranking futuro (EPIC-07): assunto descartado com motivo "não é meu tema" reduz score do cluster.
- Selecionar mais de uma oportunidade no mesmo lote é permitido; cada seleção cria seu próprio item de conteúdo. O dashboard avisa quando há mais de 1 item em andamento na mesma semana. **[DECISÃO RODRIGO]** confirmar.
- Lotes `manual` não expiram os lotes regulares.

### 7.5 Entrada manual de assunto

- Disponível a qualquer momento ("Novo assunto"). Campos: título (obrigatório), notas/ângulo (opcional), URLs de referência (opcional, cada uma coletada e normalizada como fonte `manual`), pilar (opcional, senão classificado), formato (opcional).
- Cria uma oportunidade com `status = selected` imediatamente e inicia a geração, com `relevanceReason = "Assunto informado manualmente"`. É isenta do gate G2 (atualidade) e do limiar de score, mas **não** é isenta de G5 (fidelidade): se Rodrigo escreve "nós reduzimos o custo em 40 %", isso vira fato fornecido pelo autor e aparece como tal nas fontes do rascunho (origem "autor"), nunca como fato inventado.

## 8. Ciclo de vida do conteúdo

### 8.1 Entidades

- **Opportunity** (oportunidade): o card. Estados `candidate | selected | dismissed | expired`.
- **ContentItem** (item de conteúdo): criado na seleção; carrega o estado do fluxo e aponta para a oportunidade.
- **ContentVersion** (versão): texto, hooks alternativos, fontes usadas, sugestão de mídia, metadados de geração (modelo, prompt version, eval). Imutável após criada.
- **Approval**: vincula uma versão a quem aprovou (humano ou política) com razão.
- **Schedule**: slot com `scheduledAt` em UTC + `timezone` explícito (`America/Sao_Paulo`) + versão aprovada.
- **Publication**: tentativa de publicação com `idempotencyKey`, `linkedinPostUrn`, resultado.
- **AuditEvent**: trilha imutável de toda transição e decisão.

### 8.2 Estados do item de conteúdo (§13 do briefing, com complementos)

```text
OPPORTUNITY(selected) → SELECTED → GENERATING → DRAFT → IN_REVIEW → APPROVED → SCHEDULED → PUBLISHING → PUBLISHED
                                       │             │          │          │            │            ↘ FAILED
                                       ↓             ↓          ↓          ↓            ↓
                                   DISCARDED     DISCARDED  DISCARDED  DISCARDED   (unschedule → APPROVED)
```

| Estado | Significado | Entradas | Saídas permitidas |
|---|---|---|---|
| `SELECTED` | Rodrigo (ou política) escolheu a oportunidade; item criado | seleção | `GENERATING`, `DISCARDED` |
| `GENERATING` | Job de geração em execução | enfileirar geração | `DRAFT` (sucesso), `SELECTED` (falha com mensagem; retry manual ou automático até 3×) |
| `DRAFT` | Existe ≥ 1 versão; nenhuma em revisão formal | geração concluída | `IN_REVIEW` (abrir no estúdio), `GENERATING` (regenerar → nova versão), `DISCARDED` |
| `IN_REVIEW` | Rodrigo está editando/revisando; edições criam versões | abrir no estúdio; rebaixamento por gate; descer de modo | `APPROVED`, `GENERATING`, `DISCARDED` |
| `APPROVED` | Uma versão específica aprovada (humana ou política) | aprovar | `SCHEDULED`, `IN_REVIEW` (qualquer edição revoga a aprovação e cria nova versão), `DISCARDED` |
| `SCHEDULED` | Slot definido com timezone explícito, apontando para a versão aprovada | agendar | `PUBLISHING` (no slot), `APPROVED` (desagendar), `IN_REVIEW` (editar), `DISCARDED` |
| `PUBLISHING` | Job de publicação em andamento com `idempotencyKey` | scheduler | `PUBLISHED`, `FAILED` |
| `PUBLISHED` | LinkedIn confirmou; `linkedinPostUrn` gravado; terminal | sucesso | — (ações: ver no LinkedIn, copiar link; exclusão no LinkedIn fica fora do MVP) |
| `FAILED` | Publicação falhou após retries | erro | `SCHEDULED` (reagendar/retentar), `IN_REVIEW`, `DISCARDED` |
| `DISCARDED` | Descartado por Rodrigo; terminal; mantém histórico | descartar | — |

Regras:

- **Regenerar cria nova versão; nunca apaga a anterior.** A versão "atual" é a mais recente; qualquer versão pode ser restaurada (isso cria nova versão cópia).
- **Publicar exige versão aprovada** (humana ou por política com razão registrada). O job de publicação verifica, no momento da execução, que a versão agendada ainda é a aprovada, que o modo de autonomia ainda permite e, no piloto automático controlado, que a janela de cancelamento já decorreu desde a notificação — caso contrário aborta para `IN_REVIEW` (ou adia, no caso da janela) e notifica.
- **Idempotência:** `idempotencyKey` derivada de (item, versão, agendamento), gravada **antes** da chamada; um retry com a mesma chave consulta a `Publication` existente e nunca cria segundo post. Se a API aceitou mas a resposta se perdeu (resultado ambíguo), o item vai para `FAILED` com `needs_reconciliation` e **não há retry automático**: a reconciliação (manual ou por alerta) consulta o URN antes de qualquer nova tentativa. Mecanismo detalhado em `docs/adr/0003-idempotent-publishing.md` (Atlas); este PRD segue o ADR.
- **Concorrência:** edição simultânea (duas abas) usa versão otimista; a segunda gravação recebe conflito e vê o diff.
- **Timezone:** todo `scheduledAt` é armazenado em UTC com `timezone` IANA ao lado; a UI exibe sempre em `America/Sao_Paulo` (configurável por usuário).

### 8.3 Conteúdo da geração (após seleção)

- Post completo (PT-BR padrão; inglês opcional por item), respeitando Voice Profile e pilares.
- 3 alternativas de hook (primeira linha), com a usada marcada.
- Fontes utilizadas, cada uma com URL e trecho citado/parafraseado; afirmações factuais marcadas no texto com referência à fonte.
- Sugestão de mídia: `none | image | code-card | carousel`, com descrição e, para `code-card`, o snippet e o render local (Satori/Sharp/Resvg) como prévia.
- Metadados: modelo, versão de prompt, resultado de evals e gates.

## 9. Requisitos funcionais por área (resumo; detalhamento no backlog)

- **Autenticação:** login single-user com sessão segura; preparado para multiusuário. Método **[DEPENDE: Atlas, Sentinela]**.
- **Voice Profile:** tom, vocabulário preferido/evitado, estrutura típica, exemplos de posts aprovados, temas que não publica. Versionado; usado em toda geração.
- **Story Bank:** histórias/fatos/dados pessoais fornecidos por Rodrigo, com tags de pilar e "pode usar publicamente". Único repositório de experiência própria que a IA pode citar.
- **Fontes e watchlists:** cadastro de RSS/Atom e lista de domínios permitidos; watchlist de termos/entidades que elevam score; teste de fonte na hora do cadastro; pausa/retomada; saúde da fonte (último sucesso, erros).
- **Curadoria:** lote com 5 cards, histórico de lotes, descartar com motivo, rodar agora, novo assunto manual.
- **Estúdio de rascunho:** editor com contagem de caracteres (limite do LinkedIn 3 000), prévia fiel, hooks alternativos, painel de fontes, versões com diff, regenerar com instrução, badges de gates.
- **Aprovação e agendamento:** aprovar versão, calendário semanal/mensal, sugestão de slot, arrastar para reagendar, desagendar.
- **Publicação:** texto e imagem via API oficial; status e link do post; falhas com motivo e retry.
- **Integrações:** conectar/desconectar LinkedIn (OAuth), estado do token e validade; conectar Telegram (chat autorizado); testar notificação.
- **Notificações:** Telegram + central interna; eventos: lote pronto, rascunho pronto, aguardando aprovação, agendado, publicado, falha, token expirando, aprovação automática, slot perdido, curadoria falhou.
- **Auditoria:** linha do tempo por item e log global filtrável; exportável em JSON.
- **Configurações:** modo de autonomia e guardrails, janela de publicação, idioma, timezone de exibição, retenção.

## 10. Requisitos não funcionais

| Área | Requisito |
|---|---|
| Segurança | OAuth 2.0 com escopos mínimos; tokens cifrados em repouso (chave fora do banco); cookies `HttpOnly/Secure/SameSite`; CSRF; rate limit em login e callbacks; webhook Telegram com segredo; nenhum segredo em logs, frontend ou prompts; conteúdo externo sanitizado e tratado como dado |
| Conformidade | Apenas APIs oficiais do LinkedIn; sem scraping, browser automation ou engajamento inautêntico; respeito a rate limits; LGPD: dados pessoais mínimos, retenção configurável (padrão 90 dias para itens coletados; indefinida para publicados), exportação e exclusão sob demanda |
| Confiabilidade | Jobs duráveis (pg-boss) com retry exponencial e dead-letter; publicação idempotente; scheduler tolerante a reinício (não perde nem duplica ciclos); health checks; backup diário do Postgres e do storage com restore testado |
| Desempenho | Ciclo de curadoria concluído em ≤ 10 min para até 50 fontes / 2 000 itens; geração de rascunho ≤ 60 s (p95); dashboard interativo ≤ 2 s (p95) em rede doméstica |
| Observabilidade | Logs estruturados (Pino) com `correlationId` por job/requisição; OpenTelemetry; alertas para: ciclo não executado, publicação falhou, token a expirar, fila com DLQ > 0 |
| Acessibilidade | WCAG 2.2 AA: navegação por teclado, contraste, foco visível, rótulos; responsivo (desktop primário, mobile para leitura e aprovação) |
| Idioma | UI e docs de produto em PT-BR; motor editorial PT-BR padrão, inglês opcional; código/APIs em inglês |
| Evolução | Entidades com `userId`; autorização no servidor; adaptadores substituíveis (LLM, publicação, notificação, coleta) |
| Operação | Self-hosted em Docker Compose + Caddy (TLS automático) em Oracle Cloud; variáveis em `.env` (ver `.env.example`); migrations versionadas com rollback documentado |

## 11. Fora de escopo (todas as fases, salvo decisão contrária)

- Operar o LinkedIn por browser automation, scraping, bots de engajamento, compra de interações ou automação de DMs.
- Páginas de empresa (organizations), anúncios, newsletters do LinkedIn, eventos.
- Publicar em outras redes (X, Bluesky, Threads) — pode virar adaptador futuro, não é meta.
- Comentar automaticamente em posts de terceiros sem URL fornecida por Rodrigo (EPIC-08 é sempre assistido e por URL).
- Editar o perfil do LinkedIn automaticamente (EPIC-09 só recomenda).
- Métricas que a API não fornece para perfis pessoais.
- Inventar experiências, números, opiniões ou histórias; "humanizar" por meio de fatos fictícios.
- Multiusuário com times e papéis (apenas preparo no modelo).
- Aplicativo móvel nativo.
- Dependência de runtime em Claude Code, Codex ou arquivos `SKILL.md`.

## 12. Riscos de produto

| Risco | Impacto | Mitigação |
|---|---|---|
| Acesso à API de publicação do LinkedIn (produto "Share on LinkedIn"/escopo `w_member_social`) com limitações ou aprovação demorada | Bloqueia EPIC-05 | Pêndulo/Sentinela validam escopos e limites na primeira semana; fallback: fluxo "copiar e publicar manualmente" com status `PUBLISHED_MANUALLY` **[DECISÃO RODRIGO]** se aceita esse fallback no MVP |
| Curadoria irrelevante nas primeiras semanas (cold start) | O2 não atinge meta | Watchlists e pilares bem configurados desde o início; motivo de descarte alimenta ranking; revisão semanal com Pena/Sextante |
| Voz artificial | Reputação | Voice Profile com exemplos reais; evals de naturalidade; G6 bloqueia aprovação automática |
| Prompt injection por fontes | Conteúdo manipulado | Conteúdo externo como dado; testes adversariais no harness de evals; revisão de Sentinela |
| Excesso de automação cedo demais | Publicação indevida | Padrão Assistido; subir de modo exige reautenticação; janela de cancelamento no controlado; mídia exige humano; rebaixar revoga aprovações |
| Rodrigo não usa o dashboard no horário | Lotes expiram sem seleção | Telegram com link profundo; lote válido até o próximo ciclo; reativar expiradas |

## 13. Perguntas abertas

Consolidadas também na note `product-brief`. Itens 12–19 vêm dos documentos de Pena, Sentinela e Atlas e apontam o doc de origem; não estão duplicados lá.

**[DECISÃO RODRIGO]**
1. Com menos de 5 candidatos acima do limiar: preencher com candidatos marcados "abaixo do limiar" (proposta) ou exibir menos de 5?
2. Permitir mais de uma seleção por lote (proposta: sim, com aviso de volume)?
3. Janela de publicação padrão (proposta: seg/qua/sex entre 10:00 e 12:00 `America/Sao_Paulo`) e meta de cadência (proposta: 2–3 posts/semana, máx. 1/dia, `max_auto_posts_per_week = 3`).
4. `cancel_window_minutes` do piloto automático controlado (proposta: 60; mínimo técnico 15).
5. Comando de cancelamento/aprovação via Telegram em fase posterior (proposta MVP: não; Telegram só notifica)?
6. Aceitar fallback "copiar e publicar manualmente" se a API do LinkedIn atrasar? (Sentinela, SEC-001 em `docs/security/threat-model.md`, recomenda não implementar fallback não autorizado; a proposta é um estado `PUBLISHED_MANUALLY` apenas para registro, sem automação.)
7. Cards de código no MVP ou na Fase 2 (proposta: MVP como último item do EPIC-04, candidato a corte)? Lembrete: mídia sempre exige aprovação humana (§6.1.4).
8. Lista inicial de fontes RSS/Atom, domínios permitidos e watchlist (necessária para a primeira curadoria real).
9. Lista de tópicos sensíveis que sempre exigem revisão humana (G7) e `allowed_pillar_ids` iniciais do piloto automático.
10. Remote GitHub: criar repositório (conta pessoal) para habilitar PRs, Issues e CI?
11. **Semântica dos modos piloto automático — decisão provisória do Maestro (2026-10-13), ratificar:** Assistido = humano aprova tudo (com opção de pré-gerar rascunho e propor slot); Controlado = auto-aprova e agenda, notifica, janela de cancelamento de `cancel_window_minutes` antes de publicar; Completo = sem janela; mídia sempre exige humano por padrão. Este PRD v0.2 já segue essa semântica. A leitura anterior (controlado com aprovação humana obrigatória) foi preservada como a opção `assistedPrefetchDraft` do Assistido.
12. **Pilares editoriais reais e participação de cada um** — proposta provisória em `docs/editorial/editorial-system.md` §2.1.
13. **`founderMode`** (ângulos de fundador, `editorial-system.md` §5.3): ligar ou não.
14. **Quando gerar versão em inglês** (`editorial-system.md` §6): por item sob demanda (proposta), por pilar, ou nunca no MVP.
15. **Política de travessão, emoji e hashtags** (`editorial-system.md` §14.4; sai da entrevista do Voice Profile, confirmar valores).
16. **Nomes citáveis / nunca citáveis** (Story Bank `namingPolicy`, `editorial-system.md` §14.5 e `upstream-mapping.md` §7).
17. **Comentários assistidos (EPIC-08) com entrada "URL + texto colado"** (`editorial-system.md` §14.6, `upstream-mapping.md` §7): aceitar esse fluxo, dado que não há leitura de posts pela API?
18. **Veredito `warn` em piloto automático:** publica com aviso ou segura? Proposta de Pena e deste PRD: **segura em `IN_REVIEW` e notifica**, nos dois modos piloto (`editorial-system.md` §14.7).
19. **Retenção e exclusão de dados (LGPD)** — SEC-003 em `docs/security/threat-model.md` e `docs/security/data-and-lgpd.md`: confirmar 90 dias para itens coletados, indefinido para publicados, exportação/exclusão sob demanda (T-063).
20. **Orçamento mensal de evals com modelo real** (`docs/editorial/evals-plan.md` §9).

**[DEPENDE: agentes]**
- Atlas: contrato final de `AutonomyPolicy` e das transições (`data-model.md` §2.1 e §3); confirmação de `assistedPrefetchDraft` como campo da política.
- Pena: rubrica de naturalidade/voz, lista de clichês, limiares de G5/G6; formato do Voice Profile e do Story Bank (já proposto em `editorial-system.md`).
- Sextante: fórmula inicial do score e `auto_approve_min_score`; taxonomia de eventos (T-049).
- Aurora: layout dos 5 cards e badges de gates; fluxo de troca de modo com janela de cancelamento; calendário (T-011–T-014).
- Pêndulo/Sentinela: prova de acesso real à API (G-01, T-061); refresh token (SEC-002); formatos suportados (texto, imagem, documento).
