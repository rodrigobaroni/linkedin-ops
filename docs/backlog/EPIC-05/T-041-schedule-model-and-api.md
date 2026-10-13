# T-041 · Agendamento: modelo, slots sugeridos e API

- Épico: EPIC-05 Scheduling & LinkedIn Publishing
- Responsável (papel/agente): Alicerce (backend)
- Branch/floor: `feat/T-041-schedule-model-api`
- Estado: todo
- Dependências: T-032. A janela de publicação nasce aqui como configuração simples (padrão seg/qua/sex 10:00–12:00); a política de autonomia a incorpora depois na versão versionada.

## Contexto

J3: agendar só versão aprovada, timezone explícito, slot sugerido na janela configurada, reagendar/desagendar com auditoria, aviso de cadência.

## Resultado esperado

Entidade `Schedule` (`scheduledAtUtc`, `timezone`, `contentVersionId` aprovada, estado); endpoints `POST /content-items/:id/schedule` (`APPROVED → SCHEDULED`), `PATCH` (reagendar), `DELETE` (desagendar → `APPROVED`), `GET /calendar?from=&to=` (itens, slots sugeridos, publicados), `GET /schedule/suggest` (próximo slot livre na janela da política); validações: não no passado, dentro da janela (aviso, não bloqueio, para ação manual), 1/dia como aviso.

## Critérios de aceite (verificáveis)

- [ ] Agendar item não aprovado retorna 409.
- [ ] `scheduledAtUtc` e `timezone` obrigatórios; resposta inclui horário local formatado.
- [ ] Sugestão respeita janela (ex.: seg/qua/sex 10:00–12:00) e evita dias já ocupados.
- [ ] Reagendar e desagendar geram auditoria.

## Fora de escopo

Execução no slot (T-042), UI (T-043).

## Plano de teste

Supertest; testes de timezone com datas de virada de dia/ano.

## Riscos de segurança / compliance

Nenhum adicional.
