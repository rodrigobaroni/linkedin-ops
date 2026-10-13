# editorial

Sistema editorial do LinkedIn Ops. Mantido por Pena (AI Editorial & Human Voice). Política resumida na note `editorial-policy`.

| Documento | Conteúdo |
|---|---|
| [upstream-mapping.md](./upstream-mapping.md) | Rastreabilidade do upstream `sergebulaev/linkedin-skills` (MIT): commit analisado, o que foi adotado/adaptado/rejeitado por skill e por reference, classificação das alegações sobre o algoritmo, forma de pinning (ADR-0006) |
| [editorial-system.md](./editorial-system.md) | Princípios, pilares provisórios, Voice Profile, Story Bank, fórmulas de hook, templates PT-BR, pipeline de geração em 9 etapas, rubrica de qualidade, listas de clichês, anti-fabricação, prompt injection, versionamento de prompts |
| [structured-outputs.md](./structured-outputs.md) | JSON Schemas (Structured Outputs) de classificação de oportunidade, brief, post com hooks e fontes, sugestão de mídia, avaliação de qualidade, extração de Voice Profile; mapeamento para `contracts.md` |
| [evals-plan.md](./evals-plan.md) | Harness de evals (Vitest determinístico + Promptfoo/online): métricas, casos bons/ruins/adversariais, graders, gate para mudança de prompt |

Implementação alvo: `packages/editorial-engine` (pacote puro, sem I/O de rede; ADR-0005). A aplicação não depende de Claude Code, Codex ou arquivos `SKILL.md` em runtime.
