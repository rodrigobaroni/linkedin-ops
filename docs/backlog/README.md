# Backlog

Índice de épicos e tarefas. As tarefas vivem aqui como arquivos (espelhadas em GitHub Issues, ver seção GitHub)
`docs/backlog/<EPIC>/<T-NNN>-<slug>.md`. Cada tarefa segue o template em `docs/backlog/_template-task.md`.

Regras: numeração global `T-001…`; uma tarefa por branch/floor; estado atualizado pelo responsável
(`todo | in-progress | blocked | review | done`); dependências formam um grafo sem ciclos.
Referências de produto: `docs/product/prd.md`, `docs/product/user-journeys.md`, `docs/product/mvp-scope.md`.

## Épicos

| Épico | Nome | Prioridade | Owner(s) | Estado |
|---|---|---|---|---|
| EPIC-00 | Foundation | MVP | Estaleiro, Alicerce, Pêndulo, Vitral | planejado (T-001–T-008) |
| EPIC-01 | Product & Design | MVP | Farol, Aurora | em andamento (T-009–T-014) |
| EPIC-02 | Identity & Editorial Memory | MVP | Alicerce, Vitral, Pena | planejado (T-015–T-022) |
| EPIC-03 | Sources & Opportunities | MVP | Pêndulo, Alicerce, Pena, Vitral | planejado (T-023–T-031) |
| EPIC-04 | Draft Studio | MVP | Alicerce, Pêndulo, Vitral | planejado (T-032–T-037) |
| EPIC-05 | Scheduling & LinkedIn Publishing | MVP | Pêndulo, Alicerce, Vitral, Sentinela | planejado (T-038–T-045, T-061) |
| EPIC-06 | Notifications | MVP | Pêndulo, Vitral | planejado (T-046–T-048) |
| EPIC-07 | Analytics | pós-MVP (contrato no MVP) | Sextante | planejado (T-049) |
| EPIC-08 | Assisted Engagement | pós-MVP (Fase 3) | Pena | sem tarefas ainda |
| EPIC-09 | Profile Optimization | pós-MVP (Fase 3) | Pena | sem tarefas ainda |
| EPIC-10 | Security, Reliability & Deployment | MVP (essenciais) | Sentinela, Alicerce, Estaleiro, Pena, Crivo | planejado (T-050–T-060, T-062, T-063) |

## Ordem sugerida (marcos de `docs/product/mvp-scope.md`)

1. **M1 Fundação:** T-001 → T-002, T-003 → T-004 → T-005, T-008 → T-006, T-007; em paralelo T-050, T-051 → T-061 (G-01), T-059 e os docs de design T-011–T-014.
2. **M2 Memória + Fontes:** T-015, T-052 → T-016, T-018, T-020, T-021 → T-017, T-019, T-022, T-023 → T-024, T-025 → T-026 → T-027 → T-029 → T-028 → T-030, T-031.
3. **M3 Estúdio:** T-032 → T-033 → T-034 → T-035 → T-036; T-037 (corte).
4. **M4 Publicação:** T-038 → T-039 → T-040; T-041 → T-042 → T-043; T-044 → T-045; T-046 → T-047 → T-048; T-049, T-053.
5. **M5 Produção:** T-054, T-055, T-057, T-058, T-062, T-063 → T-056 → T-060.

## Gates de segurança (threat-model §8) ↔ tarefas

| Gate | Tarefas que produzem a evidência |
|---|---|
| G-01 escopos/endpoints reais | T-061 (prova com app real), T-051 (política) |
| G-02 cifra AEAD, rotação, sem tokens em DB/log/trace | T-052 |
| G-03 testes de callback OAuth | T-038 |
| G-04 publicação concorrente/timeout sem duplicata | T-039, T-042 |
| G-05 corpus adversarial falha fechado | T-058 (com T-022) |
| G-06 restore cifrado, secrets, Semgrep/Trivy/gitleaks | T-055, T-062, T-002 |
| Findings SEC-003 / SEC-004 / SEC-005 | T-063 / T-008 / T-062 |

## Tarefas

| ID | Épico | Título | Responsável | Estado | Dependências |
|---|---|---|---|---|---|
| [T-001](EPIC-00/T-001-monorepo-bootstrap.md) | EPIC-00 | Bootstrap do monorepo (pnpm + Turborepo) | Estaleiro (plataforma) | done | — |
| [T-002](EPIC-00/T-002-ci-pipeline.md) | EPIC-00 | Pipeline de CI (GitHub Actions) | Estaleiro (plataforma) | review | T-001 |
| [T-003](EPIC-00/T-003-docker-compose-dev.md) | EPIC-00 | Ambiente de desenvolvimento com Docker Compose | Estaleiro (plataforma) | todo | T-001 |
| [T-004](EPIC-00/T-004-contracts-package.md) | EPIC-00 | Pacote `contracts` (schemas Zod + tipos compartilhados) | Alicerce (backend) | review | T-001 |
| [T-005](EPIC-00/T-005-database-baseline-prisma.md) | EPIC-00 | Banco de dados base (PostgreSQL + Prisma + migrations) | Alicerce (backend) | todo | T-003, T-004 |
| [T-006](EPIC-00/T-006-worker-baseline-pg-boss.md) | EPIC-00 | Worker base (pg-boss, retries, DLQ, agendador com timezone) | Pêndulo (automação/integrações) | todo | T-003, T-005 |
| [T-007](EPIC-00/T-007-web-app-shell.md) | EPIC-00 | Shell do dashboard (Next.js App Router + shadcn/ui) | Vitral (frontend) | todo | T-001, T-011, T-014 |
| [T-008](EPIC-00/T-008-api-baseline-nestjs.md) | EPIC-00 | API base (NestJS, OpenAPI, erros, config) | Alicerce (backend) | todo | T-004, T-005 |
| [T-009](EPIC-01/T-009-prd-journeys-mvp-scope.md) | EPIC-01 | PRD, jornadas e mapa de escopo do MVP | Farol (produto) | review | — |
| [T-010](EPIC-01/T-010-initial-backlog.md) | EPIC-01 | Backlog inicial do MVP | Farol (produto) | review | T-009 |
| [T-011](EPIC-01/T-011-navigation-map-and-curation-wireframes.md) | EPIC-01 | Mapa de navegação e wireframes da Curadoria | Aurora (design) | todo | T-009 |
| [T-012](EPIC-01/T-012-draft-studio-wireframes.md) | EPIC-01 | Wireframes do Estúdio de rascunho | Aurora (design) | todo | T-011 |
| [T-013](EPIC-01/T-013-settings-memory-calendar-wireframes.md) | EPIC-01 | Wireframes de Calendário, Memória editorial, Fontes e Configurações | Aurora (design) | todo | T-011 |
| [T-014](EPIC-01/T-014-design-tokens-components-states.md) | EPIC-01 | Design tokens, padrões de componentes e estados | Aurora (design) | todo | T-011 |
| [T-015](EPIC-02/T-015-single-user-auth-sessions.md) | EPIC-02 | Autenticação single-user com sessão segura | Alicerce (backend) | todo | T-005, T-008 |
| [T-016](EPIC-02/T-016-voice-profile-model-api.md) | EPIC-02 | Voice Profile: modelo, versionamento e API | Alicerce (backend) | todo | T-008, T-015 |
| [T-017](EPIC-02/T-017-voice-profile-pillars-ui.md) | EPIC-02 | UI do Voice Profile, pilares e públicos | Vitral (frontend) | todo | T-007, T-013, T-016, T-020 |
| [T-018](EPIC-02/T-018-story-bank-model-api.md) | EPIC-02 | Story Bank: modelo e API | Alicerce (backend) | todo | T-008, T-015, T-020 |
| [T-019](EPIC-02/T-019-story-bank-ui.md) | EPIC-02 | UI do Story Bank | Vitral (frontend) | todo | T-007, T-013, T-018 |
| [T-020](EPIC-02/T-020-pillars-audiences-api.md) | EPIC-02 | Pilares editoriais e públicos: modelo e API | Alicerce (backend) | todo | T-008, T-015 |
| [T-021](EPIC-02/T-021-editorial-engine-baseline.md) | EPIC-02 | Pacote `editorial-engine` base (prompts versionados, Structured Outputs, adaptador OpenAI) | Pena (editorial/IA) | todo | T-001, T-004 |
| [T-022](EPIC-02/T-022-editorial-evals-harness.md) | EPIC-02 | Harness de evals editoriais | Pena (editorial/IA) | todo | T-021 |
| [T-023](EPIC-03/T-023-sources-model-api.md) | EPIC-03 | Fontes, domínios permitidos e watchlist: modelo e API | Alicerce (backend) | todo | T-008, T-015 |
| [T-024](EPIC-03/T-024-sources-settings-ui.md) | EPIC-03 | UI de Fontes, domínios e watchlist | Vitral (frontend) | todo | T-007, T-013, T-023 |
| [T-025](EPIC-03/T-025-feed-fetcher-normalization.md) | EPIC-03 | Coletor RSS/Atom e normalização de itens | Pêndulo (automação/integrações) | todo | T-006, T-023 |
| [T-026](EPIC-03/T-026-cross-source-dedup.md) | EPIC-03 | Deduplicação entre fontes e clusterização de assunto | Pêndulo (automação/integrações) | todo | T-025 |
| [T-027](EPIC-03/T-027-classification-and-scoring.md) | EPIC-03 | Classificação (pilar, público, formato) e score de relevância | Pena (editorial/IA) | todo | T-021, T-026, T-020 |
| [T-028](EPIC-03/T-028-curation-cycle-scheduler-and-batch.md) | EPIC-03 | Ciclo de curadoria seg/qua/sex 09:00 e seleção das 5 oportunidades | Pêndulo (automação/integrações) | todo | T-006, T-025, T-026, T-027, T-029 |
| [T-029](EPIC-03/T-029-opportunities-api-state-machine.md) | EPIC-03 | API de oportunidades e lotes (selecionar, descartar, reativar, manual) | Alicerce (backend) | todo | T-008, T-015, T-004 |
| [T-030](EPIC-03/T-030-curation-ui-five-cards.md) | EPIC-03 | UI de Curadoria (5 cards, lotes anteriores, descartar, rodar agora) | Vitral (frontend) | todo | T-007, T-011, T-014, T-029 |
| [T-031](EPIC-03/T-031-manual-topic-entry-ui.md) | EPIC-03 | UI de entrada manual de assunto | Vitral (frontend) | todo | T-030, T-029 |
| [T-032](EPIC-04/T-032-content-item-versions-approvals-api.md) | EPIC-04 | Item de conteúdo, versões e aprovações: state machine e API | Alicerce (backend) | todo | T-004, T-005, T-008, T-015 |
| [T-033](EPIC-04/T-033-draft-generation-job.md) | EPIC-04 | Job de geração do rascunho (post, hooks, fontes, mídia) | Pêndulo (automação/integrações) | todo | T-006, T-021, T-016, T-018, T-032 |
| [T-034](EPIC-04/T-034-regeneration-with-instruction.md) | EPIC-04 | Regeneração com instrução (nova versão) e troca de hook | Pêndulo (automação/integrações) | todo | T-033 |
| [T-035](EPIC-04/T-035-draft-editor-ui.md) | EPIC-04 | UI do Estúdio: editor, prévia, hooks, fontes, mídia | Vitral (frontend) | todo | T-007, T-012, T-014, T-032, T-034 |
| [T-036](EPIC-04/T-036-version-history-and-approval-ui.md) | EPIC-04 | UI de versões (diff, restaurar) e aprovação | Vitral (frontend) | todo | T-035 |
| [T-037](EPIC-04/T-037-code-card-local-rendering.md) | EPIC-04 | Render local de cards de código (Satori/Sharp/Resvg) | Pêndulo (automação/integrações) | todo | T-003, T-033 |
| [T-038](EPIC-05/T-038-linkedin-oauth-connect.md) | EPIC-05 | Conexão LinkedIn via OAuth 2.0 (conectar, desconectar, expiração) | Pêndulo (automação/integrações) | todo | T-008, T-015, T-052, T-061 |
| [T-039](EPIC-05/T-039-publish-text-post-idempotent.md) | EPIC-05 | Publicação de post de texto com idempotência e reconciliação | Pêndulo (automação/integrações) | todo | T-038, T-032, T-006 |
| [T-040](EPIC-05/T-040-publish-image-media.md) | EPIC-05 | Publicação com imagem (upload de mídia pela API oficial) | Pêndulo (automação/integrações) | todo | T-039, T-037 |
| [T-041](EPIC-05/T-041-schedule-model-and-api.md) | EPIC-05 | Agendamento: modelo, slots sugeridos e API | Alicerce (backend) | todo | T-032 |
| [T-042](EPIC-05/T-042-publishing-scheduler-job.md) | EPIC-05 | Scheduler de publicação no slot e tratamento de falhas | Pêndulo (automação/integrações) | todo | T-006, T-039, T-041 |
| [T-043](EPIC-05/T-043-calendar-and-scheduling-ui.md) | EPIC-05 | UI de Calendário e agendamento | Vitral (frontend) | todo | T-007, T-013, T-036, T-041, T-042 |
| [T-044](EPIC-05/T-044-autonomy-policy-engine.md) | EPIC-05 | Motor de política de autonomia (3 modos, guardrails, aprovação automática com razão) | Alicerce (backend) | todo | T-015, T-022, T-032, T-041, T-029 |
| [T-045](EPIC-05/T-045-autonomy-and-integrations-settings-ui.md) | EPIC-05 | UI de Autonomia e Integrações (LinkedIn) | Vitral (frontend) | todo | T-007, T-013, T-038, T-044 |
| [T-061](EPIC-05/T-061-linkedin-api-real-access-proof.md) | EPIC-05 | Prova de acesso real à API do LinkedIn (gate G-01) | Pêndulo (automação/integrações) | todo | T-051 |
| [T-046](EPIC-06/T-046-telegram-adapter-and-linking.md) | EPIC-06 | Adaptador Telegram (vínculo por código, chat autorizado, envio) | Pêndulo (automação/integrações) | todo | T-006, T-008, T-015 |
| [T-047](EPIC-06/T-047-notification-events-and-preferences.md) | EPIC-06 | Eventos de domínio → notificações, preferências e central interna (API) | Pêndulo (automação/integrações) | todo | T-046, T-028, T-033, T-039, T-044 |
| [T-048](EPIC-06/T-048-in-app-notifications-and-telegram-ui.md) | EPIC-06 | UI da central de notificações, preferências e vínculo do Telegram | Vitral (frontend) | todo | T-007, T-013, T-046, T-047 |
| [T-049](EPIC-07/T-049-product-event-taxonomy-contract.md) | EPIC-07 | Taxonomia de eventos de produto (contrato gravado desde o MVP) | Sextante (dados) | todo | T-004, T-005 |
| [T-050](EPIC-10/T-050-threat-model.md) | EPIC-10 | Threat model do LinkedIn Ops | Sentinela (segurança) | todo | T-009 |
| [T-051](EPIC-10/T-051-linkedin-api-policy-and-scopes.md) | EPIC-10 | Política de uso da API do LinkedIn, escopos e limites | Sentinela (segurança) | todo | — |
| [T-052](EPIC-10/T-052-secrets-and-token-encryption.md) | EPIC-10 | Gestão de segredos e cifra de tokens em repouso | Alicerce (backend) | todo | T-005, T-008, T-050 |
| [T-053](EPIC-10/T-053-audit-log.md) | EPIC-10 | Trilha de auditoria (append-only) e consulta | Alicerce (backend) | todo | T-005, T-008, T-015 |
| [T-054](EPIC-10/T-054-observability-baseline.md) | EPIC-10 | Observabilidade: logs estruturados, health checks, OpenTelemetry e alertas críticos | Estaleiro (plataforma) | todo | T-006, T-008 |
| [T-055](EPIC-10/T-055-backups-and-restore.md) | EPIC-10 | Backups do Postgres e do storage com restore testado | Estaleiro (plataforma) | todo | T-003 |
| [T-056](EPIC-10/T-056-production-deploy-oracle-cloud.md) | EPIC-10 | Deploy de produção (Oracle Cloud, Docker Compose, Caddy com TLS) | Estaleiro (plataforma) | todo | T-002, T-003, T-054, T-055 |
| [T-057](EPIC-10/T-057-session-and-web-hardening.md) | EPIC-10 | Endurecimento de sessão e web (cookies, CSRF, rate limit, cabeçalhos) | Alicerce (backend) | todo | T-015, T-050 |
| [T-058](EPIC-10/T-058-prompt-injection-defenses.md) | EPIC-10 | Defesas contra prompt injection e exfiltração via conteúdo externo | Pena (editorial/IA) | todo | T-021, T-022, T-025 |
| [T-059](EPIC-10/T-059-test-strategy-and-fixtures.md) | EPIC-10 | Estratégia de testes, fixtures e fault injection | Crivo (QA) | todo | T-001, T-004 |
| [T-060](EPIC-10/T-060-e2e-critical-flow.md) | EPIC-10 | E2E do fluxo crítico (curadoria → publicação) com fakes | Crivo (QA) | todo | T-059, T-030, T-036, T-043, T-039, T-047, T-044 |
| [T-062](EPIC-10/T-062-security-scans-ci-triage.md) | EPIC-10 | Scans de segurança em CI (Semgrep, Trivy, gitleaks) com triagem documentada (gate G-06) | Estaleiro (plataforma) | todo | T-002, T-003 |
| [T-063](EPIC-10/T-063-data-retention-export-deletion.md) | EPIC-10 | Retenção, exportação e exclusão de dados (LGPD) | Alicerce (backend) | todo | T-005, T-025, T-053 |

## GitHub

Repositório: <https://github.com/rodrigobaroni/linkedin-ops> (privado). Milestones = épicos; uma issue por tarefa (criadas em 2026-10-13). O arquivo da tarefa continua sendo a fonte de verdade; a issue é o espelho para PRs (`Closes #n`).

| Tarefa | Issue |
|---|---|
| T-001 | [#1](https://github.com/rodrigobaroni/linkedin-ops/issues/1) |
| T-002 | [#2](https://github.com/rodrigobaroni/linkedin-ops/issues/2) |
| T-003 | [#3](https://github.com/rodrigobaroni/linkedin-ops/issues/3) |
| T-004 | [#4](https://github.com/rodrigobaroni/linkedin-ops/issues/4) |
| T-005 | [#5](https://github.com/rodrigobaroni/linkedin-ops/issues/5) |
| T-006 | [#6](https://github.com/rodrigobaroni/linkedin-ops/issues/6) |
| T-007 | [#7](https://github.com/rodrigobaroni/linkedin-ops/issues/7) |
| T-008 | [#8](https://github.com/rodrigobaroni/linkedin-ops/issues/8) |
| T-009 | [#9](https://github.com/rodrigobaroni/linkedin-ops/issues/9) |
| T-010 | [#10](https://github.com/rodrigobaroni/linkedin-ops/issues/10) |
| T-011 | [#11](https://github.com/rodrigobaroni/linkedin-ops/issues/11) |
| T-012 | [#12](https://github.com/rodrigobaroni/linkedin-ops/issues/12) |
| T-013 | [#13](https://github.com/rodrigobaroni/linkedin-ops/issues/13) |
| T-014 | [#14](https://github.com/rodrigobaroni/linkedin-ops/issues/14) |
| T-015 | [#15](https://github.com/rodrigobaroni/linkedin-ops/issues/15) |
| T-016 | [#16](https://github.com/rodrigobaroni/linkedin-ops/issues/16) |
| T-017 | [#17](https://github.com/rodrigobaroni/linkedin-ops/issues/17) |
| T-018 | [#18](https://github.com/rodrigobaroni/linkedin-ops/issues/18) |
| T-019 | [#19](https://github.com/rodrigobaroni/linkedin-ops/issues/19) |
| T-020 | [#20](https://github.com/rodrigobaroni/linkedin-ops/issues/20) |
| T-021 | [#21](https://github.com/rodrigobaroni/linkedin-ops/issues/21) |
| T-022 | [#22](https://github.com/rodrigobaroni/linkedin-ops/issues/22) |
| T-023 | [#23](https://github.com/rodrigobaroni/linkedin-ops/issues/23) |
| T-024 | [#24](https://github.com/rodrigobaroni/linkedin-ops/issues/24) |
| T-025 | [#25](https://github.com/rodrigobaroni/linkedin-ops/issues/25) |
| T-026 | [#26](https://github.com/rodrigobaroni/linkedin-ops/issues/26) |
| T-027 | [#27](https://github.com/rodrigobaroni/linkedin-ops/issues/27) |
| T-028 | [#28](https://github.com/rodrigobaroni/linkedin-ops/issues/28) |
| T-029 | [#29](https://github.com/rodrigobaroni/linkedin-ops/issues/29) |
| T-030 | [#30](https://github.com/rodrigobaroni/linkedin-ops/issues/30) |
| T-031 | [#31](https://github.com/rodrigobaroni/linkedin-ops/issues/31) |
| T-032 | [#32](https://github.com/rodrigobaroni/linkedin-ops/issues/32) |
| T-033 | [#33](https://github.com/rodrigobaroni/linkedin-ops/issues/33) |
| T-034 | [#34](https://github.com/rodrigobaroni/linkedin-ops/issues/34) |
| T-035 | [#35](https://github.com/rodrigobaroni/linkedin-ops/issues/35) |
| T-036 | [#36](https://github.com/rodrigobaroni/linkedin-ops/issues/36) |
| T-037 | [#37](https://github.com/rodrigobaroni/linkedin-ops/issues/37) |
| T-038 | [#38](https://github.com/rodrigobaroni/linkedin-ops/issues/38) |
| T-039 | [#39](https://github.com/rodrigobaroni/linkedin-ops/issues/39) |
| T-040 | [#40](https://github.com/rodrigobaroni/linkedin-ops/issues/40) |
| T-041 | [#41](https://github.com/rodrigobaroni/linkedin-ops/issues/41) |
| T-042 | [#42](https://github.com/rodrigobaroni/linkedin-ops/issues/42) |
| T-043 | [#43](https://github.com/rodrigobaroni/linkedin-ops/issues/43) |
| T-044 | [#44](https://github.com/rodrigobaroni/linkedin-ops/issues/44) |
| T-045 | [#45](https://github.com/rodrigobaroni/linkedin-ops/issues/45) |
| T-046 | [#47](https://github.com/rodrigobaroni/linkedin-ops/issues/47) |
| T-047 | [#48](https://github.com/rodrigobaroni/linkedin-ops/issues/48) |
| T-048 | [#49](https://github.com/rodrigobaroni/linkedin-ops/issues/49) |
| T-049 | [#50](https://github.com/rodrigobaroni/linkedin-ops/issues/50) |
| T-050 | [#51](https://github.com/rodrigobaroni/linkedin-ops/issues/51) |
| T-051 | [#52](https://github.com/rodrigobaroni/linkedin-ops/issues/52) |
| T-052 | [#53](https://github.com/rodrigobaroni/linkedin-ops/issues/53) |
| T-053 | [#54](https://github.com/rodrigobaroni/linkedin-ops/issues/54) |
| T-054 | [#55](https://github.com/rodrigobaroni/linkedin-ops/issues/55) |
| T-055 | [#56](https://github.com/rodrigobaroni/linkedin-ops/issues/56) |
| T-056 | [#57](https://github.com/rodrigobaroni/linkedin-ops/issues/57) |
| T-057 | [#58](https://github.com/rodrigobaroni/linkedin-ops/issues/58) |
| T-058 | [#59](https://github.com/rodrigobaroni/linkedin-ops/issues/59) |
| T-059 | [#60](https://github.com/rodrigobaroni/linkedin-ops/issues/60) |
| T-060 | [#61](https://github.com/rodrigobaroni/linkedin-ops/issues/61) |
| T-061 | [#46](https://github.com/rodrigobaroni/linkedin-ops/issues/46) |
| T-062 | [#62](https://github.com/rodrigobaroni/linkedin-ops/issues/62) |
| T-063 | [#63](https://github.com/rodrigobaroni/linkedin-ops/issues/63) |
