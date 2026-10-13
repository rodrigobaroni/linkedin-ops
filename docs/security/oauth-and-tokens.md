# OAuth, tokens, sessão e webhooks

- Owners: Alicerce (auth/storage), Pêndulo (LinkedIn/Telegram), Estaleiro (secrets/deploy)
- Revisão de segurança: Sentinela
- Versão: 0.1 — 2026-10-13

## 1. Decisões de desenho

- A autenticação do dashboard é separada da autorização da conta LinkedIn. Hipótese atual: login local
  single-user com Argon2id e sessão server-side; decisão final de Rodrigo está aberta.
- LinkedIn usa Authorization Code (3-legged OAuth) em backend confidencial.
- O callback só conecta uma conta a uma sessão já autenticada; não cria implicitamente usuário local.
- Tokens só existem em `api`/`worker`, cifrados em repouso. `web`, browser, OpenAI, Telegram e logs nunca
  recebem token nem client secret.
- Toda elevação de modo de autonomia exige reautenticação local e audit event.

## 2. Fluxo LinkedIn OAuth 2.0

### 2.1 Início

1. Rodrigo autenticado envia `POST /api/v1/integrations/linkedin/connect` same-origin.
2. A API aplica CSRF, rate limit e reautenticação recente quando estiver substituindo uma conexão.
3. Gera `state` com CSPRNG de pelo menos 256 bits. Persiste somente hash HMAC/SHA-256, `sessionId`,
   `userId`, scopes, redirect lógica allowlisted, `createdAt`, `expiresAt` (máximo 10 min) e `usedAt=null`.
4. Quando PKCE estiver habilitado, gera `code_verifier` CSPRNG com 43–128 caracteres URL-safe e
   `code_challenge = BASE64URL(SHA256(verifier))`, método `S256`. O verifier é cifrado/armazenado
   server-side com o registro transitório e eliminado depois da troca.
5. Redireciona para `https://www.linkedin.com/oauth/v2/authorization` com `response_type=code`, client id,
   redirect URI fixa, `state` e scopes mínimos.

Não aceitar `returnTo`, host ou redirect arbitrário. Um retorno de UI, se necessário, é enum/rota relativa
guardada server-side e validada por allowlist.

### 2.2 Status do PKCE

A documentação oficial comprova PKCE `S256` para clientes nativos. A página do fluxo web confidencial não
lista `code_challenge`/`code_verifier` como parâmetros normativos, embora erros atuais mencionem code
verifier. Portanto:

- preferir Authorization Code + PKCE `S256` **se o app real aceitar o fluxo completo**;
- manter o client secret na troca, mesmo com PKCE, para o backend confidencial;
- não lançar um fluxo parcialmente testado nem fazer fallback silencioso no callback;
- se PKCE não for suportado para o app, registrar evidência e usar Authorization Code confidencial com
  `state`, redirect fixa, code single-use, TLS e troca imediata; abrir revisão quando a documentação mudar.

PKCE não substitui `state`; resolve ameaça diferente.

### 2.3 Callback

`GET /api/v1/auth/linkedin/callback`:

1. Limitar query/headers; aceitar exatamente um de `code` ou `error` e exigir `state`.
2. Calcular hash do state recebido e buscar registro não expirado, não usado e vinculado à sessão/usuário.
3. Comparar valores em tempo constante; marcar `usedAt` atomicamente **antes** da troca para impedir replay.
4. Em erro, registrar apenas classe/correlation id; nunca query completa ou authorization code.
5. Trocar code imediatamente, server-to-server, em
   `POST https://www.linkedin.com/oauth/v2/accessToken`, usando redirect URI byte-for-byte igual e PKCE
   quando aprovado. Não seguir redirects não esperados.
6. Validar Content-Type, tamanho e schema da resposta; limitar tokens para campo de até 4 KiB.
7. Comparar scopes efetivos; sem `w_member_social`, não ativar publicação.
8. Cifrar/persistir tokens e metadados em transação, apagar state/verifier e rotacionar a sessão local.
9. Redirecionar para rota fixa da UI sem `code`, token ou erro sensível.

Callbacks GET não alteram qualquer conteúdo editorial, aprovação, schedule ou modo de autonomia.

### 2.4 OIDC, se usado

Ao solicitar `openid profile`, validar ID Token por metadata/JWKS oficial:

- assinatura `RS256`, `iss=https://www.linkedin.com`, `aud=client_id`, `exp`, `iat` e `nonce` se enviado;
- não aceitar algoritmo vindo do token sem allowlist;
- cachear JWKS com TTL e rotação segura;
- usar `sub`/Person ID somente para vincular a conexão; não tratar como identidade civil verificada;
- não solicitar `email` sem finalidade documentada.

## 3. Armazenamento cifrado em repouso

### 3.1 Envelope encryption

Para cada registro `OAuthCredential`:

1. Gerar DEK aleatória de 256 bits.
2. Cifrar separadamente access e refresh token com AES-256-GCM, IV aleatório de 96 bits por operação e
   tag de autenticação; nunca reutilizar IV com a mesma DEK.
3. AAD canônica inclui `credentialId`, `userId`, `provider=linkedin`, tipo de token e `schemaVersion`.
4. Envelopar a DEK com a KEK atual (`ENCRYPTION_KEY`) usando AEAD ou KMS quando adotado.
5. Persistir apenas `ciphertext`, `iv`, `authTag`, `wrappedDek`, `keyVersion`, scopes e expirations.

`ENCRYPTION_KEY` deve ser base64 que decodifica para exatamente 32 bytes, gerada por CSPRNG. Fica fora do
banco, imagem, Git, logs, frontend e backup comum; em produção, injetada por secret manager/Docker secret
com permissão mínima. A aplicação falha ao iniciar com placeholder, vazio ou formato inválido.

Hash não substitui cifra para tokens, pois o sistema precisa recuperá-los. O client secret e chaves de API
ficam em secret storage de runtime; não precisam ir ao banco.

### 3.2 Limites de acesso

- Somente método dedicado `TokenVault.withAccessToken(credentialId, fn)` pode decifrar em memória e deve
  reduzir o tempo de vida do plaintext.
- Controllers, DTOs e serializers não expõem campos cifrados nem metadados suficientes para reconstrução.
- `web` não recebe `DATABASE_URL`, `LINKEDIN_CLIENT_SECRET`, `ENCRYPTION_KEY` ou chaves de integração.
- DB role de runtime não acessa material de secret deployment; operador de backup não recebe KEK.
- Erros nunca incorporam request config de cliente HTTP, pois ela pode conter `Authorization`.

### 3.3 Rotação da KEK

- Versões: `activeKeyVersion` para escrita; key ring aceita leitura da atual e anteriores durante janela
  curta de migração.
- Rotação cria nova KEK, atualiza versão ativa e rewraps DEKs em batches idempotentes; não precisa
  recifrar tokens.
- Job registra somente contagens e IDs internos, nunca material criptográfico.
- Verificar 100% dos registros com decrypt autenticado, então retirar a chave antiga após backups que a
  exigem expirarem ou serem re-encriptados.
- Rotação de emergência revoga/desconecta tokens se houver suspeita de exposição da KEK.
- Teste obrigatório: chave incorreta, AAD alterada e tag alterada devem falhar fechado sem plaintext.

## 4. Expiração, refresh e revogação

### 4.1 Access e refresh

- Persistir `expiresAt` calculado do `expires_in`; não presumir duração, mesmo que a documentação atual
  indique normalmente 60 dias.
- Alertar Rodrigo em 14, 7, 3 e 1 dia se reautorização for necessária; não colocar token na notificação.
- Programmatic refresh só existe para apps/parceiros aprovados. Usar `refresh_token` apenas se efetivamente
  retornado e autorizado; a documentação atual menciona normalmente 365 dias sem extensão do TTL original.
- Um lock por credential evita refresh concorrente. Atualização usa optimistic concurrency e substitui
  access/refresh token de forma atômica quando um novo refresh token for retornado.
- `invalid_grant`, 401/403 persistente ou revogação marca `reauthorization_required`, pausa publicações e
  notifica; nunca reexecuta indefinidamente.
- Se refresh programático não estiver disponível, iniciar novo Authorization Code flow antes do expiry;
  não usar cookies/scraping para “renovar”.

### 4.2 Desconectar/revogar

Ao desconectar:

1. Em transação, marcar credential `revoked_pending`, cancelar/pausar jobs futuros e invalidar caches.
2. Se houver endpoint de revogação oficialmente documentado e habilitado para o produto do app, chamá-lo
   com timeout/retry seguro.
3. Apagar ciphertexts, wrapped DEK e verifier/state; manter apenas audit metadata mínima sem token.
4. Orientar Rodrigo a remover a autorização nas configurações do LinkedIn quando revogação programática
   não estiver confirmada.
5. Purge em backups ocorre por expiração da janela documentada; restaurar backup antigo deve executar
   tombstones de revogação antes de liberar workers.

**Ponto não verificado:** não foi confirmada na documentação pública consultada uma API de revogação
aplicável ao produto self-service. Não inventar endpoint.

## 5. Sessões e cookies

- Sessão server-side com ID opaco CSPRNG ≥256 bits; apenas hash do ID na tabela, se compatível com o
  framework escolhido.
- Cookie: `__Host-session=<opaque>; Path=/; HttpOnly; Secure; SameSite=Lax`; sem `Domain`.
- Expiração absoluta proposta: 30 dias; idle timeout: 7 dias; sessão elevada: 15 min. Rotacionar no login,
  reautenticação, troca de senha, conexão OAuth e mudança de autonomia.
- Logout remove registro server-side e expira cookie. “Logout de todos” invalida todas as sessões.
- Credencial local: Argon2id com parâmetros calibrados no host; password mínimo 15 caracteres para
  single-user; rate limit e atraso progressivo; não logar senha.
- Mensagem de login é genérica. Registrar tentativa com IP truncado/hasheado conforme política, user agent
  minimizado e correlation id.
- Headers: CSP restritiva, HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` mínima.

## 6. CSRF e CORS

Produção é same-origin via Caddy; CORS desabilitado por padrão.

Para toda mutação `POST/PUT/PATCH/DELETE`:

- exigir sessão válida;
- validar `Origin` exatamente contra `APP_BASE_URL`; usar Fetch Metadata como defesa adicional, não única;
- exigir `Content-Type: application/json` e `X-Requested-With: linkedin-ops`;
- para endpoints com risco alto (troca de modo, conexão/desconexão, publicação imediata), usar token CSRF
  ligado à sessão e reautenticação recente;
- rejeitar body/form simples e métodos override;
- callback OAuth é exceção GET limitada, protegida por state single-use e sem alteração editorial.

Em desenvolvimento, origem/redirect são allowlists explícitas; nunca refletir `Origin` com credentials.

## 7. Webhook Telegram

Inbound não é autoridade editorial. Se habilitado:

- configurar URL HTTPS imprevisível e `secret_token` forte no `setWebhook`;
- validar exatamente o header `X-Telegram-Bot-Api-Secret-Token` antes de parsear body; comparação constante;
- limitar corpo, timeout e Content-Type; Zod strict no update;
- permitir apenas `chat_id`/`from.id` previamente vinculados por fluxo autenticado e código single-use;
- deduplicar `update_id` com unique constraint e TTL; rejeitar updates antigos;
- nunca colocar bot token em URL, log ou frontend;
- respostas usam texto escapado/parse mode controlado para evitar links/markup inesperados;
- comandos permitidos no máximo: vincular, testar, consultar status e ack. Aprovar, elevar autonomia,
  editar ou publicar ficam proibidos sem nova decisão e threat review.

Telegram IP allowlist pode ser defesa adicional, nunca substitui secret header e validação de identidade.

## 8. Rate limiting mínimo

Valores são baseline e devem ser medidos; aplicar por IP **e** por conta/sessão quando houver.

| Rota/ação | Limite inicial | Resposta/controle |
|---|---:|---|
| Login | 5/15 min/IP + 10/h/conta | 429 genérico; atraso progressivo; alerta de burst. |
| Início OAuth | 5/10 min/sessão | Um state ativo por sessão/app; anterior invalidado. |
| Callback OAuth | 20/10 min/IP | State é controle principal; body/query pequeno. |
| Publicar agora | 3/10 min/usuário | Além de idempotência e state machine. |
| Upload | 20/h/usuário e quota de bytes | Limite por arquivo/dia; abortar streaming cedo. |
| Regenerar IA | 10/h/item, 50/dia/usuário | Budget/custo e fila; sem paralelismo ilimitado. |
| Webhook Telegram | 120/min/IP + 30/min/chat | Dedupe por update; não retry interno síncrono. |
| API geral mutável | 60/min/sessão | Ajustar por endpoint, sem compartilhar bucket com health. |

Rate limit na borda é defesa em profundidade; a API aplica o controle autoritativo. Armazenamento distribuído
precisa de operação atômica e TTL. Não confiar em `X-Forwarded-For` fora de proxies explicitamente trusted.

## 9. Logging e testes de segurança

Redigir por nome e por padrão de valor: `authorization`, `cookie`, `set-cookie`, `code`, `state`, `nonce`,
`code_verifier`, `access_token`, `refresh_token`, client secret, session id, API keys, signed URL query.
Preferir allowlist de campos. Não logar request/response integral de OAuth.

Testes mínimos:

- state errado/ausente/expirado/reutilizado e sessão divergente;
- callback concorrente troca code no máximo uma vez;
- redirect/returnTo malicioso e Host spoofing;
- scope ausente/reduzido e token expirado/revogado;
- decrypt com AAD/tag/key erradas; rotação com interrupção e retomada;
- varredura de logs/traces/Problem Details com tokens canário;
- CSRF cross-site, form-urlencoded, Origin `null`, CORS preflight e cookie sem flags;
- webhook sem/errado/replayed secret/update/chat;
- rate-limit distribuído e headers de proxy forjados.

## 10. Perguntas abertas — decisão de Rodrigo

1. **[DECISÃO RODRIGO]** Confirmar login local separado do LinkedIn OIDC. Recomendação: separar para não
   acoplar acesso ao dashboard à disponibilidade/consentimento do LinkedIn.
2. **[DECISÃO RODRIGO]** Confirmar sessão absoluta de 30 dias, idle de 7 dias e reautenticação de 15 min
   para ações sensíveis.
3. **[DECISÃO RODRIGO]** Confirmar que Telegram inbound não aprova/publica no MVP.
4. **[DECISÃO RODRIGO]** Definir canal seguro de recuperação do login single-user; e-mail sem infraestrutura
   dedicada pode ampliar a superfície. Até decisão, recuperação é procedimento administrativo local.

## 11. Referências

- [LinkedIn Authorization Code Flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- [LinkedIn OAuth for Native Clients / PKCE](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow-native)
- [LinkedIn programmatic refresh tokens](https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens)
- [LinkedIn OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)
- [OAuth 2.0 Security Best Current Practice — RFC 9700](https://www.rfc-editor.org/rfc/rfc9700)
- [PKCE — RFC 7636](https://www.rfc-editor.org/rfc/rfc7636)
- [Telegram Bot API — setWebhook](https://core.telegram.org/bots/api#setwebhook)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
