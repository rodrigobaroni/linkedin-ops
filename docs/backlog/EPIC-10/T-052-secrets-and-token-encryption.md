# T-052 · Gestão de segredos e cifra de tokens em repouso

- Épico: EPIC-10 Security, Reliability & Deployment
- Responsável (papel/agente): Alicerce (backend) · especificação e revisão Sentinela
- Branch/floor: `security/T-052-secrets-token-encryption`
- Estado: todo
- Dependências: T-005, T-008, T-050

## Contexto

Tokens OAuth (LinkedIn), token do bot e chave da OpenAI nunca em Git, logs, frontend ou prompts. Tokens de usuário cifrados em repouso com chave fora do banco (`ENCRYPTION_KEY`).

## Resultado esperado

Módulo `SecretsVault` (AES-256-GCM com chave derivada de `ENCRYPTION_KEY`, versão de chave no registro para rotação futura), usado por `LinkedInConnection` e `TelegramLink`; validação de presença/força das chaves no boot; redaction em Pino; regra de lint/semgrep simples contra `console.log` de objetos sensíveis; documentação de rotação de chave em `docs/security/`.

## Critérios de aceite (verificáveis)

- [ ] Token gravado no banco é ilegível sem a chave (teste lê a coluna crua).
- [ ] Boot com `ENCRYPTION_KEY` curta ou ausente falha com mensagem clara.
- [ ] Logs de requisição com token no header/corpo aparecem redigidos (teste).
- [ ] Procedimento de rotação documentado e testado em ambiente de teste (re-cifra com nova versão).
- [ ] **Gate G-02 (threat-model §8):** teste integrado prova cifra AEAD (AES-256-GCM com AAD = id do registro), rotação de `key_version` e ausência de tokens em banco (texto claro), logs e traces OTel; evidência anexada ao PR.

## Condições herdadas de T-005 (schema base, PR #76)

O schema já nasce com as colunas do envelope (ADR-0004 §1) e com `CHECK`s all-or-none; T-052 implementa a
cifra e deve cobrir **todos** os envelopes, não só `oauth_tokens`:

- `oauth_tokens`: `access_token_ciphertext`, `refresh_token_ciphertext`, `wrapped_dek`, `key_version`.
- `users`: `totp_secret_ciphertext`, `totp_wrapped_dek`, `totp_key_version` (mesmo envelope; `CHECK` todos nulos ou todos preenchidos).
- `oauth_states`: `code_verifier_ciphertext` + `code_verifier_key_version` (`CHECK` all-or-none); TTL de 10 min via `expires_at` (indexado) — o job de purge de `oauth_states` expirados/usados (≤ 24 h, `data-and-lgpd.md` §4) é entregue aqui ou em T-038, nunca deixado para depois.
- AAD canônica `"<schemaVersion>|<provider>|<userId>|<credentialId>|<tokenType>"` com `tokenType` ∈ `access | refresh | dek | totp | code_verifier`: um ciphertext nunca pode ser movido entre linhas, colunas ou usuários.
- Rotação de KEK (`keys:rotate`) re-envelopa as DEKs das três tabelas; verificação de 100% das linhas com decrypt autenticado.
- Testes de adulteração (tag, AAD, chave errada, frame truncado) para cada envelope; nenhum caminho devolve plaintext em falha.
- Roles de banco (ADR-0004 §9, com Estaleiro): role de runtime sem `UPDATE`/`DELETE` em `draft_versions`, `approvals`, `audit_events` (hoje só o trigger protege) e sem acesso ao material de chave.
- Nomenclatura: o módulo descrito como `SecretsVault` aqui é o `TokenVault` do ADR-0004; adotar um nome só.

## Fora de escopo

KMS externo (Fase 2 se necessário).

## Plano de teste

Vitest para o vault; Testcontainers para persistência; teste de redaction.

## Riscos de segurança / compliance

Alto; revisão de Sentinela obrigatória.
