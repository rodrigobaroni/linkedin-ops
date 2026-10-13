# T-022 · Harness de evals editoriais

- Épico: EPIC-02 Identity & Editorial Memory
- Responsável (papel/agente): Pena (editorial/IA) · colaboração Crivo
- Branch/floor: `test/T-022-editorial-evals-harness`
- Estado: todo
- Dependências: T-021

## Contexto

Guardrails G5 (fidelidade factual), G6 (voz/naturalidade), G7 (tópicos sensíveis) e a regra "nunca inventar experiências" precisam de medição reproduzível. Também alimentam o gate de aprovação automática (T-044).

## Resultado esperado

Suite de evals (Vitest/Promptfoo ou equivalente) com casos bons, ruins e adversariais: naturalidade, fidelidade factual (afirmações sem fonte), preservação de voz, ausência de experiência inventada, clichês e vocabulário artificial, injeção via fonte. Rubricas versionadas; relatório em CI (flag para rodar com modelo real); função `evaluateVersion(version) → EvalRun` exportada para o motor de política.

## Critérios de aceite (verificáveis)

- [ ] ≥ 30 casos com rótulo esperado; harness reporta precisão por categoria.
- [ ] Caso "post cita experiência não presente no Story Bank" é detectado.
- [ ] Caso de injeção por fonte é detectado.
- [ ] `EvalRun` tem id, rubrica/versão, scores por critério e é gravável em `ContentVersion`.

## Fora de escopo

Métricas de engajamento; julgamento de "algoritmo do LinkedIn".

## Plano de teste

Rodar harness com adaptador fake em CI; execução real sob flag com evidência anexada ao PR.

## Riscos de segurança / compliance

Casos adversariais não podem conter dados pessoais reais.
