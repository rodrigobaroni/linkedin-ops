# architecture

Documentação de arquitetura do LinkedIn Ops. Mantida por Atlas (Principal Architect). Decisões formais em `docs/adr/`.

| Documento                                  | Conteúdo                                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [system-overview.md](./system-overview.md) | C4 níveis 1–2, boundaries entre web/api/worker/editorial-engine, comunicação (sessão, CSRF, jobs), prompts, perguntas abertas Q1–Q5      |
| [data-model.md](./data-model.md)           | Entidades, ER (Mermaid), state machine do conteúdo (§13 do briefing), invariantes I1–I14, perguntas Q6–Q9                                |
| [contracts.md](./contracts.md)             | REST `/api/v1` (recursos, verbos, payloads), erros (RFC 9457), versionamento, `packages/contracts`, catálogo de filas, perguntas Q10–Q12 |

ADRs relacionados: 0001 (stack e estrutura), 0002 (pg-boss), 0003 (publicação idempotente), 0004 (tokens cifrados), 0005 (editorial-engine puro), 0006 (pin do upstream linkedin-skills), 0007 (auth e sessão).
