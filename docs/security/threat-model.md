# Threat model — LinkedIn Ops

- Owner: Sentinela (Security & LinkedIn Compliance)
- Versão: 0.2 — 2026-10-22 (módulo Carreira e leitura anônima de vagas, ADR-0008)
- Método: STRIDE, com referências ao OWASP ASVS 5.0
- Escopo: `web`, `api`, `worker`, `editorial-engine`, PostgreSQL/pg-boss, S3-compatible,
  OpenAI, LinkedIn API, Telegram, Caddy e Oracle Cloud; módulo Carreira (CV base, busca anônima de
  páginas de vagas, CV adaptado em PDF)
- Relacionados: `oauth-and-tokens.md`, `linkedin-policy.md`, `data-and-lgpd.md`,
  `prompt-injection.md`, `docs/architecture/system-overview.md`

## 1. Veredito da Onda 1

**APROVADO COM RESSALVAS.** O desenho tem separação adequada entre apresentação, casos de uso,
jobs e motor editorial, mas produção deve permanecer em modo assistido até fechar os gates G-01 a
G-06 abaixo. Não há finding critical confirmado no checkout atual; existem riscos high que podem
bloquear publicação segura se virarem implementação sem os controles especificados.

Este documento é um threat model de arquitetura, não evidência de que os controles já foram
implementados.

## 2. Critério de severidade

| Severidade | Critério operacional |
|---|---|
| **critical** | Comprometimento provável de conta/token ou publicação arbitrária em larga escala; exploração remota simples; requer bloquear release. |
| **high** | Exposição relevante de dados, bypass de aprovação/autorização ou publicação duplicada/indevida; bloquear feature afetada. |
| **medium** | Impacto limitado, exige pré-condições, ou degradação relevante de confiabilidade/compliance; corrigir antes de produção geral. |
| **low** | Hardening, defesa em profundidade ou impacto operacional pequeno; corrigir no ciclo planejado. |

## 3. Ativos e objetivos de proteção

| Ativo | Confidencialidade | Integridade | Disponibilidade | Observação |
|---|---:|---:|---:|---|
| Access/refresh tokens do LinkedIn e client secret | crítica | crítica | alta | Permitem agir em nome do perfil. |
| Sessões e credenciais locais | crítica | crítica | alta | Sessão roubada permite operar o dashboard. |
| Chaves OpenAI, Telegram, S3, banco e `ENCRYPTION_KEY` | crítica | crítica | alta | A chave de envelope nunca pode residir no banco cifrado por ela. |
| Aprovações, modo de autonomia, schedules e idempotency keys | alta | crítica | alta | Alteração indevida pode publicar conteúdo não aprovado ou duplicado. |
| Drafts, Voice Profile e Story Bank | alta | alta | média | Podem conter histórias, preferências e dados pessoais de Rodrigo. |
| Fontes, oportunidades e afirmações factuais | média | alta | média | Proveniência íntegra é requisito editorial. |
| Mídia e URLs assinadas | alta antes da publicação | alta | média | Upload pode carregar conteúdo ativo/malicioso. |
| Audit log e correlações de jobs | alta | crítica | alta | Necessários para atribuição e investigação sem registrar segredos. |
| Dados pessoais de autores/comentaristas | alta | alta | média | Sujeitos à LGPD e às restrições específicas do LinkedIn. |
| Backups, exports e observabilidade | alta | alta | alta | Cópias frequentemente escapam dos controles primários. |
| CV base e CVs adaptados | alta | alta | média | Dados pessoais e profissionais de Rodrigo; nunca em logs, traces ou Problem Details. |
| Reputação da conta pessoal, do app e do IP da VM perante o LinkedIn | — | — | alta | Leitura anônima de vagas (ADR-0008) pode levar a bloqueio que afete a publicação. |

## 4. Atores

- **Rodrigo:** operador legítimo e titular da conta conectada; pode errar, revogar consentimento ou
  ter a sessão comprometida.
- **Administrador de infraestrutura:** acesso privilegiado a Oracle Cloud, banco, volumes e deploy;
  ação deve ser auditável e usar MFA.
- **Atacante externo:** tenta credential stuffing, CSRF, SSRF, upload malicioso, abuso de callback,
  exploração de dependência ou DoS.
- **Publicador interno comprometido:** processo `worker` ou credencial que tenta contornar aprovação,
  reexecutar job ou exfiltrar tokens.
- **Autor de conteúdo externo:** controla RSS, artigo, comentário, nome ou URL e pode inserir instruções
  adversariais; seu conteúdo é sempre não confiável.
- **Provedores externos:** LinkedIn, OpenAI, Telegram e S3/OCI; respostas e webhooks são autenticados e
  validados, nunca implicitamente confiados.
- **Dependência/maintainer comprometido:** supply-chain de npm, imagem de container ou GitHub Action.

## 5. Fronteiras de confiança e fluxos

1. Browser público → Caddy → `web`/`api`: HTTPS, cookie de sessão e entradas hostis.
2. `api` → PostgreSQL/pg-boss: fronteira de persistência e autorização; toda raiz é escopada por
   `userId` mesmo no modo single-user.
3. `worker` → internet: único componente com saída para RSS, OpenAI, LinkedIn e Telegram; egress deve
   ser mínimo e observável.
4. `api`/`worker` → S3: mídia privada, uploads não confiáveis e URLs assinadas curtas.
5. Oracle Cloud/Caddy → containers: borda pública; Postgres, S3 admin e health do worker não ficam
   expostos à internet.
6. Conteúdo externo → `editorial-engine` → OpenAI: cruzamento de dado não confiável para um modelo que
   produz saída também não confiável, validada antes de persistir ou agir.

Fluxo de publicação de alta criticidade:

```text
sessão autenticada → versão imutável → aprovação vinculada à versão
→ schedule(timezone explícito) → job singleton → revalidação da política
→ LinkedIn API oficial → persistência do URN → auditoria/notificação
```

Nenhuma saída de LLM, Telegram ou fonte externa pode iniciar esse fluxo diretamente.

## 6. Superfícies de ataque

| Superfície | Entrada não confiável | Controle mínimo |
|---|---|---|
| Login/logout/reset | credenciais, cookies, headers | Argon2id, rate limit, sessão rotacionada, mensagens não enumeráveis. |
| OAuth authorize/callback | query `code/state/error`, redirect | `state` single-use, redirect fixa, troca server-side, PKCE quando comprovadamente suportado. |
| API REST | JSON, ids, paginação, uploads | autenticação/autorização em objeto, Zod strict, limites, CSRF, Problem Details sem detalhes sensíveis. |
| Webhook Telegram | headers/body/update id | secret token, chat/user allowlist, dedupe, limite de corpo; nunca aprova/publica. |
| RSS/URLs | DNS, redirects, HTML/XML | allowlist, proteção SSRF, limites de bytes/tempo, parser seguro, sanitização e provenance. |
| Páginas de vagas (Carreira) | URL do usuário, DNS, redirects, HTML | `SafeHttpClient` (SSRF, 3 redirects, 2 MB, 15 s), cliente sem cookies/tokens, limite por domínio, recuo em 429/999/login wall, conteúdo como dado (ADR-0008). |
| Upload de CV (PDF) | bytes, metadados, texto embutido | multipart só nessa rota, ≤ 5 MB, magic bytes, extração de texto sem executar conteúdo, PDF original descartado. |
| Upload de mídia | bytes, MIME, nome e metadados | magic bytes, re-encode, limites, objetos privados, nomes gerados, antivírus quando aplicável. |
| Jobs/scheduler | payload e retries | schema strict, assinatura lógica por tipo, singleton, transação/outbox, dead-letter e revalidação. |
| OpenAI | prompt/output/model metadata | `store:false`, sem segredos, sem tools livres, Structured Outputs strict e validação pós-modelo. |
| LinkedIn API | token, resposta, 429/5xx | escopos mínimos, headers/versionamento, backoff, idempotência local, estado ambíguo seguro. |
| S3 | upload/download/signed URL | bucket privado, TLS, IAM mínimo, expiração curta, checksum, sem listagem pública. |
| Observabilidade/export | logs, traces, dumps | redaction por chave/valor, acesso mínimo, retenção, nunca conteúdo integral por padrão. |

## 7. Registro STRIDE

| ID | STRIDE | Componente | Cenário / impacto | Sev. | Mitigações e evidência esperada | Owner |
|---|---|---|---|---|---|---|
| TM-01 | S | web/api | Roubo/fixação de sessão permite operar como Rodrigo. | high | ID opaco ≥256 bits; rotação no login/elevação; `__Host-session`; invalidação server-side; teste de fixation/logout. | Alicerce |
| TM-02 | T/E | api | CSRF ou IDOR altera draft, autonomia, schedule ou conexão. | high | SameSite, validação `Origin`/Fetch Metadata, header não simples, autorização por objeto no servidor; testes cross-origin e outro `userId`. | Alicerce/Atlas |
| TM-03 | S/T | OAuth callback | `state` ausente/reutilizado ou redirect manipulável liga conta do atacante ou captura code. | critical | `state` CSPRNG, hash server-side, TTL 10 min, uso único e vínculo à sessão; redirect exata; code trocado uma vez; teste negativo obrigatório. | Pêndulo/Alicerce |
| TM-04 | I | tokens/logs | Token/client secret aparece em banco em claro, log, trace, erro, frontend ou prompt. | critical | Envelope encryption; redaction allowlist; testes canário em logs/traces; segredo só em backend; gitleaks. | Alicerce/Estaleiro |
| TM-05 | T/R | worker/publicação | Retry, concorrência ou timeout após sucesso cria publicação duplicada. | critical | `idempotencyKey` única, lock/singleton, state machine, persistir URN/resposta; estado ambíguo bloqueia retry cego e exige reconciliação/humano. | Pêndulo/Atlas |
| TM-06 | E/T | worker | Payload de job forjado contorna versão aprovada ou modo de autonomia. | high | Payload Zod strict contém IDs, não autoridade; handler relê estado e revalida aprovação/política em transação antes do side effect. | Pêndulo/Atlas |
| TM-07 | S/R | Telegram | Webhook falso ou replay simula comando/notificação. | medium | `X-Telegram-Bot-Api-Secret-Token`, comparação constante, chat/user allowlist, `update_id` único, corpo limitado; inbound sem publicar/aprovar. | Pêndulo |
| TM-08 | E/I | RSS/URLs | SSRF alcança metadata OCI, loopback, Postgres ou serviços internos e exfiltra credenciais. | critical | Allowlist; resolver DNS e revalidar cada redirect; bloquear IP privado/link-local/metadata e esquemas não HTTPS; timeout/bytes/redirects; egress firewall. | Pêndulo/Estaleiro |
| TM-09 | T/E | editorial-engine/OpenAI | Prompt injection muda objetivo, inventa fontes ou solicita segredo/tool. | high | Controles de `prompt-injection.md`; conteúdo só em campo de dados; sem tools; schema strict; source IDs fechados; gate humano. | Pena |
| TM-10 | I | OpenAI | Story Bank, PII ou conteúdo embargo é enviado além do necessário ou persistido pelo provedor. | high | Minimização por tarefa; classificação de dados; `store:false`; sem token/segredo; contrato/retention revisado; consentimento para histórias. | Pena/Sentinela |
| TM-11 | T | fontes | Fonte comprometida altera afirmações/citações depois da coleta. | medium | Snapshot textual sanitizado + SHA-256 + URL/data; citações vinculadas a `sourceItemId`; revisão humana de alegações relevantes. | Pena/Pêndulo |
| TM-12 | T/E | upload/S3 | Polyglot, SVG/HTML ativo, decompression bomb ou path traversal. | high | Permitir formatos necessários; magic bytes; rasterizar/re-encode; limites de dimensões/bytes; chave gerada; nunca servir inline conteúdo ativo. | Alicerce/Estaleiro |
| TM-13 | I/E | S3 | Bucket ou URL assinada expõe Story Bank/mídia privada. | high | Block Public Access, IAM por prefixo/ação, SSE, TLS, URL curta e vinculada a objeto, inventário de ACL; teste anônimo deve falhar. | Estaleiro/Alicerce |
| TM-14 | T/E | PostgreSQL | Injeção, query sem escopo ou role excessiva altera dados de outro usuário. | high | Prisma parametrizado; proibir SQL dinâmico; authz central; roles separadas migration/runtime/backup; testes multi-tenant negativos. | Alicerce/Atlas |
| TM-15 | R/T | audit log | Ator apaga/forja trilha ou conteúdo editado perde versão/aprovação. | high | `AuditEvent` append-only; versões imutáveis; aprovação referencia hash/ID da versão; acesso de escrita só pelo serviço; backup e alertas. | Atlas/Alicerce |
| TM-16 | D | api/login/webhook | Brute force, payload grande ou flood esgota CPU/DB/fila. | medium | Rate limits por rota/IP/sessão, body limits, timeouts, fila limitada, circuit breakers e 429 sem retry storm. | Estaleiro/Alicerce |
| TM-17 | D | integrações | 429/5xx/depreciação do LinkedIn/OpenAI causa storm ou agenda perdida. | high | Backoff exponencial com jitter/`Retry-After`, orçamento de retry, DLQ, reconcile, pin de versão suportada e alerta de sunset. | Pêndulo/Estaleiro |
| TM-18 | S/T | Caddy | Host/header spoofing ou proxy incorreto enfraquece URL/cookie/Origin e expõe portas. | high | Allowlist de host, trusted proxies explícitos, TLS/HSTS, headers, apenas 80/443 públicos; API same-origin; teste externo de portas. | Estaleiro |
| TM-19 | E/I | Oracle Cloud | Credencial cloud/SSH comprometida ou metadata acessível entrega controle do host. | critical | MFA, IAM mínimo, chaves individuais, sem SSH por senha, NSG restrito, IMDSv2/controles equivalentes, patches e egress; break-glass auditado. | Estaleiro |
| TM-20 | I/T | backup/export | Backup/dump fora do ciclo retém tokens e PII ou é restaurado adulterado. | high | Cifra separada, acesso mínimo, retenção definida, checksum/imutabilidade, teste de restore, deleção propagada conforme política. | Estaleiro/Alicerce |
| TM-21 | T/E | supply chain | Pacote npm, imagem ou Action comprometida executa com secrets. | high | Lockfile, installs frozen, SHA/digest de imagens e Actions, Dependabot, Semgrep/Trivy/gitleaks, permissões mínimas no CI, sem secrets em PRs externos. | Estaleiro |
| TM-22 | T/R | autonomia | Mudança de modo ou relógio agenda conteúdo sem ciência de Rodrigo. | high | Padrão assistido; reautenticação para elevar; audit event; janela de veto; clock injetado; timezone IANA; revalidar modo no publish. | Atlas/Alicerce/Pêndulo |
| TM-23 | I/T | LinkedIn data | API restrita é usada para coletar/armazenar atividade de membros além do permitido. | high | Feature flag desligada sem scope/aprovação; inventário de campos; TTL 24 h/48 h quando aplicável; sem export/combinação; ver `linkedin-policy.md`. | Pêndulo/Sentinela |
| TM-24 | T | conteúdo | Sistema inventa experiência/opinião de Rodrigo ou converte dado externo em ação. | high | Story Bank com flag publicável; provenance; gates G5/G6/G7; revisão humana inicial; evals adversariais. | Pena |
| TM-25 | E/I | worker/vagas | URL de vaga ou redirect leva a SSRF (metadata OCI, loopback, Postgres, rede Docker). | critical | `SafeHttpClient` compartilhado com RSS: só http/https nas portas 80/443, sem IP literal nem credencial na URL, DNS resolvido e conexão fixada no IP validado, revalidação a cada redirect (máx. 3), bloqueio de faixas privadas/link-local/CGNAT/metadata, 15 s e 2 MB; testes da T-058. | Pêndulo/Estaleiro |
| TM-26 | R/D | LinkedIn/compliance | Leitura de `linkedin.com/jobs/view` é detectada como acesso automatizado e leva a bloqueio do IP, restrição do app de publicação ou da conta pessoal. | high | Escopo de uma página por vaga, user agent identificável, limite por domínio, recuo imediato e circuit breaker de 24 h, sem evasão, chave `JOB_FETCH_LINKEDIN`, alerta por taxa de sinais de recusa. **Risco residual aceito por Rodrigo** (SEC-006). | Pêndulo/Sentinela |
| TM-27 | I | worker/vagas | Cookie de sessão, token OAuth ou client secret vaza numa requisição de busca de vaga. | critical | Adapter com cliente HTTP próprio, sem cookie jar, sem `Authorization`, sem acesso ao cofre (ADR-0004); teste de arquitetura de imports e teste com credenciais canário. | Pêndulo/Alicerce |
| TM-28 | T | editorial-engine/vagas | Página de vaga com instrução embutida altera a adaptação do CV ou o relatório. | high | Texto da vaga só como dado delimitado; Structured Outputs strict; corpus adversarial da T-058 inclui páginas de vaga. | Pena/Pêndulo |
| TM-29 | I | Carreira | CV base ou CV adaptado aparece em log, trace, Problem Details ou é enviado à OpenAI além do necessário. | high | Redaction, `store:false`, minimização por tarefa, PDF original descartado, apagamento em cascata sob demanda. | Alicerce/Pena |

## 8. Gates obrigatórios antes de produção

| Gate | Critério verificável | Bloqueia | Owner |
|---|---|---|---|
| G-01 | App real no Developer Portal demonstra scopes/endpoints permitidos; resposta e quota registradas sem token. | publicação LinkedIn | Pêndulo/Sentinela |
| G-02 | Teste integrado prova cifra AEAD, rotação de key version e ausência de tokens em DB/log/trace. | OAuth | Alicerce/Estaleiro |
| G-03 | Testes de callback cobrem state errado, expirado, reutilizado, code reutilizado e redirect divergente. | OAuth | Alicerce/Pêndulo |
| G-04 | Teste de publicação concorrente/timeout prova no máximo um post ou entra em estado ambíguo sem retry cego. | publicação | Pêndulo/Atlas |
| G-05 | Corpus adversarial de prompt injection falha fechado, sem tool-use, sem URLs/source IDs inventados. | curadoria/geração | Pena |
| G-06 | Restore de backup cifrado, varredura de secrets e scan Semgrep/Trivy/gitleaks com triagem documentada. | deploy | Estaleiro |
| G-07 | Testes provam: bloqueio SSRF (faixas privadas, metadata, redirect para rede interna, DNS rebinding), nenhuma requisição de vaga com cookie/token/secret (canário), limite por domínio, recuo e circuit breaker em 429/999/403/login wall, rejeição de caminhos do LinkedIn fora de `/jobs/view/<id>`. | busca de vagas em produção | Pêndulo/Sentinela |

### Evidência do G-07 (PR 3a da Carreira, 2026-10-22)

Entregue para a revisão da Sentinela. O G-07 continua **fechado** até essa revisão, e o fetcher só passa a
consumir a fila quando o PR 3b ligar o store de vagas. Testes em `apps/worker/test/`:

- **SSRF (TM-08 parcial, TM-25)**: `safe-http-client.test.ts`, com servidor HTTP local e DNS falso. Cobre:
  - faixas privadas, loopback, link-local/metadata, CGNAT, IPv4-mapped e ULA;
  - `*.nip.io` e `metadata.google.internal`;
  - IP literal, credencial na URL, porta não padrão e esquema fora de http/https;
  - redirect para rede interna e DNS rebinding (um lookup por salto; a conexão vai ao IP validado);
  - 4 redirects, 2 MB + 1 byte, gzip bomb, timeout e content type;
  - `Set-Cookie` que nunca volta.

  O TM-08 continua aberto: as fontes RSS ainda não usam o `SafeHttpClient`, e o egress firewall é do
  Estaleiro.
- **Canário (TM-27)**: `http-job-page-fetcher.test.ts` mostra que nenhum cookie, token ou segredo do ambiente
  sai na requisição. `fetcher-architecture.test.ts` mostra que o fetcher não alcança o vault, a sessão, o
  Prisma, `process.env` nem a API do LinkedIn.
- **Limite, recuo e breaker (TM-26)**: `job-fetch-policy.test.ts` e `http-job-page-fetcher.test.ts`. Cobrem:
  - 15 s, ou 5 s fora do LinkedIn, aplicados pelo domínio de destino de cada salto;
  - a cota de 40 em 24 h;
  - o `lnkd.in` → `/jobs/view` sem loop, com no máximo 2 unidades de cota;
  - 429, 999, 403, redirect para login e login wall abrem o breaker por 24 h, e a vaga seguinte do domínio
    falha sem requisição;
  - o kill switch também vale em redirect.

  A persistência e a concorrência estão em `packages/domain/test/fetch-domain-guard.integration.test.ts`.
- **Caminhos do LinkedIn**: só `/jobs/view/<id numérico>`, normalizado. Perfil, busca, coleções, empresa e
  feed são recusados.
- **Injeção na página (TM-28)**: a fixture `fixtures/job-pages/injection.html` (texto e JSON-LD) chega como
  texto puro, sem scripts e sem texto oculto. Ela entra no corpus da T-058.

## 9. Findings abertos

Formato compatível com `.github/ISSUE_TEMPLATE/security.md`.

### SEC-001 — Acesso real do app às APIs/scopes ainda não comprovado

- **Severidade:** high
- **Componente afetado:** LinkedIn OAuth/publicação/analytics
- **Cenário de exploração / impacto:** implementar contra endpoints ou permissões presumidas pode bloquear o
  MVP, induzir fallback não autorizado ou solicitar escopos excessivos.
- **Mitigação proposta:** executar G-01 com app real; manter analytics e leitura de atividade desligados;
  publicar somente por endpoint oficialmente disponível ao app.
- **Referências:** `linkedin-policy.md`.

### SEC-002 — Refresh token programático não é garantido

- **Severidade:** high
- **Componente afetado:** OAuth, scheduler e modos automáticos
- **Cenário de exploração / impacto:** token expira e publicação agendada falha; tentativa de contorno pode
  levar a armazenamento inseguro ou automação não oficial.
- **Mitigação proposta:** suportar reautorização antecipada; usar refresh apenas se o app receber o campo e
  estiver autorizado; manter piloto automático completo desabilitado até comprovação.
- **Referências:** `oauth-and-tokens.md` e documentação oficial de refresh do LinkedIn.

### SEC-003 — Política de retenção/exclusão depende de decisão do controlador

- **Severidade:** medium
- **Componente afetado:** PostgreSQL, S3, logs e backups
- **Cenário de exploração / impacto:** dados pessoais permanecem além da finalidade ou pedido de exclusão não
  alcança cópias e integrações.
- **Mitigação proposta:** aprovar a matriz de `data-and-lgpd.md`, implementar jobs de retenção e evidência de
  purge/expiração de backup antes de produção.

### SEC-004 — `.env.example` aceita placeholders inseguros se não houver validação de startup

- **Severidade:** medium
- **Componente afetado:** configuração/deploy
- **Cenário de exploração / impacto:** `SESSION_SECRET`/`ENCRYPTION_KEY` de exemplo podem chegar a ambiente
  não local, invalidando sessões e cifra em repouso.
- **Mitigação proposta:** falhar startup fora de `development` para `change-me`, chaves vazias, chave não
  base64 de exatamente 32 bytes ou segredo de sessão fraco; separar exemplos de dev e produção.
- **Referências:** revisão somente leitura de `.env.example` em 2026-10-13.

### SEC-005 — Hardening adicional do `.gitignore`

- **Severidade:** low
- **Componente afetado:** repositório/CI
- **Cenário de exploração / impacto:** o arquivo cobre `.env`, PEM/keys, tokens, dados, uploads e exports, mas
  não cobre explicitamente `.envrc`, dumps `*.sql`/`*.dump`, state Terraform (`*.tfstate*`/`*.tfvars`) nem
  arquivos comuns de credencial cloud. Um arquivo criado futuramente pode ser incluído por engano.
- **Mitigação proposta:** Estaleiro avaliar padrões quando essas ferramentas forem introduzidas; manter
  gitleaks obrigatório, pois `.gitignore` não é controle suficiente.
- **Referências:** revisão somente leitura de `.gitignore` em 2026-10-13.

### SEC-006 — Leitura anônima de vagas do LinkedIn contraria o User Agreement

- **Severidade:** high (risco aceito)
- **Componente afetado:** worker (adapter de vagas), conta pessoal, app de publicação e IP da VM
- **Cenário de exploração / impacto:** o LinkedIn identifica as leituras de `linkedin.com/jobs/view` como
  acesso automatizado e bloqueia o IP, restringe o app ou a conta; como o IP é o mesmo da publicação, a
  integração oficial pode ser afetada.
- **Mitigação proposta:** controles do ADR-0008 e de `linkedin-policy.md` §8.1; G-07 antes de produção;
  desligar `JOB_FETCH_LINKEDIN` ao primeiro sinal de restrição; "colar texto" sempre disponível.
- **Aceite:** Rodrigo, 2026-10-22 (decisões D2 e D8 da spec de CV adaptado). Revisar se houver restrição.
- **Referências:** ADR-0008; `linkedin-policy.md` §2 e §8.1; LinkedIn User Agreement.

## 10. Perguntas abertas — decisão de Rodrigo

1. **[DECISÃO RODRIGO]** Confirmar login local (e-mail + Argon2id) separado da conexão LinkedIn ou usar
   OIDC do LinkedIn para login. Recomendação de segurança/disponibilidade: login local separado.
2. **[DECISÃO RODRIGO]** Aprovar os prazos propostos em `data-and-lgpd.md`, inclusive auditoria por 2 anos,
   fontes por 90 dias e backups por 35 dias.
3. **[DECISÃO RODRIGO]** Confirmar Telegram apenas outbound no MVP. Se houver inbound, permitir somente
   vínculo/teste/ack; nunca aprovação final, mudança de autonomia ou publicação.
4. **[DECISÃO RODRIGO]** Confirmar que piloto automático completo permanece desligado até G-01–G-06 e ao
   menos duas semanas de operação assistida sem incidente.
5. **[DECISÃO RODRIGO]** Definir pessoa/contato controlador para pedidos LGPD e incidentes.

## 11. Cadência de revisão

- Revisar em toda alteração de auth, OAuth, publicação, autonomia, webhook, upload, fonte, busca de páginas
  externas ou ferramenta de IA.
- Revisar trimestralmente scopes, quotas, versões e termos oficiais do LinkedIn.
- Reexecutar G-01 após mudança de produto/app/scopes e G-05 após mudança de prompt/modelo/schema.
- Abrir finding separado usando o template de segurança quando um risco sair de “design” e for observado
  na implementação.
