# T-061 · Prova de acesso real à API do LinkedIn (gate G-01)

- Épico: EPIC-05 Scheduling & LinkedIn Publishing
- Responsável (papel/agente): Pêndulo (automação/integrações) · co-owner Sentinela · app criado por Rodrigo
- Branch/floor: `docs/T-061-linkedin-api-access-proof`
- Estado: todo
- Dependências: T-051; app registrado no LinkedIn Developer Portal (ação de Rodrigo)

## Contexto

Gate G-01 do `docs/security/threat-model.md` §8 e finding SEC-001: o acesso real do app aos produtos/escopos (`w_member_social`, Images/Assets) ainda não foi comprovado. Implementar contra endpoints presumidos pode bloquear o MVP ou induzir escopos excessivos. Também cobre SEC-002 (refresh token programático não garantido).

## Resultado esperado

Spike documentado em `docs/security/linkedin-api-access-evidence.md`: app real no Developer Portal, produtos aprovados, escopos concedidos no consentimento, chamada de teste a cada endpoint que o MVP usa (criar post de texto em modo rascunho/teste ou conta de teste, registro/upload de imagem), respostas e cabeçalhos de quota registrados **sem tokens**, comportamento do refresh token (existe? validade?), limites de tamanho e taxa observados. Tabela "formato → suportado → evidência" alimentando `linkedin-policy.md` e o PRD §4/§12.

## Critérios de aceite (verificáveis)

- [ ] Evidência de uma publicação de texto real via API (URN do post) em conta de Rodrigo ou de teste, com texto marcado como teste e removido depois, ou justificativa se a plataforma não permitir.
- [ ] Lista de escopos concedidos vs. solicitados; nenhum escopo além de `openid profile w_member_social` (ou o mínimo confirmado).
- [ ] Resposta sobre refresh token (SEC-002) com impacto na validade de G9 e no alerta de expiração.
- [ ] Nenhum token, `client_secret` ou cookie no documento ou em anexos (revisão de Sentinela).
- [ ] `linkedin-policy.md` e PRD §13 atualizados com o que foi confirmado.

## Fora de escopo

Implementação do fluxo (T-038+), analytics.

## Plano de teste

Execução manual com evidência; revisão de Sentinela.

## Riscos de segurança / compliance

Alto: uso de conta real. Só chamadas documentadas; sem automação de navegador; remover posts de teste.
