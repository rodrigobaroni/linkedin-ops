# T-027 · Classificação (pilar, público, formato) e score de relevância

- Épico: EPIC-03 Sources & Opportunities
- Responsável (papel/agente): Pena (editorial/IA) · fórmula de score com Sextante
- Branch/floor: `feat/T-027-classification-and-scoring`
- Estado: todo
- Dependências: T-021, T-026, T-020

## Contexto

Cada cluster vira candidato a oportunidade com os campos do card (PRD §7.3): título, resumo, pilar, público, justificativa, ângulo, formato sugerido e score. A IA preenche campos editoriais via Structured Outputs; o score combina sinais determinísticos (atualidade, peso da fonte, watchlist, diversidade, histórico de descartes) com um sinal editorial.

## Resultado esperado

Função `scoreCandidate(cluster, context) → { fields, score, signals[] }` no `editorial-engine` + job `opportunities.classify`; `signals[]` explicável (ex.: `+0.10 watchlist: PostgreSQL`, `-0.15 data desconhecida`); limiar G3 configurável na política; versão da fórmula gravada no candidato.

## Critérios de aceite (verificáveis)

- [ ] Saída validada por schema; falha de IA marca candidato como `classificationFailed` e não derruba o ciclo.
- [ ] Item sem `publishedAt` é penalizado, não descartado.
- [ ] Sinais explicáveis exibíveis no card (contrato inclui `signals`).
- [ ] 20 clusters classificados em ≤ 60 s com concorrência 5.
- [ ] Resumo/justificativa nunca atribuem opinião a Rodrigo (eval de T-022 cobre).

## Fora de escopo

Aprendizado com feedback (Fase 2, Sextante).

## Plano de teste

Vitest com adaptador fake; eval de qualidade com amostra real sob flag.

## Riscos de segurança / compliance

Conteúdo externo como dado nos prompts; sem segredos.
