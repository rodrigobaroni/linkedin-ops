# T-038 · Conexão LinkedIn via OAuth 2.0 (conectar, desconectar, expiração)

- Épico: EPIC-05 Scheduling & LinkedIn Publishing
- Responsável (papel/agente): Pêndulo (automação/integrações) · revisão obrigatória Sentinela
- Branch/floor: `feat/T-038-linkedin-oauth-connect`
- Estado: todo
- Dependências: T-008, T-015, T-052, T-061 (G-01); `docs/security/linkedin-policy.md` e `docs/security/oauth-and-tokens.md` (Sentinela)

## Contexto

Única forma permitida de publicar. Escopos mínimos (hipótese: `openid profile w_member_social`; validar com Sentinela/Pêndulo). Tokens cifrados em repouso; expiração monitorada (G9).

## Resultado esperado

Fluxo `GET /integrations/linkedin/connect` (state + PKCE se suportado) → callback → gravação de `LinkedInConnection` (memberUrn, escopos, `expiresAt`, token cifrado via T-052), `DELETE` para desconectar (revoga se a API permitir), `GET /integrations/linkedin/status` (conectado, validade, escopos, última chamada ok), job diário que emite `integration.token_expiring` a 7 dias e 24 h; adaptador `LinkedInClient` substituível com fake para testes.

## Critérios de aceite (verificáveis)

- [ ] **Gate G-03 (threat-model §8):** testes de callback cobrem `state` errado, expirado, reutilizado, `code` reutilizado e `redirect_uri` divergente; todos rejeitados sem gravar conexão.
- [ ] Escopos efetivamente concedidos são comparados aos solicitados e gravados; falha fechada se `w_member_social` ausente (`linkedin-policy.md`).
- [ ] Token nunca aparece em logs, respostas de API ou frontend (teste de redaction + revisão).
- [ ] Status mostra validade e escopos; token expirado muda status para `expired` e bloqueia publicação (T-042 consome).
- [ ] Documentação do app LinkedIn (produto, escopos, URL de callback) em `docs/security/linkedin-policy.md`.

## Fora de escopo

Publicação (T-039/T-040); métricas.

## Plano de teste

Supertest com servidor OAuth fake; teste manual com app real em sandbox, evidência sem segredos.

## Riscos de segurança / compliance

Alto: proteção de token e `state`; escopos mínimos; conformidade com termos da API.
