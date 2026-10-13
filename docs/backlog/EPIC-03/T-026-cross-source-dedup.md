# T-026 · Deduplicação entre fontes e clusterização de assunto

- Épico: EPIC-03 Sources & Opportunities
- Responsável (papel/agente): Pêndulo (automação/integrações) · critério de similaridade com Sextante
- Branch/floor: `feat/T-026-cross-source-dedup`
- Estado: todo
- Dependências: T-025

## Contexto

A mesma notícia aparece em várias fontes. O lote precisa de assuntos distintos, e o guardrail G4 e a regra "não repetir assunto em 30 dias" dependem de um identificador de cluster.

## Resultado esperado

Job `items.cluster`: agrupa `SourceItem` por URL canônica idêntica, hash de título normalizado e similaridade textual (ex.: MinHash/Jaccard sobre shingles, ou embeddings se Atlas aprovar) acima de um limiar; cria/atualiza `TopicCluster` com item representativo e lista de fontes; clusters persistem para comparação com histórico de 30 dias.

## Critérios de aceite (verificáveis)

- [ ] Fixture com 20 itens de 3 fontes (7 assuntos reais) produz 7 clusters.
- [ ] Cluster expõe `sourceIds[]` para o card (múltiplas fontes).
- [ ] Reprocessar o mesmo conjunto é idempotente (mesmos clusters, sem duplicar).
- [ ] Desempenho: 2 000 itens em ≤ 2 min.

## Fora de escopo

Score (T-027).

## Plano de teste

Vitest com fixtures rotuladas; medição de precisão/recall simples.

## Riscos de segurança / compliance

Nenhum adicional.
