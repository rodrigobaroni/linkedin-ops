# Dados pessoais, retenção e LGPD

- Owner: Sentinela; implementação: Alicerce/Estaleiro; conteúdo: Pena
- Versão: 0.1 — 2026-10-13
- Escopo: dados locais, backups e transferências para LinkedIn, OpenAI e Telegram

> Documento técnico de privacidade, não parecer jurídico. Bases legais, avisos e transferências
> internacionais precisam de validação do controlador/assessoria antes de uso por terceiros.

## 1. Papéis e princípios

No cenário inicial self-hosted e single-user, a hipótese é que Rodrigo/controladora definida por ele toma
as decisões de finalidade e meios; provedores e operadores devem ser inventariados contratualmente. O
produto aplica finalidade, adequação, necessidade, livre acesso, qualidade, transparência, segurança,
prevenção, não discriminação e prestação de contas.

Regras práticas:

- coletar o mínimo necessário para curar, gerar, aprovar, agendar e publicar;
- não reutilizar dados de terceiros para prospecting, CRM, recrutamento, ads ou treinamento próprio;
- separar dados fornecidos por Rodrigo de dados obtidos por fonte/LinkedIn, mantendo provenance;
- não enviar segredo, token, senha, session id ou conteúdo irrelevante a provedor;
- definir retenção na criação da tabela/bucket/log, não depois;
- toda exclusão gera evidência sem reter o conteúdo excluído;
- regra contratual mais restritiva do LinkedIn/provedor prevalece sobre o prazo interno.

## 2. Inventário de dados

| Categoria | Exemplos | Origem | Finalidade | Destinos | Sensibilidade |
|---|---|---|---|---|---|
| Conta local | e-mail/login, hash Argon2id, timestamps | Rodrigo | autenticação e segurança | PostgreSQL | alta |
| Sessão/segurança | session hash, IP minimizado, user agent, tentativas | browser/Caddy | acesso, fraude, auditoria | PostgreSQL/logs | alta |
| Conta LinkedIn | `sub`/Person URN, nome/foto mínimos, scopes | LinkedIn OAuth/OIDC | vincular e publicar | PostgreSQL | alta |
| Credenciais LinkedIn | access/refresh token, expiry | LinkedIn | chamada oficial em nome de Rodrigo | PostgreSQL cifrado, memória do worker | crítica |
| Perfil editorial | voz, preferências, tópicos, exemplos | Rodrigo | preservar autenticidade | PostgreSQL, OpenAI minimizado | alta |
| Story Bank | histórias, fatos, pessoas, números, flag “publicável” | Rodrigo | geração fiel | PostgreSQL, OpenAI somente quando necessário | alta; pode conter sensível |
| Fontes | URL, título, autor, trecho, data, conteúdo sanitizado | RSS/URL | curadoria e citação | PostgreSQL, OpenAI | média/alta |
| Conteúdo | oportunidades, drafts, versões, aprovações, posts | sistema/Rodrigo | fluxo editorial e publicação | PostgreSQL, S3, OpenAI/LinkedIn conforme ação | alta |
| Mídia | uploads, renders, alt text, checksum/metadados | Rodrigo/sistema | preview/publicação | S3, LinkedIn | alta antes de publicar |
| LinkedIn activity/analytics | URN, posts, comentários, métricas | LinkedIn API | analytics autorizados | PostgreSQL/cache | alta e contratualmente restrita |
| Telegram | chat/user id, username opcional, update id, status | Telegram/Rodrigo | notificação/vínculo | PostgreSQL, Telegram | média |
| Auditoria | ator, evento, IDs, razão, timestamp, correlation id | sistema | segurança/compliance | PostgreSQL/backup | alta |
| Observabilidade | erro classificado, duração, queue, request id | componentes | operação/incidente | logs/traces | média; sem conteúdo por padrão |

Dados sensíveis de LGPD (saúde, religião, opinião política, biometria etc.) não são necessários. Se uma
história os contiver, marcar como `sensitive`, `publiclyUsable=false` por padrão e bloquear envio a LLM/
publicação até consentimento explícito e finalidade documentada.

## 3. Bases legais propostas

| Tratamento | Base proposta | Limite/ação |
|---|---|---|
| Operar conta, drafts, agenda e publicação solicitada | execução de contrato/procedimentos a pedido do titular (art. 7º V), quando aplicável | Validar enquadramento antes de oferecer a terceiros. |
| Segurança, fraude, auditoria mínima e defesa | legítimo interesse (art. 7º IX) e/ou exercício regular de direitos (VI) | Fazer teste de balanceamento; minimizar IP/UA; acesso restrito. |
| Integrações opcionais LinkedIn/Telegram e histórias publicáveis | consentimento/ação afirmativa e autorização OAuth, conforme finalidade | Consentimento granular, revogável; não “empacotar” analytics desnecessário. |
| Obrigações legais/incidente | cumprimento de obrigação legal/regulatória (II) | Retenção só do necessário e acesso documentado. |
| Dados de terceiros em fontes públicas | legítimo interesse a validar, limitado à curadoria/citação | Não presumir que público = livre; opt-out/exclusão e direitos autorais. |

**[DECISÃO RODRIGO/JURÍDICO]** aprovar controlador, bases legais, teste de legítimo interesse, aviso de
privacidade e mecanismo de transferência internacional. Até isso, o sistema permanece uso pessoal
controlado, sem onboarding de terceiros.

## 4. Matriz de retenção proposta

Prazos contam da última finalidade válida. Um legal hold documentado pode suspender exclusão apenas no
escopo necessário.

| Dado | Prazo ativo | Exclusão/anonimização | Justificativa |
|---|---|---|---|
| Credencial LinkedIn | até desconexão/revogação/expiração | apagar ciphertext/DEK imediatamente; metadata mínima em audit | operação da integração |
| OAuth state/PKCE/nonce | 10 min; usados invalidam imediatamente | purge ≤24 h | anti-CSRF/replay |
| Sessão | idle 7 dias; absoluto 30 dias | purge ≤24 h após expirar/logout | autenticação |
| Tentativas de login/rate-limit | 90 dias | agregar/anonymize depois | detecção de abuso |
| Source raw fetch | até normalização, máximo 7 dias | apagar body; manter hash/provenance | depuração curta |
| SourceItem/oportunidade não publicada | 90 dias | apagar conteúdo/PII; manter contagem anônima | PRD e aprendizado editorial |
| Drafts/versões descartados | 1 ano | excluir texto/mídia; manter evento mínimo | histórico/reversão |
| Conteúdo publicado por Rodrigo | até exclusão solicitada | excluir cópia local; LinkedIn é ação separada | histórico editorial do próprio autor |
| Story Bank/Voice Profile | até exclusão/versão substituída + 30 dias | purge conteúdo; manter ID/hash de evento | finalidade persistente controlada por Rodrigo |
| Mídia não publicada | 90 dias ou 30 dias após descarte | delete S3 e versões/thumbnail | minimização |
| Mídia publicada | até exclusão solicitada | delete S3; LinkedIn tratado separadamente | histórico/reuso autorizado |
| Notificações/updates Telegram | 30 dias | remover corpo; manter status agregado | suporte/retry |
| Audit events | 2 anos | anonimizar/remover payload pessoal; manter evento mínimo | segurança e prestação de contas |
| Logs de app | 30 dias | purge automático | operação |
| Logs de segurança | 180 dias | purge/aggregate | investigação e balanceamento |
| Traces | 14 dias | purge automático | diagnóstico |
| Backups cifrados | 35 dias rolling | expiração automática; tombstones pós-restore | recuperação de desastre |
| Exports do titular | 7 dias | exclusão automática e link revogado | portabilidade/acesso |

### Overrides obrigatórios para dados vindos do LinkedIn Marketing API

Se Community Management for aprovado, aplicar no mínimo os limites oficiais atuais:

- profile data de **outro membro**: somente cache por até 24 horas, não armazenamento;
- social activity data de membros (posts, comentários, likes, mentions e metadados): até 48 horas;
- usar a menor duração quando um campo cair em mais de uma regra;
- Person ID/URN e profile do membro autenticado podem não ter limite específico na tabela oficial, mas
  continuam sujeitos a necessidade, consentimento e exclusão;
- não exportar/combinar Member Data e cessar coleta quando o cliente desconectar/solicitar.

**[DECISÃO RODRIGO]** aprovar os prazos propostos. Até aprovação, implementar os prazos mais curtos e não
habilitar analytics/leitura do LinkedIn.

## 5. OpenAI e minimização

- Enviar somente os trechos e campos necessários ao job, com source IDs opacos e sem credenciais.
- Não enviar Story Bank completo; selecionar entradas marcadas `publiclyUsable=true` relevantes à tarefa.
- Usar Responses API com `store:false` e sem ferramentas livres. Não usar response/conversation IDs como
  armazenamento editorial.
- Segundo a documentação oficial consultada, dados da API não são usados para treinamento sem opt-in.
  Abuse monitoring logs podem reter conteúdo por até 30 dias por padrão; Zero Data Retention/Modified
  Abuse Monitoring dependem de aprovação e configuração. `store:false` reduz application state, mas não
  equivale por si só a ZDR.
- Registrar localmente modelo, prompt version, schema version, tokens/custo e hash de input; não prompt/
  resposta integral em observabilidade.
- Revisar Data Processing Addendum, região/transferência e configuração do projeto antes de produção.

Fonte oficial: [OpenAI — Data controls](https://developers.openai.com/api/docs/guides/your-data).

## 6. Transparência, consentimento e preferência

Antes de conectar LinkedIn/Telegram ou habilitar LLM:

- mostrar dados coletados, finalidade, provedor, retenção, como desconectar e como excluir;
- ação afirmativa separada para cada integração; não pré-marcar;
- exibir scopes exatos no app além da tela OAuth;
- manter `consentVersion`, timestamp, finalidade e scopes, sem copiar tokens;
- revogação interrompe novas coletas/jobs imediatamente;
- Story Bank tem flag por entrada: privado, utilizável em geração, ou publicável; privado é default.

Aviso de privacidade deve identificar controlador, contato, operadores/suboperadores, transferências,
direitos, retenção e canal de incidente.

## 7. Direitos do titular e SLAs internos

Endpoint/UI autenticado e canal alternativo permitem:

- confirmação e acesso;
- correção;
- exportação em JSON estruturado e mídia separada;
- informação sobre compartilhamentos/provedores;
- revogação de consentimento/desconexão;
- exclusão/anonimização, ressalvadas obrigações legais;
- oposição e revisão humana de decisões automatizadas relevantes.

Fluxo:

1. autenticar solicitante com reautenticação; não pedir mais documento que o necessário;
2. criar request com prazo/status, sem espalhar PII em ticket/log;
3. localizar por `userId` em PostgreSQL, S3, filas, logs consultáveis e integrações;
4. exportar por URL assinada curta (máximo 24 h; arquivo expira em 7 dias);
5. exclusão cria tombstone, cancela jobs, desconecta tokens, apaga S3/DB e propaga aos operadores quando
   aplicável; backups expiram em 35 dias e tombstone é reaplicado após restore;
6. responder com dados excluídos, preservados e base/retention de cada exceção.

SLA interno proposto: confirmar recebimento em 2 dias úteis e concluir em até 15 dias, sem afirmar que
todo direito tem o mesmo prazo legal. A ANPD informa acesso imediato e relatório completo em até 15 dias
em certos pedidos; jurídico deve validar o caso concreto.

## 8. Backups, logs e exports

- Backup diário cifrado, chave separada do storage, acesso mínimo, checksum e restore trimestral.
- Não copiar `.env`, secret files, token plaintext ou signed URLs para backup/documentação.
- Restore ocorre em rede isolada, com workers desligados; migrations, tombstones de exclusão/revogação e
  key versions são validados antes de egress.
- Logs usam allowlist e redaction; nenhuma busca por conteúdo integral deve ser necessária para operar.
- Export privado usa bucket/prefixo separado, sem listagem, SSE e URL curta; nunca envia por Telegram.
- Métricas agregadas só são anônimas quando reidentificação for razoavelmente inviável; pseudonimização
  ainda é dado pessoal.

## 9. Incidentes de dados pessoais

1. Conter, preservar evidência e rotacionar/revogar credenciais afetadas.
2. Classificar categorias, titulares, volume, duração, controles e risco/dano relevante.
3. Registrar decisão e responsável; não incluir conteúdo pessoal desnecessário no canal do incidente.
4. Quando aplicável, controlador comunica ANPD e titulares no prazo regulatório. A regulamentação atual
   da ANPD indica 3 dias úteis a partir do conhecimento para incidente com risco/dano relevante, ressalvada
   regra específica.
5. Corrigir, testar e documentar postmortem sem culpa; revisar threat model e retenção.

Fonte oficial: [ANPD — Comunicação de Incidente de Segurança](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis).

## 10. Critérios de aceite

- inventário de tabelas/campos/buckets/logs mapeado a esta matriz;
- jobs de retenção idempotentes com dry-run, métricas e teste por categoria;
- export/exclusão integrados provam cobertura de DB, S3, filas e tokens;
- restore reaplica tombstones antes de iniciar workers;
- `store:false` testado em toda chamada Responses API e conteúdo sensível minimizado;
- TTL 24 h/48 h aplicado quando dados LinkedIn restritos existirem;
- privacy notice, consent records e contato do controlador disponíveis;
- DPA/subprocessadores/transferência internacional revisados.

## 11. Perguntas abertas — decisão de Rodrigo

1. **[DECISÃO RODRIGO]** Quem é o controlador formal e qual contato público atende titulares/incidentes?
2. **[DECISÃO RODRIGO]** Aprovar ou ajustar cada prazo da matriz, especialmente audit (2 anos), drafts
   descartados (1 ano), logs de segurança (180 dias) e backups (35 dias).
3. **[DECISÃO RODRIGO/JURÍDICO]** Bases legais e mecanismo de transferência internacional para OpenAI,
   LinkedIn e Telegram.
4. **[DECISÃO RODRIGO]** Conteúdo publicado deve permanecer local até exclusão ou ter prazo fixo?
5. **[DECISÃO RODRIGO]** Quais tipos de histórias são sensíveis/proibidos no Story Bank?

## 12. Referências oficiais

- [Lei nº 13.709/2018 — LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [ANPD — Direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares)
- [ANPD — Comunicação de incidente](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis)
- [LinkedIn API Terms](https://www.linkedin.com/legal/l/api-terms-of-use)
- [LinkedIn Marketing API Data Storage Requirements](https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements)
- [OpenAI API Data Controls](https://developers.openai.com/api/docs/guides/your-data)
