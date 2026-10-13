# T-047 · Eventos de domínio → notificações, preferências e central interna (API)

- Épico: EPIC-06 Notifications
- Responsável (papel/agente): Pêndulo (automação/integrações) · modelo com Alicerce
- Branch/floor: `feat/T-047-notification-events`
- Estado: todo
- Dependências: T-046, T-028, T-033, T-039, T-044

## Contexto

Catálogo de eventos (PRD §9 e `data-model.md` §2.7): `CURATION_READY`, `DRAFT_READY`, `APPROVAL_NEEDED` (inclui motivos: prefetch, gate, mídia, warn), `SCHEDULED`, `AUTOPILOT_WILL_PUBLISH` (controlado: com hora-limite de cancelamento), `PUBLISHED` (inclui "publicado automaticamente" com razão), `PUBLICATION_FAILED`, `TOKEN_EXPIRING`, `RUN_FAILED`, `AUTOPILOT_REVOKED` (descida de modo). Toda notificação também fica na central interna; `dedupe_key` evita duplicatas.

## Resultado esperado

Entidade `Notification` (tipo, título, corpo PT-BR, link profundo, lida, canal, status de entrega); subscriber de eventos que cria notificação + despacha para Telegram conforme preferências; endpoints `GET /notifications`, `POST /notifications/:id/read`, `GET/PUT /notification-preferences` (por tipo, ligado/desligado); templates de mensagem curtos com prévia de no máximo 200 caracteres do post e sem conteúdo externo bruto.

## Critérios de aceite (verificáveis)

- [ ] Cada tipo de evento do catálogo gera notificação com link que abre a tela certa.
- [ ] Preferência desligada impede Telegram, mas a central interna registra.
- [ ] `AUTOPILOT_WILL_PUBLISH` inclui horário de publicação e hora-limite de cancelamento em `America/Sao_Paulo`, e registra `notifiedAt` interno mesmo se o Telegram falhar (a janela conta a partir do registro interno).
- [ ] `quiet_hours` da política suprime Telegram (não a central) exceto falhas.
- [ ] Nenhuma mensagem contém token, prompt ou texto de fonte (teste de template com fixtures maliciosas).

## Fora de escopo

UI (T-048); silêncio noturno (corte).

## Plano de teste

Testes de subscriber com eventos simulados; snapshot de templates.

## Riscos de segurança / compliance

Vazamento por mensagem; mitigado por templates restritos.
