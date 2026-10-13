# T-018 · Story Bank: modelo e API

- Épico: EPIC-02 Identity & Editorial Memory
- Responsável (papel/agente): Alicerce (backend) · regras de uso definidas por Pena
- Branch/floor: `feat/T-018-story-bank-model-api`
- Estado: todo
- Dependências: T-008, T-015, T-020

## Contexto

Único repositório de experiência própria que a IA pode citar (PRD §9, J6). Entradas marcadas como não públicas nunca entram em rascunhos.

## Resultado esperado

Entidade `StoryBankEntry` (título, texto, fatos/números com origem, pilares, públicos, `isPublic`, data do ocorrido, tags), CRUD autenticado, busca por texto e tags para o motor editorial (`GET /story-bank/search?q=&pillar=`), soft delete com auditoria.

## Critérios de aceite (verificáveis)

- [ ] Busca retorna somente `isPublic = true` quando chamada pelo motor (flag de contexto); testes cobrem.
- [ ] `ContentVersion.storyBankEntryIds[]` existe no contrato.
- [ ] Soft delete mantém referência histórica em versões já geradas.
- [ ] Validação de tamanho e campos obrigatórios.

## Fora de escopo

UI (T-019), entrevista guiada (MVP corte).

## Plano de teste

Supertest; teste de busca com fixtures públicas/privadas.

## Riscos de segurança / compliance

Dados pessoais potencialmente sensíveis; escopo por `userId`; nunca em logs.
