# T-016 · Voice Profile: modelo, versionamento e API

- Épico: EPIC-02 Identity & Editorial Memory
- Responsável (papel/agente): Alicerce (backend) · formato definido por Pena
- Branch/floor: `feat/T-016-voice-profile-model-api`
- Estado: todo
- Dependências: T-008, T-015; esquema do Voice Profile em `docs/editorial/editorial-system.md` (Pena)

## Contexto

O Voice Profile é usado em toda geração e precisa ser versionado para rastrear qual versão produziu cada rascunho (J6).

## Resultado esperado

Entidade `VoiceProfile` versionada (tom, estrutura preferida, vocabulário preferido/evitado, temas que não publica, exemplos de posts aprovados, idioma padrão), endpoints `GET /voice-profile`, `PUT /voice-profile` (cria nova versão), `GET /voice-profile/versions`, schema no `contracts`.

## Critérios de aceite (verificáveis)

- [ ] `PUT` cria nova versão; versões anteriores permanecem (teste).
- [ ] `ContentVersion.voiceProfileVersionId` é preenchível (coluna e contrato existem).
- [ ] Validação Zod rejeita exemplos acima de 3 000 caracteres cada e lista vazia de tom.
- [ ] Auditoria registra cada alteração.

## Fora de escopo

UI (T-017), importação de posts antigos (Fase 2).

## Plano de teste

Supertest; teste de integração com Testcontainers para versionamento.

## Riscos de segurança / compliance

Dados pessoais do autor; só acessíveis pelo próprio `userId`.
