# T-029 · API de oportunidades e lotes (selecionar, descartar, reativar, manual)

- Épico: EPIC-03 Sources & Opportunities
- Responsável (papel/agente): Alicerce (backend)
- Branch/floor: `feat/T-029-opportunities-api`
- Estado: todo
- Dependências: T-008, T-015, T-004

## Contexto

Estados `candidate|selected|dismissed|expired` e as ações do card (PRD §7.3–7.5). Selecionar cria `ContentItem` em `SELECTED` e enfileira geração.

## Resultado esperado

Endpoints: `GET /opportunity-batches/current`, `GET /opportunity-batches?before=`, `POST /opportunities/:id/select` (cria `ContentItem`, enfileira `content.generate`, idempotente por oportunidade), `POST /opportunities/:id/dismiss` (motivo enum + texto), `POST /opportunities/:id/undismiss` (até expirar), `POST /opportunities/:id/reactivate` (expirada → nova `selected`), `POST /opportunities/manual` (título, notas, URLs, pilar, formato → `selected` + geração), `POST /curation/run-now` (limite 1/h). Auditoria em todas.

## Critérios de aceite (verificáveis)

- [ ] Selecionar duas vezes a mesma oportunidade retorna o mesmo `ContentItem` (idempotência).
- [ ] Descartar após expirar retorna 409.
- [ ] Manual com URL fora de domínio permitido é aceito com `warning` no retorno e fonte `manual`.
- [ ] `run-now` dentro de 1 h retorna 429 com `retryAfter`.
- [ ] OpenAPI atualizado.

## Fora de escopo

Pipeline (T-028), UI (T-030, T-031).

## Plano de teste

Supertest com Testcontainers.

## Riscos de segurança / compliance

Validação de URL (SSRF) na entrada manual; conteúdo como dado.
