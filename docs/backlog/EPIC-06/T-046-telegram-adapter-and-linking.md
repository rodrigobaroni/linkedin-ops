# T-046 · Adaptador Telegram (vínculo por código, chat autorizado, envio)

- Épico: EPIC-06 Notifications
- Responsável (papel/agente): Pêndulo (automação/integrações) · revisão Sentinela
- Branch/floor: `feat/T-046-telegram-adapter`
- Estado: todo
- Dependências: T-006, T-008, T-015

## Contexto

J7: Telegram só notifica. Vínculo seguro do chat de Rodrigo; mensagens recebidas ignoradas com resposta fixa.

## Resultado esperado

Adaptador `TelegramNotifier` (Bot API, envio com retry e fila), webhook `POST /integrations/telegram/webhook` protegido por segredo (`TELEGRAM_WEBHOOK_SECRET`) ou polling (decisão com Atlas), fluxo de vínculo: dashboard gera código de uso único (expira em 10 min) → usuário envia ao bot → bot responde confirmando → `TelegramLink(chatId)`; `POST /integrations/telegram/test`; qualquer outra mensagem recebida → resposta "Use o dashboard: <link>" e log sem conteúdo.

## Critérios de aceite (verificáveis)

- [ ] Mensagem de `chatId` não vinculado nunca recebe dados do sistema.
- [ ] Código expirado ou reutilizado é rejeitado.
- [ ] Webhook sem segredo correto → 401.
- [ ] Telegram indisponível → mensagens ficam em fila com retry por até 1 h; depois DLQ + alerta interno.

## Fora de escopo

Comandos (Fase 2, decisão pendente); preferências (T-047).

## Plano de teste

Supertest com servidor Telegram fake; teste de fila com falhas.

## Riscos de segurança / compliance

Segredo do webhook e token do bot só em config; sem conteúdo externo bruto nas mensagens.
