# T-017 · UI do Voice Profile, pilares e públicos

- Épico: EPIC-02 Identity & Editorial Memory
- Responsável (papel/agente): Vitral (frontend)
- Branch/floor: `feat/T-017-voice-profile-pillars-ui`
- Estado: todo
- Dependências: T-007, T-013, T-016, T-020

## Contexto

J6: assistente em etapas no primeiro acesso, edição versionada depois; pilares e públicos como listas editáveis.

## Resultado esperado

Telas em Memória editorial: Voice Profile (assistente de 5 etapas + edição com histórico de versões) e Pilares e públicos (CRUD com cor por pilar). Formulários com React Hook Form + Zod a partir do `contracts`.

## Critérios de aceite (verificáveis)

- [ ] Assistente conclui e cria versão 1; edição cria versão 2 visível no histórico.
- [ ] Validações do contrato refletidas inline (sem regra duplicada: usa o mesmo schema Zod).
- [ ] Acessível por teclado; `axe` sem violações críticas.
- [ ] Teste Playwright do fluxo completo.

## Fora de escopo

Story Bank (T-019).

## Plano de teste

Playwright + testes de componente.

## Riscos de segurança / compliance

Nenhum adicional.
