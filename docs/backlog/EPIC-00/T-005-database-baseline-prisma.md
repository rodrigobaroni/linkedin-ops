# T-005 · Banco de dados base (PostgreSQL + Prisma + migrations)

- Épico: EPIC-00 Foundation
- Responsável (papel/agente): Alicerce (backend) · revisão Atlas
- Branch/floor: `feat/T-005-database-baseline-prisma`
- Estado: review (PR #76)
- Dependências: T-003, T-004; `docs/architecture/data-model.md` (Atlas)

## Contexto

Modelo de dados do MVP com `userId` em todas as entidades de domínio (preparo multiusuário), versionamento de rascunhos e trilha de auditoria.

## Resultado esperado

`packages/domain/prisma/schema.prisma` (ADR-0001, emenda de estrutura: schema, migrations e suite
Testcontainers vivem em `packages/domain`, não em `apps/api`) com as entidades de
`docs/architecture/data-model.md` (User, Session, OAuthState, OAuthToken, AutonomySettings, VoiceProfile,
StoryBankEntry, ContentPillar, Source, Watchlist, SourceItem, CurationRun, Opportunity, Draft, DraftVersion,
Approval, Schedule, Publication, MediaAsset, Notification, AuditEvent, IdempotencyKey — nomes do PRD §8.1
mapeados: ContentItem→Draft, ContentVersion→DraftVersion, OpportunityBatch→CurationRun, Pillar→ContentPillar,
AutonomyPolicy→AutonomySettings, LinkedInConnection→OAuthToken; Audience é `target_audience`; TelegramLink
fica em variável de ambiente no MVP); migration inicial `20261016120000_init` com `down.sql`; seed de dev
(usuário fictício, 3 pilares, 2 fontes); scripts `db:generate`, `db:migrate`, `db:migrate:status`,
`db:migrate:dev`, `db:seed`, `db:reset`, `db:test`; runbook de migrations e rollback em
`docs/runbooks/database-migrations.md`.

## Critérios de aceite (verificáveis)

- [ ] `pnpm db:migrate` aplica do zero e `pnpm db:seed` popula sem erro.
- [ ] Índices únicos: `Publication.idempotencyKey`, `(OpportunityBatch.userId, scheduledFor, kind)`, `Source.canonicalUrl` por usuário.
- [ ] `ContentVersion` e `Approval` e `AuditEvent` são append-only (sem update/delete na camada de acesso; teste cobre).
- [ ] `Schedule` guarda `scheduledAtUtc` + `timezone` (IANA), ambos obrigatórios.
- [ ] Testcontainers executa a migration em teste de integração.

## Fora de escopo

Endpoints, regras de negócio, cifra de tokens (T-052, mas a coluna já nasce como `bytea`/texto cifrado).

## Plano de teste

Testcontainers: migrate + seed + consultas de sanidade; teste de append-only.

## Riscos de segurança / compliance

Dados pessoais mínimos; colunas de token marcadas para cifra (T-052); nenhum dado real no seed.
