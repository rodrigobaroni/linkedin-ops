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

## Fora de escopo

KMS externo (Fase 2 se necessário).

## Plano de teste

Vitest para o vault; Testcontainers para persistência; teste de redaction.

## Riscos de segurança / compliance

Alto; revisão de Sentinela obrigatória.
