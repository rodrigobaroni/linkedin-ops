# T-053 · Trilha de auditoria (append-only) e consulta

- Épico: EPIC-10 Security, Reliability & Deployment
- Responsável (papel/agente): Alicerce (backend) · UI com Vitral (subtarefa na mesma branch se pequena)
- Branch/floor: `feat/T-053-audit-log`
- Estado: todo
- Dependências: T-005, T-008, T-015

## Contexto

PRD §8.1 e §9: toda transição e decisão (seleção, descarte, versões, aprovações humanas e automáticas, agendamentos, publicações, troca de modo, alterações de política, conexões de integração) é registrada e consultável por item e globalmente; exportável em JSON.

## Resultado esperado

`AuditEvent` (ator `user|policy|system`, tipo, entidade, `before/after` resumidos, `correlationId`, timestamp) com escrita via serviço único; endpoints `GET /audit?entity=&from=&to=&type=` e `GET /content-items/:id/timeline`; export JSON; tela Auditoria (log global com filtros) e linha do tempo no Estúdio.

## Critérios de aceite (verificáveis)

- [ ] Nenhum endpoint permite alterar/apagar eventos (teste).
- [ ] Linha do tempo de um item publicado mostra todos os passos de J4 passo 4.
- [ ] Troca de modo e aprovação automática aparecem com razão completa.
- [ ] Eventos não contêm segredos nem texto completo de post (só IDs e resumos).

## Fora de escopo

Retenção/arquivamento (Fase 2).

## Plano de teste

Supertest; Playwright para a tela.

## Riscos de segurança / compliance

Integridade da trilha; acesso restrito ao `userId`.
