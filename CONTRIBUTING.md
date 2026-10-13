# Contributing

## Idiomas

- Código, identificadores, branches, commits, schemas e APIs: **inglês**.
- Interface inicial e documentos de produto: **português brasileiro**.
- ADRs e documentação estritamente técnica: inglês permitido.

## Branches

Uma tarefa por branch/floor. Padrão:

- `feat/<issue>-<slug>`
- `fix/<issue>-<slug>`
- `chore/<issue>-<slug>`
- `docs/<issue>-<slug>`

`<issue>` é o ID da tarefa (GitHub Issue ou `docs/backlog/`), ex.: `feat/T-012-opportunity-ranking`.
Nunca faça push direto em `main`. Nunca sobrescreva trabalho alheio.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`.
Tipos: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build`, `perf`, `security`.

## Definition of Done

Uma tarefa só está pronta quando:

- Critérios de aceite cumpridos.
- Testes relevantes passam; typecheck, lint e build passam.
- Nenhum segredo ou dado pessoal indevido no diff.
- Error handling e logs úteis.
- Alterações de schema têm migration e rollback/documentação.
- Acessibilidade considerada para UI.
- Documentação e contratos atualizados.
- Architect revisou mudanças estruturais; Security revisou alterações sensíveis.
- QA produziu evidência proporcional ao risco.
- Relatório com arquivos, comandos, testes, riscos e pendências.
- Floor em `review`, nunca landed automaticamente.

## Decisões técnicas

Mudanças na stack-base ou na estrutura exigem ADR em `docs/adr/` (template em `docs/adr/0000-template.md`).
