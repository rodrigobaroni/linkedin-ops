# T-020 · Pilares editoriais e públicos: modelo e API

- Épico: EPIC-02 Identity & Editorial Memory
- Responsável (papel/agente): Alicerce (backend) · lista inicial por Pena
- Branch/floor: `feat/T-020-pillars-audiences-api`
- Estado: todo
- Dependências: T-008, T-015

## Contexto

Pilares e públicos são usados pelo classificador (T-027), pelos filtros de curadoria e pelo guardrail de diversidade (G4).

## Resultado esperado

Entidades `Pillar` (nome, descrição, cor, ativo, ordem) e `Audience`; CRUD; seed com a lista inicial de Pena; impedimento de exclusão quando referenciado (desativar em vez de excluir).

## Critérios de aceite (verificáveis)

- [ ] Excluir pilar referenciado retorna 409 e sugere desativar.
- [ ] Contrato expõe enum dinâmico via endpoint (sem hard-code no frontend).
- [ ] Seed cria pilares e públicos iniciais.

## Fora de escopo

UI (T-017).

## Plano de teste

Supertest.

## Riscos de segurança / compliance

Nenhum.
