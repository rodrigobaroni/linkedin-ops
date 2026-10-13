# T-054 · Observabilidade: logs estruturados, health checks, OpenTelemetry e alertas críticos

- Épico: EPIC-10 Security, Reliability & Deployment
- Responsável (papel/agente): Estaleiro (plataforma)
- Branch/floor: `chore/T-054-observability-baseline`
- Estado: todo
- Dependências: T-006, T-008

## Contexto

PRD §10: `correlationId` por requisição/job, health/ready, OTel básico, alertas para ciclo não executado, publicação falhou, token a expirar, DLQ > 0.

## Resultado esperado

Pino configurado em api/worker com `correlationId` propagado (HTTP → job), exporter OTel opcional via `OTEL_EXPORTER_OTLP_ENDPOINT`, métricas mínimas (jobs por estado, DLQ, duração do ciclo, publicações por resultado), job `monitor.alerts` que emite notificação interna/Telegram para as condições críticas, dashboard mínimo (Grafana opcional no Compose) ou documentação de consulta.

## Critérios de aceite (verificáveis)

- [ ] Log de job traz o mesmo `correlationId` da requisição que o enfileirou (teste).
- [ ] Ciclo não executado até 09:20 gera alerta "curadoria atrasada".
- [ ] DLQ > 0 gera alerta único (sem spam: 1 por hora).
- [ ] `/health` e `/ready` usados pelo Compose/Caddy.

## Fora de escopo

Alertas avançados, SLOs formais.

## Plano de teste

Testes de propagação; simulação de condições com relógio falso.

## Riscos de segurança / compliance

Logs sem segredos (redaction de T-008/T-052).
