# T-048 · UI da central de notificações, preferências e vínculo do Telegram

- Épico: EPIC-06 Notifications
- Responsável (papel/agente): Vitral (frontend)
- Branch/floor: `feat/T-048-notifications-ui`
- Estado: todo
- Dependências: T-007, T-013, T-046, T-047

## Contexto

J7 passos 1–2 e central interna: sino com contagem, lista com link, marcar como lida; Configurações › Integrações › Telegram (gerar código, estado, testar) e › Notificações (preferências por tipo).

## Resultado esperado

Componentes e telas conforme wireframes T-013; atualização em tempo quase real (polling 30 s ou SSE, decisão com Atlas).

## Critérios de aceite (verificáveis)

- [ ] Vínculo: gerar código, exibir instruções, estado muda para "vinculado" após confirmação; Testar envia mensagem.
- [ ] Preferências persistem e refletem na API.
- [ ] Lista acessível por teclado; `axe` sem violações críticas.
- [ ] Playwright cobre vínculo (com fake) e leitura de notificação.

## Fora de escopo

Comandos no Telegram.

## Plano de teste

Playwright + componente.

## Riscos de segurança / compliance

Nenhum adicional.
