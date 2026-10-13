# T-015 · Autenticação single-user com sessão segura

- Épico: EPIC-02 Identity & Editorial Memory
- Responsável (papel/agente): Alicerce (backend) · revisão Sentinela e Atlas
- Branch/floor: `feat/T-015-single-user-auth-sessions`
- Estado: todo
- Dependências: T-005, T-008; decisão de método de login (Atlas/Sentinela, PRD §13)

## Contexto

Um único usuário (Rodrigo), mas o modelo não pode impedir multiusuário. Subir de modo de autonomia exige reautenticação (PRD §6.7).

## Resultado esperado

Login (método a definir por Atlas/Sentinela; hipótese: e-mail + senha forte com hash Argon2id, opcional passkey depois), sessão em cookie `HttpOnly/Secure/SameSite=Lax`, logout, endpoint `POST /auth/reauthenticate` que emite prova de reautenticação com validade de 5 min, guard que injeta `userId` em toda requisição, rate limit em login, página de login no web.

## Critérios de aceite (verificáveis)

- [ ] 5 falhas de login em 1 min bloqueiam por 15 min (teste).
- [ ] Toda rota de domínio exige sessão; teste de acesso anônimo retorna 401.
- [ ] Reautenticação expira em 5 min e é exigida pelo endpoint de troca de modo (T-044 consome).
- [ ] Senha nunca aparece em logs; cookie com flags corretas (teste de header).
- [ ] Criação do primeiro usuário via comando de setup (`pnpm setup:user`), não via endpoint público.

## Fora de escopo

Multiusuário, papéis, OAuth social para login.

## Plano de teste

Supertest para login/logout/reauth/rate limit; Playwright para login no web.

## Riscos de segurança / compliance

Alto: sessão e reautenticação protegem a conta do LinkedIn. Revisão obrigatória de Sentinela.
