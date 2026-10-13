# T-019 · UI do Story Bank

- Épico: EPIC-02 Identity & Editorial Memory
- Responsável (papel/agente): Vitral (frontend)
- Branch/floor: `feat/T-019-story-bank-ui`
- Estado: todo
- Dependências: T-007, T-013, T-018

## Contexto

J6 passos 3–4: lista, criação/edição, marcação "pode usar publicamente", filtros por pilar; no estúdio, a aba Fontes aponta para entradas usadas (T-035 consome).

## Resultado esperado

Tela Story Bank com lista, filtros, formulário de entrada, indicador visual de "não pública", exclusão com confirmação, estado vazio explicativo.

## Critérios de aceite (verificáveis)

- [ ] Criar, editar, marcar privada e excluir funcionam com auditoria visível.
- [ ] Entrada privada tem indicador claro e aviso "nunca usada em rascunhos".
- [ ] Teste Playwright do CRUD; `axe` sem violações críticas.

## Fora de escopo

Entrevista guiada (MVP corte, tarefa futura).

## Plano de teste

Playwright + componente.

## Riscos de segurança / compliance

Nenhum adicional.
