# Runbook · Migrations do banco de dados e rollback

- Owner: Alicerce (backend). Revisão de schema: Atlas. Operação em produção: Estaleiro.
- Escopo: PostgreSQL 17 + Prisma 7 (`packages/domain/prisma`), migrations em `prisma/migrations/`.
- Relacionados: `docs/architecture/data-model.md`, ADR-0001 (Prisma em `packages/domain`), ADR-0004 §9 (roles de banco), `docs/security/data-and-lgpd.md` §8 (backups).

## 1. Onde as coisas vivem

| Item                                                | Caminho                                                      |
| --------------------------------------------------- | ------------------------------------------------------------ |
| Schema (fonte dos tipos TypeScript)                 | `packages/domain/prisma/schema.prisma`                       |
| Config do Prisma (URL, caminho de migrations, seed) | `packages/domain/prisma.config.ts`                           |
| Migrations (uma pasta por migration, `migration.sql`) | `packages/domain/prisma/migrations/<timestamp>_<nome>/`    |
| Script de rollback da migration                     | `packages/domain/prisma/migrations/<timestamp>_<nome>/down.sql` |
| Seed de desenvolvimento (idempotente)               | `packages/domain/prisma/seed.ts`                             |
| Testes de integração (Testcontainers)               | `packages/domain/test/integration/*.integration.test.ts`     |

Variável de ambiente: `DATABASE_URL` (padrão Postgres, `postgresql://user:pass@host:5432/db`). Em
produção ela vem do secret manager/Docker secret, nunca de arquivo versionado.

## 2. Comandos (raiz do monorepo)

| Comando                   | O que faz                                                                                | Quando usar                                 |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- |
| `pnpm db:generate`        | Gera o Prisma Client em `packages/domain/src/generated` (não versionado)                 | Após alterar o schema; o build já faz isso  |
| `pnpm db:migrate`         | `prisma migrate deploy`: aplica as migrations pendentes, sem gerar nada                  | Produção, CI, qualquer ambiente             |
| `pnpm db:migrate:status`  | Lista migrations aplicadas/pendentes                                                     | Antes e depois de um deploy                 |
| `pnpm db:migrate:dev`     | `prisma migrate dev`: cria/aplica migration a partir do diff do schema (precisa de banco) | Só desenvolvimento, com Docker local        |
| `pnpm db:seed`            | Popula usuário fictício, 3 pilares e 2 fontes; roda quantas vezes quiser                 | Desenvolvimento e CI                        |
| `pnpm db:reset`           | Derruba o schema, reaplica tudo e roda o seed. Exige `NODE_ENV` ∈ {development, test} **e** `DB_RESET_CONFIRM=1` | Só desenvolvimento/teste                    |
| `pnpm db:test`            | Testes de integração com Testcontainers (exige Docker)                                   | CI (`db-integration`); local se houver Docker |

Variáveis do seed: `SEED_USER_EMAIL` (padrão `dev@example.com`) e `SEED_USER_PASSWORD` (padrão de
desenvolvimento no próprio script; nunca é logada). Não há dado real no seed. `db:seed` e `db:reset` só
rodam com `NODE_ENV` igual a `development` ou `test` (ausente = recusa; `packages/domain/src/env/guards.ts`).

## 3. Como criar uma migration sem banco local

Docker não está disponível na máquina de desenvolvimento, então a migration é gerada por diff e provada
no CI:

1. Edite `schema.prisma` e rode `pnpm --filter @linkedin-ops/domain db:validate`.
2. Gere o SQL: `pnpm --filter @linkedin-ops/domain exec prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script > prisma/migrations/<timestamp>_<nome>/migration.sql`
   (`--from-migrations` precisa de um shadow database; sem Docker, use `--from-schema <schema anterior>`
   com o schema do commit anterior, ou gere no CI).
3. Acrescente, em bloco claramente marcado, o que o Prisma não expressa: índices parciais, `CHECK`,
   triggers, extensões. Ajuste `down.sql` (gere a base com `--to-empty` invertendo os argumentos).
4. Rode `pnpm --filter @linkedin-ops/domain test` (paridade de enums) e abra o PR: o job
   `db-integration` aplica tudo do zero, roda o seed e os testes de integração.
5. Mudança de relação, enum ou invariante exige revisão de Atlas (`data-model.md` §2).

Regras: toda migration é aditiva e idempotente dentro do possível; nunca edite uma migration já aplicada
em produção (crie outra); `migration_lock.toml` fica no Git.

## 4. Procedimento de deploy

1. `pnpm db:migrate:status` no ambiente de destino.
2. Backup lógico **cifrado** antes de qualquer DDL (automação, agendamento e drills: T-055). Regras:
   credencial nunca em argv nem em `DATABASE_URL` na linha de comando (aparece em `ps`/histórico); o
   dump nunca toca o disco em claro.

   ```bash
   # credencial: ~/.pgpass (modo 0600) apontado por PGPASSFILE, ou variáveis PGHOST/PGPORT/PGUSER/PGDATABASE
   export PGPASSFILE=/run/secrets/pgpass PGHOST=... PGPORT=5432 PGUSER=linkedin_ops_backup PGDATABASE=linkedin_ops
   STAMP=$(date -u +%Y%m%dT%H%M%SZ)
   pg_dump -Fc --no-password | age -r "$BACKUP_AGE_RECIPIENT" > "backup-$STAMP.dump.age"   # ou gpg --encrypt -r <key>
   sha256sum "backup-$STAMP.dump.age" | tee "backup-$STAMP.dump.age.sha256"
   # enviar os dois arquivos ao storage privado (bucket dedicado, sem listagem, SSE); registrar o sha256 no log de operação
   ```

   Antes de qualquer DDL destrutivo, **verifique o restore** num banco descartável:

   ```bash
   sha256sum -c "backup-$STAMP.dump.age.sha256"
   createdb linkedin_ops_restore_check
   age -d -i "$BACKUP_AGE_IDENTITY" "backup-$STAMP.dump.age" | pg_restore --no-owner --no-password -d linkedin_ops_restore_check
   psql -d linkedin_ops_restore_check -c "SELECT count(*) FROM _prisma_migrations"   # + consultas da §7
   dropdb linkedin_ops_restore_check
   ```

   A role de backup é somente leitura (ADR-0004 §9); a chave de cifra do backup fica fora do host do
   banco (`data-and-lgpd.md` §8).
3. Pare o worker (jobs do pg-boss não podem rodar durante DDL que toque tabelas que eles escrevem).
4. `pnpm db:migrate`. O Prisma registra cada migration em `_prisma_migrations`.
5. Suba api e worker; confira `/ready` e `pnpm db:migrate:status` (nenhuma pendente).

## 5. Rollback

O Prisma não executa `down` automaticamente. Cada migration tem seu `down.sql`, revisado à mão. Rollback
destrói dados criados pelas tabelas removidas: só execute com backup verificado.

1. Pare api e worker.
2. Confirme o backup da etapa de deploy (ou faça um agora).
3. Aplique o script: `pnpm --filter @linkedin-ops/domain exec prisma db execute --file prisma/migrations/<timestamp>_<nome>/down.sql`
   (usa `DATABASE_URL` da `prisma.config.ts`).
4. Marque a migration como revertida: `pnpm --filter @linkedin-ops/domain exec prisma migrate resolve --rolled-back <timestamp>_<nome>`.
5. Faça o deploy da versão anterior da aplicação (o Prisma Client gerado deve corresponder ao schema).
6. Se o `down.sql` falhar no meio: restaure o backup verificado da etapa 2 em rede isolada
   (`age -d -i <identity> backup-<stamp>.dump.age | pg_restore -c --no-owner --no-password -d <db>`, credencial
   via `PGPASSFILE`), reaplique tombstones de exclusão/revogação antes de liberar workers
   (`data-and-lgpd.md` §8).

Alternativa preferida quando a migration já está em produção há tempo: **migration corretiva para a
frente** (nova migration que desfaz o necessário), em vez de `down.sql`.

### 5.1 Registro por migration

| Migration              | O que cria                                                                                                                                                                      | Rollback                                                                                                             | Riscos                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `20261016120000_init`  | Extensão `citext`; todos os enums e tabelas do data-model (users … idempotency_keys); índices parciais I7/I8 (incl. `AMBIGUOUS`) e voice profile ativo; `CHECK`s I5 e envelopes all-or-none (TOTP, code_verifier); triggers append-only (I3, I11) | `down.sql`: remove triggers/função, depois todas as tabelas, enums e a extensão. **Apaga todos os dados.**           | Baseline: rollback equivale a banco vazio. Só faz sentido antes de haver dados reais.                          |

## 6. Append-only e privilégios

`draft_versions`, `approvals` e `audit_events` rejeitam `UPDATE`/`DELETE`/`TRUNCATE` por trigger
(`reject_append_only_mutation`). Em produção, a role de runtime da aplicação também perde esses
privilégios (ADR-0004 §9: roles separadas para migration, runtime e backup; provisionadas por
Estaleiro/T-052). Correções em registros append-only se fazem com um novo registro, nunca editando.

## 7. Verificações de sanidade pós-migration

```sql
SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at;
SELECT extname FROM pg_extension WHERE extname = 'citext';
SELECT tgname FROM pg_trigger WHERE tgname LIKE '%append_only%';
```
