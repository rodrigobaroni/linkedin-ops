# T-032 · Item de conteúdo, versões e aprovações: state machine e API

- Épico: EPIC-04 Draft Studio
- Responsável (papel/agente): Alicerce (backend) · revisão Atlas
- Branch/floor: `feat/T-032-content-item-versions-api`
- Estado: todo
- Dependências: T-004, T-005, T-008, T-015

## Contexto

Núcleo transacional do PRD §8: estados `SELECTED → … → PUBLISHED/FAILED/DISCARDED`, versões imutáveis, aprovação vinculada a versão, revogação ao editar, concorrência otimista.

## Resultado esperado

Serviço de domínio com transições validadas pelo `contracts`; endpoints: `GET /content-items`, `GET /content-items/:id`, `GET /content-items/:id/versions`, `POST /content-items/:id/versions` (edição manual; `If-Match`/`baseVersionId` para conflito), `POST /content-items/:id/versions/:vid/restore`, `POST /content-items/:id/approve` (versão específica, `approvedBy = user`, razão opcional), `POST /content-items/:id/discard`, `POST /content-items/:id/open-review`. Cada transição grava `AuditEvent`. Edição em `APPROVED`/`SCHEDULED` revoga aprovação, libera slot e volta a `IN_REVIEW`.

## Critérios de aceite (verificáveis)

- [ ] Tabela de transições do PRD §8.2 coberta por testes (permitidas e proibidas).
- [ ] Criar versão com `baseVersionId` desatualizado retorna 409 com a versão atual.
- [ ] Aprovar versão X e depois criar versão Y deixa o item `IN_REVIEW` sem aprovação ativa; `Approval` de X permanece no histórico.
- [ ] Versões e aprovações nunca são alteradas/apagadas (teste de append-only).
- [ ] Limite de 3 000 caracteres validado no contrato.

## Fora de escopo

Geração (T-033), agendamento (T-041), política automática (T-044).

## Plano de teste

Supertest + Testcontainers; teste de concorrência com duas requisições simultâneas.

## Riscos de segurança / compliance

Escopo por `userId` em todas as consultas; auditoria obrigatória.
