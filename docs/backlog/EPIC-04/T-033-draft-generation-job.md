# T-033 · Job de geração do rascunho (post, hooks, fontes, mídia)

- Épico: EPIC-04 Draft Studio
- Responsável (papel/agente): Pêndulo (automação/integrações) · prompts e schema por Pena
- Branch/floor: `feat/T-033-draft-generation-job`
- Estado: todo
- Dependências: T-006, T-021, T-016, T-018, T-032

## Contexto

Só após a seleção (PRD §8.3): post completo em PT-BR na voz de Rodrigo, 3 hooks, fontes com trechos e afirmações vinculadas, sugestão de mídia, metadados (modelo, versão de prompt, versão do Voice Profile, entradas do Story Bank, EvalRun).

## Resultado esperado

Job `content.generate` (`SELECTED → GENERATING → DRAFT`): monta contexto (oportunidade + fontes sanitizadas como dados + Voice Profile vigente + Story Bank público relevante), chama o `editorial-engine`, valida, cria `ContentVersion` (autor `ai`), roda `evaluateVersion` (T-022) e grava gates; falha → retry 3× com backoff, depois `SELECTED` com `lastError` e evento `content.generation_failed`.

## Critérios de aceite (verificáveis)

- [ ] Versão gerada contém texto ≤ 3 000, 3 hooks, ≥ 1 fonte quando a oportunidade tem fonte, `promptVersion`, `voiceProfileVersionId`, `evalRunId`.
- [ ] Saída inválida do modelo não cria versão; retries e estado final conforme PRD; sem conteúdo parcial.
- [ ] Entradas privadas do Story Bank nunca entram no contexto (teste).
- [ ] p95 ≤ 60 s com adaptador real (medido sob flag) e ≤ 2 s com fake.
- [ ] Emite `content.draft_ready` para notificações.

## Fora de escopo

Regeneração com instrução (T-034), render de code-card (T-037).

## Plano de teste

Vitest com adaptador fake + Testcontainers; fault injection (timeout, JSON inválido).

## Riscos de segurança / compliance

Prompt injection por fonte (defesas T-021/T-058); sem segredos em payload/logs.
