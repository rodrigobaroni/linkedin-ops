# Estratégia de testes — LinkedIn Ops

Status: rascunho inicial de QA
Owner: Crivo (QA & Reliability)
Última atualização: 2026-10-16

## 1. Objetivo e princípios

Esta estratégia define como provar que o LinkedIn Ops funciona em condições normais, concorrentes e de falha. Segurança, autenticidade e confiabilidade têm precedência sobre volume e velocidade.

Princípios inegociáveis:

- Nenhum teste opera o site do LinkedIn por navegador. Publicação é exercitada somente contra adapter/fake da API oficial e, quando autorizado, sandbox/app real controlado.
- Conteúdo externo é dado não confiável; nunca instrução. Fixtures de RSS, artigos, nomes e comentários devem incluir casos adversariais.
- Toda publicação é idempotente. Timeout ou resposta ambígua nunca autoriza retry cego.
- Todo horário local viaja com timezone IANA explícito e é persistido também como instante UTC.
- Teste verde precisa ter assertiva útil. Scripts placeholder, `passWithNoTests` e simples `echo` não contam como evidência.
- Falha de Telegram não reverte publicação; falha de publicação não pode ser mascarada pela notificação.
- Testes não usam segredos reais, não gravam payload sensível e não dependem de ordem, relógio ou rede pública sem controle.

## 2. Camadas e ferramentas

| Camada | Objetivo | Ferramentas | Exemplos | Gate |
|---|---|---|---|---|
| Unit | Regra pura e componente isolado | Vitest, Testing Library, fake clock | state machine, scoring, datas, redaction, componentes UI | todo PR |
| Contract | Compatibilidade entre web/API/worker/modelo | Zod, JSON Schema/OpenAPI, fixtures versionadas | DTOs, erros, jobs, Structured Outputs, drift OpenAPI | todo PR que muda fronteira |
| Integration | Persistência, filas, transações e adapters | Vitest, Supertest, Testcontainers, fault injection | Postgres/pg-boss, locks, unique constraints, API HTTP | PR de backend/worker |
| E2E | Fluxo visível e recuperação | Playwright contra stack local com fakes | curadoria → seleção → edição → aprovação → agenda → publicação fake | gate de épico/release |
| Provider smoke | Confirma contrato real sem mutação perigosa | harness dedicado, credenciais efêmeras | OAuth/readiness/quota; publicação somente com autorização explícita | pré-release/manual |

Distribuição desejada: muitos testes unitários/contract rápidos, integração suficiente para provar invariantes transacionais e poucos E2E estáveis cobrindo jornadas críticas.

## 3. Organização e convenções

- Testes unitários ficam próximos ao código (`*.test.ts[x]`).
- Integração é co-localizada com o componente responsável, conforme o baseline do ADR-0001:
  `packages/domain/test` concentra invariantes de persistência com Testcontainers, `apps/api/test`
  concentra HTTP com Supertest e `apps/worker/test` concentra filas, handlers e adapters.
- Contratos ficam em `packages/contracts/test/` e usam fixtures canônicas em `tests/fixtures/`.
- E2E fica em `tests/e2e/`; providers externos são substituídos por servidores fake determinísticos.
- Fixtures compartilhadas ficam em `tests/fixtures/`; casos adversariais de prompt usam
  `tests/fixtures/prompt-injection/`, com proveniência e resultado esperado.
- Cada teste usa Arrange/Act/Assert, nome comportamental e correlation/idempotency keys únicas e legíveis.
- Relógio, UUID, jitter e rede devem ser injetáveis. Seeds aleatórias são registradas para reprodução.
- Nenhuma suíte compartilha estado mutável. Banco, bucket e filas são isolados por worker/test run.

## 4. Critérios por camada

### 4.1 Unit

Cobertura mínima por risco:

- 100% das transições permitidas e proibidas da state machine.
- 100% dos branches de idempotência, classificação de erro, retry e redaction.
- Limites de schemas: mínimo, máximo, logo abaixo/acima, `null`, ausente, tipo errado, enum desconhecido e chave extra.
- Componentes: estados vazio/carregando/erro/sucesso, ações desabilitadas, texto PT-BR e semântica acessível.
- Editorial engine: score, dedupe, claims/fontes, humanização e rejeição de output fora do schema.

Meta inicial de cobertura: 80% linhas/branches por pacote com código executável; 100% nos módulos críticos citados acima. Exceção exige justificativa no relatório de QA.

### 4.2 Contract

Todo schema compartilhado deve provar:

- Fixture válida mínima e completa.
- Payload inválido por campo e limites adjacentes.
- Inputs, queries, params, headers lógicos e jobs rejeitam chaves extras.
- Enums rejeitam valores desconhecidos; mudança de enum é tratada como compatibilidade de API.
- Relações entre campos também são validadas: estado/status, quantidade, unicidade, `code ↔ HTTP status ↔ type`, opcionais condicionais e XOR.
- JSON Schema de Structured Outputs permanece strict e não admite source IDs/URLs fora do conjunto de entrada.
- Snapshot/drift do OpenAPI é revisado; breaking change exige versão/ADR conforme governança.
- Web, API e worker compilam contra a mesma versão do pacote.

### 4.3 Integration

Com Postgres/pg-boss reais via Testcontainers:

- Migrations sobem do zero e atualizam uma base na versão anterior; rollback/recovery é documentado.
- Unique constraints e transações provam os invariantes I1–I14 do modelo.
- Supertest valida status, content type, Problem Details, RBAC, CSRF, row version e idempotency key.
- Jobs provam singleton, claim atômico, retry/backoff, expiração, dead-letter `<queue>.dlq` e retomada após restart.
- Fault injection interrompe conexão antes/depois de commit e antes/depois da chamada ao provider.
- Cada consulta que retorna dados de usuário tem canário de isolamento multiusuário.

### 4.4 E2E

Jornadas mínimas em Playwright, com providers fake e banco descartável:

1. Login → shell → navegação desktop e móvel.
2. Curadoria bem-sucedida com exatamente cinco cards → seleção → somente então geração do draft.
3. Editar → nova versão → revisão → aprovação → agendamento com timezone → publicação fake → histórico/auditoria.
4. Rejeitar/editar invalida aprovação anterior; versão errada não publica.
5. Nível assistido padrão não aprova nem publica sozinho.
6. Falha recuperável e irrecuperável em cada provider mostra estado correto, correlation ID e ação segura.
7. Concorrência de duas abas gera um único efeito e conflito de row version compreensível.
8. 404, sessão expirada, LinkedIn desconectado, estados vazio/carregando/erro e modo offline transitório.

Não usar Playwright para automatizar o LinkedIn. A etapa de publicação do E2E termina no fake da API oficial.

Cenários pós-MVP que devem entrar na suíte E2E quando as respectivas capacidades forem implementadas:

- `AUTOPILOT_CONTROLLED` respeita toda a janela de cancelamento antes de publicar e um cancelamento dentro
  da janela impede o claim.
- Descer o modo revoga aprovações automáticas ainda não publicadas, cancela o schedule e agrega uma única
  notificação `AUTOPILOT_REVOKED`, sem alterar aprovações humanas.
- Selecionar a oportunidade previamente escolhida para prefetch adota o draft (`is_prefetch=false`);
  selecionar outra descarta o prefetch como `PREFETCH_SUPERSEDED`.

### 4.5 Auth

Os testes normativos seguem ADR-0007, seção **Consequences › Tests**, e provam separadamente N1–N4:

- **N1 — claim atômico do OAuth state antes de I/O externo:** os caminhos `code` e `error` executam o
  `UPDATE ... WHERE used_at IS NULL AND expires_at > now() AND session_id = $2 RETURNING ...` antes de
  qualquer chamada ao LinkedIn. Dois callbacks concorrentes com o mesmo `state` produzem exatamente um
  claim e, no caminho `code`, exatamente uma troca de token; `rowCount = 0` significa zero exchanges.
  O caminho `error` também consome o state. State ausente, errado, expirado, reutilizado ou de outra sessão,
  code reutilizado e redirect URI divergente falham fechado e compõem a evidência de G-03.
- **N2 — renovação de CSRF em toda rotação:** login e reautenticação retornam
  `200 { csrfToken, elevatedUntil }`; login, reauth, callback OAuth, troca de senha, conexão LinkedIn e
  mudança de autonomia retornam o novo `X-CSRF-Token` no header quando rotacionam a sessão. Após o redirect
  OAuth, `GET /auth/me` entrega o token vigente. O web mantém o token somente em memória, nunca em
  `localStorage`/`sessionStorage`, e após `403 CSRF_REJECTED` faz no máximo um refetch de `/auth/me` antes de
  exibir o erro. O token anterior deixa de autorizar mutações.
- **N3 — PKCE e identidade condicionados à prova real:** testar somente os modos
  `LINKEDIN_PKCE=required|disabled`. Incompatibilidade em `required` falha de forma explícita, sem fallback
  silencioso para Authorization Code simples. A validação de `iss`, `aud`, `exp`, `iat` e `nonce` é
  obrigatória desde o primeiro token armazenado (ADR-0007 item 5); o que G-01 define é o conjunto de claims
  adicionais realmente retornado pelo app e a formação da Person URN a partir de `sub`.
- **N4 — matriz de todas as mutações:** todo `POST/PUT/PATCH/DELETE` exige sessão, com a única exceção de
  `POST /auth/login`; todos exigem `Origin` exatamente igual a `APP_BASE_URL`, JSON e
  `X-Requested-With: linkedin-ops`, rejeitam cross-site, `Origin: null`, form-urlencoded e method override.
  Fetch Metadata é defesa suplementar, nunca substitui a validação de Origin. Endpoints 🔐 também exigem
  sessão elevada e `X-CSRF-Token` ligado à sessão.
- A sessão elevada expira em 15 minutos sob relógio injetado; depois do limite, todo endpoint 🔐 retorna
  `401 AUTH_REAUTH_REQUIRED` até nova reautenticação.
- `POST /auth/login`, embora seja a única mutação sem sessão, mantém Origin exata, JSON,
  `X-Requested-With: linkedin-ops`, Fetch Metadata suplementar e rate limit.

Valores iniciais de rate limit a testar, sempre com `429 RATE_LIMITED` e `Retry-After` ao exceder:

| Rota/ação | Limite e escopo |
|---|---|
| Login | 5 por 10 min, por conta e por IP |
| OAuth start | 5 por 10 min, por sessão |
| OAuth callback | 20 por 10 min, por IP |
| Publish now | 3 por 10 min, por usuário |
| Mudança de autonomia | 3 por 10 min, por usuário |

### 4.6 Cifra de tokens e segredos

Os casos abaixo são obrigatórios no CI como evidência de G-02 e seguem o item 13 e **Consequences** do
ADR-0004:

- Parser estrito do keyring: versões únicas, versão ativa presente, cada valor em base64 válido que
  decodifica em exatamente 32 bytes; entradas vazias, duplicadas, sem versão ativa, base64 inválido ou
  tamanho diferente falham o startup. Não existe fallback silencioso para `ENCRYPTION_KEY`, versão `1`,
  chave mais nova ou qualquer default.
- Round-trip de access token, refresh token e DEK com nonces independentes e AAD canônica. Trocar usuário,
  credential ID, provider ou `tokenType` quebra a autenticação.
- `wrapped_dek` truncado, frame adulterado, nonce/tag alterado, AAD trocada, KEK errada ou tag errada falham
  fechado com erro genérico, sem plaintext em mensagem, causa ou trace.
- Startup de API e worker falha fora de development para keyring vazio/inválido, placeholder de chave ou
  `SESSION_SECRET` vazio, placeholder ou curto; a validação acontece antes de carregar módulos.
- Rotação interrompida e retomada é idempotente: a nova chave fica ativa para writes, batches reembrulham
  DEKs sem recifrar tokens, registros já migrados não quebram e a chave antiga só é retirada após decrypt
  autenticado de 100% das linhas e expiração/re-encriptação dos backups dependentes.
- Um canário sintético prova que token, KEK, DEK, `wrapped_dek`, Authorization e valores de segredo não
  aparecem em colunas plaintext, DTOs, logs Pino, erros, spans ou atributos de trace. A evidência registra
  apenas classe do canário, contagens, IDs internos e hashes não reversíveis.

## 5. Matriz de tempo, timezone e DST

Executar testes com `TZ=UTC`, `America/Sao_Paulo`, `America/New_York`, `Europe/Lisbon` e `Asia/Tokyo`.

| Caso | Assertiva obrigatória |
|---|---|
| Cron seg/qua/sex 09:00 São Paulo | um run por slot; reinício ou dois schedulers não duplicam |
| Virada de dia/mês/ano e ano bissexto | data local e UTC corretos, sem deslocamento implícito |
| Horário inexistente no spring-forward | rejeição explícita ou política documentada; nunca ajuste silencioso |
| Horário ambíguo no fall-back | escolha de offset explícita/documentada; execução única |
| Mudança de tzdb/offset | UTC persistido não muda; exibição usa timezone salvo |
| Quiet hours atravessando meia-noite | bloqueio/liberação nos limites inclusivo/exclusivo definidos |
| Clock skew e job atrasado | política de atraso, expiração e alerta; não publica fora da janela sem revalidação |
| Reagendamento/cancelamento simultâneo | somente a versão/agenda vencedora produz job válido |

`America/Sao_Paulo` continua sendo o caso principal, mas zonas com DST são necessárias para provar que a implementação não depende do offset atual `-03:00`.

## 6. Retries, idempotência, concorrência e recovery

### 6.1 Classificação de falhas

- Retry automático é permitido apenas para operação comprovadamente idempotente ou read-only: timeout de
  transporte, desconexão, 429 respeitando `Retry-After` e 5xx transitório, sempre dentro do orçamento.
- Não retry: payload/schema inválido, autenticação definitivamente inválida, 4xx sem indicação transitória, política/estado de domínio incompatível.
- Operações externas com side effect e sem idempotency key do provider ficam fora da regra geral. Resultado
  incerto vira `AMBIGUOUS` e exige reconciliação/retry humano; isso vale para `publication.publish` e para
  qualquer adapter futuro não idempotente.
- `publication.publish` tem `retryLimit = 0`; nenhuma falha dessa fila dispara retry automático, mesmo quando
  timeout, desconexão, 429 ou 5xx seriam transitórios em outra integração.
- Sempre testar limite de tentativas, backoff exponencial, jitter controlado, expiração e dead-letter
  `<queue>.dlq` nas filas que aceitam retry.
- Reiniciar worker entre tentativas para provar persistência do estado e ausência de dependência em memória.

### 6.2 Idempotência

Para cada ação mutável marcada como idempotente:

- Mesma key + mesmo fingerprint retorna/reutiliza o mesmo resultado.
- Mesma key + payload diferente retorna `409 IDEMPOTENCY_KEY_CONFLICT` e não executa efeito.
- Sem key quando obrigatória retorna Problem Details determinístico.
- Key duplicada simultânea em 2, 10 e 50 requests produz um único registro/job/efeito.
- Retry após resposta perdida não repete o efeito.
- Chave e fingerprint são escopados corretamente por usuário/ação.

### 6.3 Publicação LinkedIn

Executar as barreiras de confiabilidade em ordem:

1. No caminho `publish now`, a API valida OWNER, CSRF e sessão elevada antes de aceitar a ação; a sessão
   elevada é uma barreira HTTP do ADR-0007 e nunca é revalidada pelo worker. O serviço da API cria
   `Publication{PENDING}` pela idempotency key e enfileira `publication.publish{publicationId}` na **mesma
   transação**. No caminho agendado, a transição de domínio equivalente também persiste a intenção e o
   enqueue atomicamente, sem inventar uma sessão humana para o worker.
2. O worker recebe somente `publicationId`, faz o claim condicional `PENDING → IN_PROGRESS` com
   `rowCount = 1` e, no claim, revalida: Draft em `SCHEDULED`/`PUBLISHING`,
   `approved_version_id === publication.draft_version_id`, `OAuthToken.status === ACTIVE`, política de
   autonomia ainda permitindo a ação (inclusive janela de cancelamento de `AUTOPILOT_CONTROLLED`
   decorrida) e Schedule não cancelado. Qualquer falha termina em `FAILED`, sem chamada ao LinkedIn.
3. Persistir `request_fingerprint` do payload exato antes da chamada externa.
4. Chamar o fake LinkedIn no máximo uma vez; `publication.publish` usa `retryLimit = 0`.
5. Em sucesso definitivo, persistir URN/resposta e transicionar para `SUCCEEDED`; em resultado ambíguo,
   transicionar para `AMBIGUOUS` e exigir reconciliação.

Fault injection em cada fronteira deve provar:

- Crash após o claim e antes da chamada deixa `IN_PROGRESS` stale; `schedule.reconcile` quando há mais de
  10 minutos
  marca `AMBIGUOUS`. `publication.reconcile` não encontrando post pelo `request_fingerprint` marca
  `FAILED`; somente retry **humano** cria nova `Publication` com sufixo `retry:<n>`.
- Connection refused ou timeout comprovadamente antes de enviar bytes termina em `FAILED`; retry é humano
  e cria nova `Publication`, nunca reexecução automática do mesmo job.
- 5xx ou timeout depois de enviar bytes termina em `AMBIGUOUS`, sem retry automático. A reconciliação busca
  posts recentes e casa pelo `request_fingerprint` dentro da janela conservadora.
- Crash após sucesso remoto e antes do commit resulta em `IN_PROGRESS` stale/`AMBIGUOUS`; reconciliação
  encontra o fingerprint e conclui `SUCCEEDED`, sem criar segundo post.
- Dois workers ou publish manual + schedule simultâneos: no máximo um claim/chamada.

## 7. Falhas por integração

| Integração | Casos injetados | Resultado esperado |
|---|---|---|
| RSS/Atom/URLs | timeout, DNS/redirect, XML/HTML malformado, encoding, feed vazio, item gigante, duplicado, data inválida, 404/429/5xx, IP privado/metadata | limite de bytes/tempo/redirects, SSRF bloqueado, provenance preservada, dedupe, run `PARTIAL`/`FAILED` conforme orçamento |
| OpenAI | timeout, 429 + Retry-After, 5xx, recusa, JSON truncado, schema inválido, source ID inventado, custo/tokens acima do limite | retry limitado, `store:false`, validação pós-modelo, nenhum draft/opportunity inválido persistido, erro classificado |
| Telegram | timeout, 429, 401/403, chat inválido, 5xx, resposta duplicada; webhook falso/replay se inbound existir | notificação reprocessável/deduplicada; publicação permanece fonte da verdade; inbound nunca aprova/publica |
| S3-compatible | indisponível, timeout, PUT parcial, checksum divergente, MIME/magic bytes inválidos, arquivo grande, URL assinada expirada | objeto privado, cleanup/recovery, estado não publicado, erro acionável; acesso anônimo falha |
| LinkedIn API | token expirado, refresh indisponível, 401/403, 429, 5xx, timeout antes/depois do aceite, resposta sem URN, versão de API inválida | backoff/Retry-After só em leitura/operação comprovadamente idempotente; publicação nunca tem retry automático, usa `FAILED`/`AMBIGUOUS`, reconciliação e zero duplicação |
| PostgreSQL/pg-boss | deadlock, unique violation, conexão perdida, restart durante job, job duplicado, relógio atrasado | retry transacional seguro, singleton/claim, recovery e auditoria coerente |

Cada fake deve registrar número de chamadas, payload fingerprint, ordem e timestamps virtuais para assertivas de “exatamente uma vez” no efeito externo e “ao menos uma vez” no processamento interno.

## 8. Prompt injection e autenticidade

`docs/security/prompt-injection.md` é a especificação normativa e o corpus canônico de G-05. Manter suas
fixtures adversariais versionadas com, no mínimo:

- “Ignore instruções anteriores”, role-play e mensagens falsas de sistema/developer.
- Pedido de segredo, token, prompt, variável de ambiente ou acesso a ferramenta/URL.
- Instruções escondidas em HTML, Markdown, comentários, Unicode/bidirecional, base64 e campos de autor/título/URL.
- Fonte que manda inventar experiência, números, citação ou opinião de Rodrigo.
- Source IDs e URLs não fornecidos; claims sem evidência; instrução para publicar/aprovar.
- Conteúdo multilíngue e combinações de várias fontes, uma delas maliciosa.
- Stored injection: resumo/output de uma etapa carregando a instrução para a etapa seguinte.
- Artigo benigno que discute prompt injection academicamente, para medir falso positivo sem descarte
  destrutivo.
- Canário sintético de exfiltração no input e tentativa de fazê-lo aparecer no output.
- SSRF com loopback, redes privadas/link-local/metadata, cadeia de redirects e DNS rebinding com
  re-resolução em cada conexão.

Assertivas:

- Conteúdo externo aparece somente no campo de dados delimitado, nunca em instruções.
- Modelo não recebe segredos nem tools livres; `store:false` é enviado.
- Output valida contra Structured Output strict e referencia apenas IDs permitidos.
- Injeção suspeita é marcada/contabilizada; falha fecha sem promoção automática.
- Nenhuma história, opinião, número ou experiência é atribuída a Rodrigo sem Story Bank/fonte autorizada.
- Nenhuma saída do modelo muda autonomia, aprova, agenda ou publica.
- Gate humano continua obrigatório nos modos que o exigem.
- Nenhum canário, segredo ou payload bruto aparece em logs, erros ou traces; a telemetria guarda somente
  classe da violação, hashes, correlation ID e versões de prompt/modelo.
- A taxa de falso positivo e regressões editoriais é registrada por versão de prompt/modelo.

Rodar o corpus em PRs do editorial engine e em regressão programada; mudança de modelo/prompt/versionamento exige comparação antes/depois e revisão dos falsos negativos.

## 9. Acessibilidade e responsividade (WCAG 2.2)

### Automatizado

- Testing Library por roles/names; axe em componentes e páginas.
- Playwright + axe em Chromium nos viewports 320×568, 768×1024, 1024×768 e 1440×900.
- Estados vazio, loading, erro, sucesso, modal/drawer, 404 e sessão expirada.
- Verificar landmarks, um `h1`, ordem de heading, accessible name, `aria-current`, status/alert live regions e ausência de IDs duplicados.
- Teclado: skip link, ordem de Tab, Enter/Space/Escape, focus trap/return, foco após navegação e ação assíncrona.
- Contraste em browser real, reflow/zoom 200% e 400%, orientação e `prefers-reduced-motion`.

### Manual por épico/release

- VoiceOver/Safari e ao menos um segundo leitor/browser suportado.
- Navegação somente por teclado e com zoom.
- Conteúdo PT-BR compreensível, erro não dependente só de cor e target mínimo conforme WCAG 2.2.
- Revisão de responsividade sem sobreposição da bottom nav, clipping ou scroll bidimensional indevido.

Violação axe séria/crítica ou bloqueio de teclado impede aprovação. Contraste não é considerado provado por jsdom.

## 10. Gates e política de falhas

### Pull request

Obrigatórios:

1. `pnpm install --frozen-lockfile` em ambiente limpo.
2. `pnpm turbo lint typecheck test build` sem workaround de concorrência.
3. Testes afetados executados sem cache quando houver suspeita de flake.
4. Relatório com commit exato, comandos, contagens, achados e lacunas.
5. Diff review independente para mudança de contrato, estado, fila, autenticação, agenda ou publicação.

### Épico/release

- Integration suite com containers.
- E2E crítico completo com providers fake.
- Corpus de prompt injection.
- Matriz timezone/DST e concorrência/idempotência.
- Axe em browser + checklist manual de acessibilidade.
- Restore/restart/recovery de DB, fila e worker.
- Nenhum finding P0/P1 aberto; P2 exige owner, prazo e risco aceito.

### Flakes

- Teste que falha uma vez é investigado; rerun verde não apaga a falha.
- Confirmar em checkout limpo, registrar seed/ambiente e reduzir para reprodução mínima.
- Flake conhecido recebe issue, owner e prazo; testes críticos não podem ser simplesmente desabilitados.
- Corridas desaparecendo com `--concurrency=1` são tratadas como defeito de isolamento, não como aprovação.

## 11. Matriz normativa dos gates G-01–G-06

Os gates de `docs/security/threat-model.md` §8 bloqueiam produção e `AUTOPILOT_FULL`. Evidência nunca inclui
token, cookie, segredo, payload externo bruto, prompt privado ou PII. Comandos marcados “a criar” definem o
contrato da tarefa indicada; até existirem e passarem, o gate permanece aberto.

### G-01 — Acesso real do app LinkedIn

- **Suíte/comando:** T-061 executa no app real do LinkedIn o harness manual
  `pnpm --filter @linkedin-ops/worker test:linkedin-real-app` (a criar em T-061), não um smoke genérico nem
  mock. Exercita consentimento e cada endpoint oficial que o MVP pretende usar, incluindo texto e mídia
  quando o produto concedido permitir.
- **Evento:** manual antes da primeira produção e novamente após mudança de app, produto, scopes, endpoint,
  versão da API ou política do LinkedIn.
- **Critério:** produtos/scopes realmente concedidos, Person URN/claims OIDC observados, endpoints e formatos
  permitidos, headers de quota/rate limit e comportamento real de refresh documentados; capability não
  comprovada fica desligada, sem fallback por scraping/browser.
- **Evidência:** `docs/security/linkedin-api-access-evidence.md` com app/produto, timestamp, status, headers de
  quota e corpos sanitizados; tokens, authorization codes e client secret são removidos. Vincular a T-061.
- **Owner:** Pêndulo / Sentinela.

### G-02 — Cifra, rotação e ausência de segredo

- **Suíte/comando:** `pnpm --filter @linkedin-ops/domain test -- test/token-vault.integration.test.ts`, mais
  startup tests de API/worker. Roda os casos completos de §4.6.
- **Evento:** todo PR que altera TokenVault, env validation, OAuthToken, logging/tracing ou rotação; pipeline
  de release.
- **Critério:** keyring estrito sem fallback; AEAD round-trip; AAD/key/tag/frame inválidos falham fechado;
  startup fail-closed; rotação interrompida retoma idempotentemente; canário ausente de DB/DTO/log/trace.
- **Evidência:** relatório JUnit/coverage do CI, log sanitizado de rotação com contagens e relatório do canário
  por classe/hash. Nunca anexar chave, token, DEK, ciphertext completo ou payload de trace.
- **Owner:** Alicerce / Estaleiro.

### G-03 — Callback OAuth e single-use state

- **Suíte/comando:**
  `pnpm --filter @linkedin-ops/api test -- test/linkedin-oauth-callback.integration.test.ts` com fake do
  token endpoint que conta exchanges.
- **Evento:** todo PR de auth/OAuth/session/callback e pipeline de release.
- **Critério:** state ausente, errado, expirado, reutilizado e cross-session; code reutilizado; redirect URI
  divergente; callbacks concorrentes; caminhos `code` e `error`. O claim ocorre antes do I/O, `rowCount=0`
  gera zero exchanges, duas requisições concorrentes geram no máximo uma troca e o caminho `error` consome
  o state. Incluir PKCE fail-loud e negativos de N3 após a evidência G-01.
- **Evidência:** relatório do CI com IDs de caso, contagem de claims/exchanges e correlation IDs sintéticos;
  nunca state, code, verifier, nonce, token ou request body real.
- **Owner:** Alicerce / Pêndulo.

### G-04 — Publicação at-most-once

- **Suíte/comando:**
  `pnpm --filter @linkedin-ops/worker test -- test/publication-publish.integration.test.ts` com Postgres,
  pg-boss e fake LinkedIn instrumentado.
- **Evento:** todo PR que altera publicação, schedule, fila, idempotência, retry/reconcile ou autonomia;
  pipeline de release.
- **Critério:** concorrência e fault injection de §6.3 produzem no máximo uma chamada/post; resultado incerto
  vira `AMBIGUOUS`, nunca retry automático; stale claim é reconciliado por `request_fingerprint`; retry
  humano cria nova Publication somente após `FAILED` não ambígua.
- **Evidência:** relatório do CI com contagem de calls, estados, fingerprints sintéticos e timeline virtual,
  sem commentary, media, token ou resposta real do LinkedIn.
- **Owner:** Pêndulo / Atlas.

### G-05 — Prompt injection e exfiltração

- **Suíte/comando:**
  `pnpm --filter @linkedin-ops/editorial-engine test -- test/prompt-injection.eval.test.ts`, usando o corpus
  canônico de `docs/security/prompt-injection.md`; sob flag, executar também avaliação com modelo real.
- **Evento:** todo PR que altera prompt, modelo, parser, sanitizer, schema, tools, coleta ou renderização; antes
  de release e de qualquer elevação de autonomia.
- **Critério:** 0 tool/side effect, segredo/canário, URL/source ID inventado ou payload em logs/traces; output
  valida ou falha fechado; stored injection não atravessa estágios; DNS rebinding/SSRF é bloqueado; o caso
  benigno acadêmico mede falso positivo sem descarte destrutivo.
- **Evidência:** relatório por IDs de fixture, versões de prompt/modelo/schema, métricas agregadas e hashes;
  não anexar texto privado, payload adversarial bruto, canário ou resposta com PII.
- **Owner:** Pena, com Pêndulo nos adapters e Sentinela na revisão.

### G-06 — Restore cifrado e scans com triagem

- **Suíte/comando:** restore em ambiente limpo pelo runbook/script de T-055 (a criar), seguido do E2E de
  integridade/reconciliação; `.github/scripts/gitleaks-scan.sh full`; jobs Semgrep e Trivy fixados em
  `.github/workflows/security.yml` e ampliados por T-062 para código, dependências e imagens.
- **Evento:** scans em todo PR/push e agenda semanal; restore manual trimestral e antes da primeira produção;
  ambos novamente após mudança de backup, cifra, storage, imagem base ou política de retenção.
- **Critério:** backup cifrado e com checksum restaura Postgres/storage em ambiente limpo, reaplica tombstones,
  sobe sem plaintext/segredo e não republica posts; gitleaks não encontra segredo; Semgrep/Trivy não deixam
  finding HIGH/CRITICAL sem correção ou exceção formal com owner e expiração; toda ocorrência é triada.
- **Evidência:** relatório de restore com backup ID, checksum, datas, contagens e asserts de reconciliação,
  sem chave/dump; SARIF/JSON dos scans e registro em `docs/security/scan-triage.md` com decisão, owner e prazo.
- **Owner:** Estaleiro, com Alicerce no restore/validação de dados.

## 12. Evidência padrão de QA

Cada relatório deve conter:

- PR, branch e SHA completos.
- Ambiente (SO, Node, pnpm, timezone e versões de containers).
- Veredito: `APROVADO`, `APROVADO COM RESSALVAS` ou `BLOQUEADO`.
- Achados numerados com severidade, `arquivo:linha`, esperado × observado e reprodução.
- Comandos e saídas resumidas: exit code, tarefas, arquivos/testes e duração.
- Casos de borda/fault injection exercitados.
- Cobertura ausente e risco residual.
- Evidências persistentes sem segredos, tokens, PII ou conteúdo privado.

## 13. Backlog inicial de implementação

1. Transformar `tests/e2e` de placeholder em Playwright executável para shell e jornada crítica.
2. Criar harness Testcontainers em `packages/domain/test`, helpers Supertest em `apps/api/test` e cenários
   de filas/adapters em `apps/worker/test`, usando `tests/fixtures` para dados compartilhados.
3. Criar servidores fake configuráveis para RSS, OpenAI, Telegram, S3 e LinkedIn.
4. Implementar matriz de idempotência/concorrência de publicação e gate G-04 do threat model.
5. Criar corpus adversarial e gate G-05 de prompt injection.
6. Adicionar Playwright + axe, contraste e viewports ao CI.
7. Definir thresholds de cobertura por pacote e publicar relatório no CI.
8. Adicionar testes de DST com clock injetado e regras explícitas para horários ambíguos/inexistentes.

