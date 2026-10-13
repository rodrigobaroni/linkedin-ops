# T-063 · Retenção, exportação e exclusão de dados (LGPD)

- Épico: EPIC-10 Security, Reliability & Deployment
- Responsável (papel/agente): Alicerce (backend) · política por Sentinela · decisão de prazos por Rodrigo
- Branch/floor: `feat/T-063-data-retention-export-deletion`
- Estado: todo
- Dependências: T-005, T-025, T-053; decisão de Rodrigo (PRD §13.19)

## Contexto

Finding SEC-003 do threat model e `docs/security/data-and-lgpd.md`: a política de retenção/exclusão depende do controlador (Rodrigo). O PRD §10 promete retenção configurável (padrão 90 dias para itens coletados; indefinida para publicados), exportação e exclusão sob demanda, e TTL curto para qualquer dado de terceiros.

## Resultado esperado

Configuração `retention` por categoria (itens coletados, oportunidades expiradas, notificações, logs de auditoria — auditoria não é apagada, só arquivada), job diário `retention.purge` idempotente, endpoint `POST /account/export` (JSON com Voice Profile, Story Bank, itens, versões, publicações, auditoria) e `POST /account/delete` (confirmação com reautenticação; revoga token LinkedIn; apaga dados pessoais; mantém auditoria anonimizada), documentação em `data-and-lgpd.md`.

## Critérios de aceite (verificáveis)

- [ ] Itens coletados com mais de N dias (configurável) são apagados; publicações e auditoria permanecem (teste com relógio falso).
- [ ] Export gera arquivo completo sem tokens/segredos (teste de redaction).
- [ ] Exclusão exige reautenticação, revoga conexão LinkedIn e deixa zero dados pessoais nas tabelas (consulta de verificação).
- [ ] Inventário de campos de terceiros (nomes, autores de fontes) com TTL documentado conforme `data-and-lgpd.md`.

## Fora de escopo

Portal de privacidade multiusuário.

## Plano de teste

Testcontainers; teste do job com relógio falso; Supertest para export/delete.

## Riscos de segurança / compliance

Exclusão é destrutiva: confirmação dupla e auditoria; export é dado pessoal completo: só via sessão autenticada, link de uso único.
