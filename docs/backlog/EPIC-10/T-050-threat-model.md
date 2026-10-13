# T-050 · Threat model do LinkedIn Ops

- Épico: EPIC-10 Security, Reliability & Deployment
- Responsável (papel/agente): Sentinela (segurança)
- Branch/floor: Ground (Onda 1; consolidado pelo Maestro)
- Estado: todo
- Dependências: T-009; `docs/architecture/system-overview.md` (Atlas)

## Contexto

Ativos críticos: token OAuth do LinkedIn, sessão do dashboard, chave da OpenAI, token do bot Telegram, Story Bank (dados pessoais), integridade das decisões de autonomia. Superfícies: login, callbacks OAuth, webhook Telegram, coleta de feeds (SSRF/injeção), prompts (injeção), fila de jobs.

## Resultado esperado

`docs/security/threat-model.md` (STRIDE ou equivalente) com ativos, atores, superfícies, ameaças priorizadas, controles existentes/planejados mapeados para tarefas do backlog (T-015, T-038, T-046, T-052, T-057, T-058), e findings por severidade.

## Critérios de aceite (verificáveis)

- [ ] Cada ameaça tem severidade, controle e tarefa associada (ou "aceito" com justificativa).
- [ ] Cobre explicitamente: prompt injection por fonte, SSRF na coleta, roubo de token, CSRF em callbacks, replay de webhook, publicação fora do modo, exfiltração via notificação.
- [ ] Lista de verificações para revisão de releases sensíveis.

## Fora de escopo

Implementação de controles.

## Plano de teste

Revisão por Atlas; checklist usada no DoD das tarefas sensíveis.

## Riscos de segurança / compliance

Documento não deve conter segredos nem detalhes de infraestrutura real (IPs, hosts).
