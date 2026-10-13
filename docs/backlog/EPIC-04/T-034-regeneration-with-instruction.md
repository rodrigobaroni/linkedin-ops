# T-034 · Regeneração com instrução (nova versão) e troca de hook

- Épico: EPIC-04 Draft Studio
- Responsável (papel/agente): Pêndulo (automação/integrações)
- Branch/floor: `feat/T-034-regeneration-with-instruction`
- Estado: todo
- Dependências: T-033

## Contexto

J2 passos 3–4: regenerar com instrução livre cria nova versão derivada da atual; hooks alternativos substituem a primeira linha e também criam versão.

## Resultado esperado

Endpoint `POST /content-items/:id/regenerate` (instrução opcional, `baseVersionId`) → job `content.regenerate` que passa a versão base + instrução ao motor, respeita Voice Profile e fontes existentes, cria versão com `derivedFromVersionId` e `instruction`; endpoint `POST /content-items/:id/versions/:vid/apply-hook` (índice do hook) cria versão sem chamar IA. Limite de regenerações por item configurável (padrão 10) com aviso.

## Critérios de aceite (verificáveis)

- [ ] Regenerar preserva a versão anterior e grava `instruction` e `derivedFromVersionId`.
- [ ] Instrução contendo "publique agora" não altera estado (instrução é dado para o motor, não comando do sistema).
- [ ] Aplicar hook muda só a primeira linha e cria versão com autor `user`.
- [ ] Regenerar em `APPROVED` revoga aprovação (reusa T-032).

## Fora de escopo

UI (T-035).

## Plano de teste

Supertest + job com adaptador fake.

## Riscos de segurança / compliance

Instrução do usuário vai como dado delimitado para o motor; sem escalada de privilégio por texto.
