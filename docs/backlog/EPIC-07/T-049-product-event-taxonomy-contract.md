# T-049 · Taxonomia de eventos de produto (contrato gravado desde o MVP)

- Épico: EPIC-07 Analytics
- Responsável (papel/agente): Sextante (dados) · revisão Atlas
- Branch/floor: `feat/T-049-product-event-taxonomy`
- Estado: todo
- Dependências: T-004, T-005

## Contexto

Analytics é Fase 2, mas os eventos precisam ser gravados desde o MVP para medir O2–O6 do PRD §4 e alimentar o ranking com feedback. Nunca inventar métricas que a API do LinkedIn não fornece.

## Resultado esperado

Documento `docs/product/analytics-events.md` (PT-BR) + schema `ProductEvent` no `contracts` e tabela `product_events` (append-only): `opportunity.viewed/selected/dismissed{reason}`, `content.generated/regenerated/edited{charsChanged}`, `content.approved{by}`, `content.scheduled/rescheduled/unscheduled`, `publication.succeeded/failed`, `autonomy.changed`, `curation.ready/failed`; função `track(event)` usada pelos serviços; view SQL inicial para O2–O6.

## Critérios de aceite (verificáveis)

- [ ] Todo evento do catálogo tem schema Zod e exemplo.
- [ ] `track` é chamado nos serviços de T-029, T-032, T-034, T-039, T-041, T-044 (checklist por PR).
- [ ] View calcula O2 (taxa de seleção por ciclo) e O3 (mediana de edição) sobre fixtures.
- [ ] Nenhum campo de métrica do LinkedIn que a API não forneça.

## Fora de escopo

Dashboards, recomendações semanais (Fase 2).

## Plano de teste

Vitest nos schemas; SQL de view sobre fixtures em Testcontainers.

## Riscos de segurança / compliance

Eventos não guardam texto de post nem dados de terceiros; só IDs e contagens.
