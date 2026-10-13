# T-013 · Wireframes de Calendário, Memória editorial, Fontes e Configurações

- Épico: EPIC-01 Product & Design
- Responsável (papel/agente): Aurora (design)
- Branch/floor: `docs/T-013-settings-memory-calendar-wireframes`
- Estado: todo
- Dependências: T-011

## Contexto

Jornadas J3 (calendário), J5 (fontes/watchlists), J6 (Voice Profile/Story Bank/pilares), J7 (Telegram), J9 (autonomia). Telas de configuração são onde o risco de automação indevida é controlado.

## Resultado esperado

Wireframes: Calendário (semana/mês, slot sugerido, reagendar, desagendar, item em falha); Fontes (lista, adicionar com teste, saúde, domínios permitidos, watchlist); Voice Profile (assistente em etapas + edição versionada); Story Bank (lista, entrada, "pode usar publicamente"); Pilares e públicos; Configurações › Autonomia (3 cartões conforme PRD §6.2 v0.2: Assistido com toggle de pré-geração, Piloto automático controlado com janela de cancelamento, Piloto automático completo; guardrails incluindo `require_human_for_media`; diálogo de subir modo com reautenticação; lista de revogações ao descer); estados do item "agendado por política, cancele até <hora>" no Estúdio/Calendário; Integrações (LinkedIn conectar/estado do token; Telegram vínculo por código, testar); Notificações (preferências); Auditoria (linha do tempo por item e log global).

## Critérios de aceite (verificáveis)

- [ ] Cada tela com estados empty/loading/error/success.
- [ ] Tela de Autonomia explicita "o que acontece sem você" por modo, conforme PRD §6.2.
- [ ] Calendário mostra timezone explicitamente em toda confirmação.
- [ ] Checklist WCAG anexado.

## Fora de escopo

Analytics (Fase 2).

## Plano de teste

Walkthrough J5/J6/J7/J9 com Farol; revisão de Sentinela na tela de Integrações e Autonomia.

## Riscos de segurança / compliance

Nunca exibir tokens; estado do token mostra só validade e escopos.
