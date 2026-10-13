# T-045 · UI de Autonomia e Integrações (LinkedIn)

- Épico: EPIC-05 Scheduling & LinkedIn Publishing
- Responsável (papel/agente): Vitral (frontend) · revisão Aurora e Sentinela
- Branch/floor: `feat/T-045-autonomy-integrations-ui`
- Estado: todo
- Dependências: T-007, T-013, T-038, T-044

## Contexto

J9 e parte de J8 (PRD §6 v0.2): três cartões (Assistido · Piloto automático controlado · Piloto automático completo) com "o que acontece sem você" conforme a matriz §6.2, toggle `assistedPrefetchDraft` no Assistido, guardrails editáveis (`auto_approve_min_score`, `allowed_pillar_ids`, `max_auto_posts_per_week`, janela de publicação, `cancel_window_minutes`, `require_human_for_media`, `quiet_hours`, tópicos sensíveis), diálogo de reautenticação ao subir, lista de revogações ao descer; LinkedIn conectar/desconectar/estado do token; banner global "LinkedIn desconectado".

## Resultado esperado

Configurações › Autonomia e Configurações › Integrações › LinkedIn conforme wireframes T-013; banner global quando token expirado/ausente; alerta 7 dias/24 h antes de expirar.

## Critérios de aceite (verificáveis)

- [ ] Subir de modo abre diálogo com resumo e pede reautenticação; sem ela, UI mostra erro e não altera.
- [ ] Descer mostra lista de itens revogados (quando houver) com links.
- [ ] Desligar `require_human_for_media` exige confirmação explícita com aviso; `cancel_window_minutes` não aceita valor < 15.
- [ ] No Estúdio/Calendário, item agendado por política no controlado mostra "cancele até <hora>" e botão **Cancelar publicação automática**.
- [ ] Estado do LinkedIn exibe validade e escopos; nunca o token.
- [ ] Playwright cobre troca de modo e conectar (com OAuth fake).

## Fora de escopo

Telegram (T-048).

## Plano de teste

Playwright + componente.

## Riscos de segurança / compliance

Nenhum token no cliente; textos explicativos revisados por Sentinela.
