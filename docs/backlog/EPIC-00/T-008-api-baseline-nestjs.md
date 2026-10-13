# T-008 · API base (NestJS, OpenAPI, erros, config)

- Épico: EPIC-00 Foundation
- Responsável (papel/agente): Alicerce (backend) · revisão Atlas
- Branch/floor: `feat/T-008-api-baseline-nestjs`
- Estado: todo
- Dependências: T-004, T-005

## Contexto

A API é a única fonte de regras de negócio para web e worker. Precisa de OpenAPI gerado, validação por Zod, formato de erro único e configuração validada no boot.

## Resultado esperado

`apps/api` com módulos base, validação de `.env` no boot (falha rápida), pipe de validação Zod usando `packages/contracts`, formato de erro padronizado (`code`, `message` em PT-BR, `correlationId`), OpenAPI em `/docs` (apenas em dev) e export para `packages/contracts/openapi.json`, health `/health` e `/ready`, Pino com redaction de campos sensíveis, Supertest configurado.

## Critérios de aceite (verificáveis)

- [ ] Boot sem `DATABASE_URL` falha com mensagem clara; placeholders de `.env.example` (`change-me*`) são rejeitados em `NODE_ENV=production` (SEC-004 do threat model).
- [ ] Requisição inválida retorna 400 com formato padronizado; teste cobre.
- [ ] OpenAPI gerado em CI e versionado; diff de contrato aparece no PR.
- [ ] Logs redigem `authorization`, `cookie`, `token`, `apiKey`.

## Fora de escopo

Autenticação (T-015), domínios.

## Plano de teste

Supertest em health/erro; snapshot do OpenAPI.

## Riscos de segurança / compliance

Swagger desabilitado em produção; headers de segurança (helmet).
