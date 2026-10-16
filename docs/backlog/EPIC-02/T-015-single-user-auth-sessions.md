# T-015 · Autenticação single-user com sessão segura

- Épico: EPIC-02 Identity & Editorial Memory
- Responsável (papel/agente): Alicerce (backend) · revisão Sentinela e Atlas
- Branch/floor: `feat/T-015-single-user-auth-sessions`
- Estado: todo
- Dependências: T-005, T-008; ADR-0007 (aceito em 2026-10-16: e-mail + senha Argon2id, sessão server-side, cookie `__Host-session`; N1–N4 normativos) e ADR-0004 item 13

## Contexto

Um único usuário (Rodrigo), mas o modelo não pode impedir multiusuário. Subir de modo de autonomia exige reautenticação (PRD §6.7).

## Resultado esperado

Login conforme ADR-0007 (e-mail + senha com Argon2id; passkey e TOTP depois do MVP), sessão em cookie `HttpOnly/Secure/SameSite=Lax`, logout, endpoint `POST /auth/reauthenticate` que emite prova de reautenticação com validade de 5 min, guard que injeta `userId` em toda requisição, rate limit em login, página de login no web.

## Critérios de aceite (verificáveis)

- [ ] 5 falhas de login em 1 min bloqueiam por 15 min (teste).
- [ ] Toda rota de domínio exige sessão; teste de acesso anônimo retorna 401.
- [ ] Reautenticação expira em 5 min e é exigida pelo endpoint de troca de modo (T-044 consome).
- [ ] Senha nunca aparece em logs; cookie com flags corretas (teste de header).
- [ ] Criação do primeiro usuário via comando de setup (`pnpm setup:user`), não via endpoint público.
- [ ] `POST /auth/login` e `POST /auth/reauth` respondem `200 { csrfToken, elevatedUntil | null }`; `GET /auth/me` inclui `csrfToken`; as três respostas têm `Cache-Control: no-store` e o body não é logado (ADR-0007 N2; contrato do PR #68).
- [ ] Rotação sincronizada: login, reauth, troca de senha, conexão LinkedIn e troca de modo rotacionam a sessão e devolvem o novo token em `X-CSRF-Token` na mesma resposta; o token anterior deixa de valer no mesmo instante (teste de concorrência).
- [ ] O web mantém o token só em memória (nunca `localStorage`/`sessionStorage`/cookie legível/URL) e em `403 CSRF_REJECTED` refaz `GET /auth/me` uma vez; teste Playwright inspeciona storage e cookies.
- [ ] Canário `AuditSnapshotSchema` rejeita `csrfToken`; Pino redige `csrfToken` além de `password`, `cookie`, `authorization`.
- [ ] Endpoints 🔐 (reauth, publicar agora, trocar modo, trocar senha, conectar LinkedIn) exigem sessão elevada **e** `X-CSRF-Token` HMAC vinculado à sessão; caso contrário `401 AUTH_REAUTH_REQUIRED` (ADR-0007 item 3).
- [ ] Controles de mutação de ADR-0007 N4 cobertos por testes negativos (sem sessão, `Origin` diferente, form body, `Origin: null`, method override); `POST /auth/login` é a única exceção à sessão e respeita o rate limit do item 10.
- [ ] `SESSION_SECRET` ≥ 32 bytes e não placeholder, validado no boot com `validateRuntimeEnv` (ADR-0007 item 6; ADR-0004 item 13(a) para o key ring, sem fallback silencioso).

## Fora de escopo

Multiusuário, papéis, OAuth social para login.

## Plano de teste

Supertest para login/logout/reauth/rate limit; Playwright para login no web.

## Riscos de segurança / compliance

Alto: sessão e reautenticação protegem a conta do LinkedIn. Revisão obrigatória de Sentinela.

## Ressalvas de implementação (Sentinela, 2026-10-16)

Resumo das condições normativas; o texto completo está em `docs/adr/0007-auth-and-session-model.md` (N1–N4) e `docs/adr/0004-oauth-token-encryption-at-rest.md` (item 13):

- **CSRF em memória.** `csrfToken` existe só na memória do cliente; qualquer persistência (storage, cookie legível, URL, log, snapshot de auditoria) reprova a revisão. Canário `AuditSnapshotSchema`.
- **`Cache-Control: no-store`** em `/auth/login`, `/auth/reauth`, `/auth/me`; sem logging de body dessas respostas.
- **Rotação sincronizada** do token com a sessão (N2), nunca dois tokens válidos ao mesmo tempo.
- **N1 e N3** (OAuth `state` atômico, PKCE sem fallback) são de T-038, mas a sessão desta tarefa é a que o callback rotaciona; o teste de callbacks concorrentes (G-03) depende da rotação daqui.
- **N4** guard global de mutações (compartilhado com T-008/T-057).
- **ADR-0004 item 13.** `totp_secret_ciphertext` (reservado) e qualquer segredo cifrado desta tarefa usam o `TokenVault` de T-052; parse estrito do key ring, framing autenticado e testes de G-02 são condição de aprovação do PR que cifra.
