# T-057 · Endurecimento de sessão e web (cookies, CSRF, rate limit, cabeçalhos)

- Épico: EPIC-10 Security, Reliability & Deployment
- Responsável (papel/agente): Alicerce (backend) · findings e revisão Sentinela
- Branch/floor: `security/T-057-session-web-hardening`
- Estado: todo
- Dependências: T-015, T-050

## Contexto

Dashboard exposto na internet, controlando a conta do LinkedIn. Findings do threat model (T-050) relativos a sessão, CSRF, callbacks e abuso.

## Resultado esperado

Cookies `HttpOnly/Secure/SameSite=Lax`, proteção CSRF para mutações (double-submit ou cabeçalho custom + origem verificada), rate limit por IP/sessão em login, reauth, callbacks e endpoints de ação, cabeçalhos (CSP, HSTS, X-Content-Type-Options, Referrer-Policy), rotação de sessão no login, expiração absoluta e ociosa, revogação de sessões.

## Critérios de aceite (verificáveis)

- [ ] Teste de CSRF (requisição cross-origin com cookie) é bloqueada.
- [ ] Rate limit em `POST /auth/login` e `/auth/reauthenticate` verificado.
- [ ] Cabeçalhos verificados por teste de integração.
- [ ] Sessão expira após 12 h de ociosidade e 7 dias absolutos (hipótese; Sentinela confirma).

## Fora de escopo

WAF; 2FA (Fase 2, se decidido).

## Plano de teste

Supertest; scan simples (ex.: `zap-baseline`) sob flag.

## Riscos de segurança / compliance

Alto; revisão de Sentinela.
