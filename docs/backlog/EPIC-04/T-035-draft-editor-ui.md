# T-035 · UI do Estúdio: editor, prévia, hooks, fontes, mídia

- Épico: EPIC-04 Draft Studio
- Responsável (papel/agente): Vitral (frontend) · revisão Aurora
- Branch/floor: `feat/T-035-draft-editor-ui`
- Estado: todo
- Dependências: T-007, T-012, T-014, T-032, T-034

## Contexto

J2 completa, exceto versões/aprovação (T-036).

## Resultado esperado

Tela Estúdio: editor de texto com contador `n/3000`, autosave que cria versão (pausa ≥ 5 s ou sair) com `baseVersionId`, abas Prévia (fiel: quebra "ver mais" após 3 linhas), Hooks (3 alternativas, aplicar), Fontes (lista com trechos; afirmações destacadas no texto; ações vincular fonte / marcar como fato do autor; entradas do Story Bank usadas), Mídia (sugestão e prévia), Regenerar com instrução, badges de gates, estados gerando/falha/conflito.

## Critérios de aceite (verificáveis)

- [ ] Conflito de versão exibe diff e não perde texto (teste com duas abas).
- [ ] Prévia atualiza em ≤ 300 ms; contador acima de 3 000 desabilita aprovar.
- [ ] Aplicar hook altera a primeira linha e aparece em Versões.
- [ ] `axe` sem violações críticas; editor operável por teclado.
- [ ] Playwright cobre J2 passos 1–3 e variações V1/V3.

## Fora de escopo

Versões/diff/aprovação (T-036), calendário (T-043).

## Plano de teste

Playwright + componente.

## Riscos de segurança / compliance

Renderização segura de trechos de fontes; links `noopener`.
