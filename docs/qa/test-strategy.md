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
- Integração fica em `tests/integration/`, separada por componente e marcada para exigir containers.
- Contratos ficam em `packages/contracts/test/` e usam fixtures canônicas em `tests/fixtures/`.
- E2E fica em `tests/e2e/`; providers externos são substituídos por servidores fake determinísticos.
- Casos adversariais de prompt ficam em `tests/fixtures/prompt-injection/`, com proveniência e resultado esperado.
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
- Unique constraints e transações provam os invariantes I1–I13 do modelo.
- Supertest valida status, content type, Problem Details, RBAC, CSRF, row version e idempotency key.
- Jobs provam singleton, claim atômico, retry/backoff, expiração, DLQ e retomada após restart.
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

- Retry: timeout de transporte, desconexão, 429 respeitando `Retry-After` e 5xx transitório.
- Não retry: payload/schema inválido, autenticação definitivamente inválida, 4xx sem indicação transitória, política/estado de domínio incompatível.
- Sempre testar limite de tentativas, backoff exponencial, jitter controlado, expiração e DLQ.
- Reiniciar worker entre tentativas para provar persistência do estado e ausência de dependência em memória.

### 6.2 Idempotência

Para cada ação mutável marcada como idempotente:

- Mesma key + mesmo fingerprint retorna/reutiliza o mesmo resultado.
- Mesma key + payload diferente retorna conflito e não executa efeito.
- Sem key quando obrigatória retorna Problem Details determinístico.
- Key duplicada simultânea em 2, 10 e 50 requests produz um único registro/job/efeito.
- Retry após resposta perdida não repete o efeito.
- Chave e fingerprint são escopados corretamente por usuário/ação.

### 6.3 Publicação LinkedIn

Executar as barreiras de confiabilidade em ordem:

1. Revalidar sessão elevada, modo de autonomia, aprovação, versão e schedule.
2. Criar/obter `Publication` pela idempotency key.
3. Fazer claim atômico `PENDING → IN_PROGRESS` com `rowCount = 1`.
4. Chamar o fake LinkedIn uma vez.
5. Persistir URN/resposta e transicionar para `SUCCEEDED`.

Fault injection em cada fronteira deve provar:

- Crash antes da chamada: seguro para retry.
- Timeout antes de enviar bytes: retry conforme adapter.
- Timeout após o provider possivelmente aceitar: `AMBIGUOUS`, bloqueio de retry cego e reconciliação.
- Crash após sucesso remoto e antes do commit: reconciliação encontra o post; nunca cria segundo.
- Dois workers ou publish manual + schedule simultâneos: no máximo um claim/chamada.

## 7. Falhas por integração

| Integração | Casos injetados | Resultado esperado |
|---|---|---|
| RSS/Atom/URLs | timeout, DNS/redirect, XML/HTML malformado, encoding, feed vazio, item gigante, duplicado, data inválida, 404/429/5xx, IP privado/metadata | limite de bytes/tempo/redirects, SSRF bloqueado, provenance preservada, dedupe, run `PARTIAL`/`FAILED` conforme orçamento |
| OpenAI | timeout, 429 + Retry-After, 5xx, recusa, JSON truncado, schema inválido, source ID inventado, custo/tokens acima do limite | retry limitado, `store:false`, validação pós-modelo, nenhum draft/opportunity inválido persistido, erro classificado |
| Telegram | timeout, 429, 401/403, chat inválido, 5xx, resposta duplicada; webhook falso/replay se inbound existir | notificação reprocessável/deduplicada; publicação permanece fonte da verdade; inbound nunca aprova/publica |
| S3-compatible | indisponível, timeout, PUT parcial, checksum divergente, MIME/magic bytes inválidos, arquivo grande, URL assinada expirada | objeto privado, cleanup/recovery, estado não publicado, erro acionável; acesso anônimo falha |
| LinkedIn API | token expirado, refresh indisponível, 401/403, 429, 5xx, timeout antes/depois do aceite, resposta sem URN, versão de API inválida | reauth segura, backoff/Retry-After, `AMBIGUOUS` quando necessário, reconciliação, zero duplicação |
| PostgreSQL/pg-boss | deadlock, unique violation, conexão perdida, restart durante job, job duplicado, relógio atrasado | retry transacional seguro, singleton/claim, recovery e auditoria coerente |

Cada fake deve registrar número de chamadas, payload fingerprint, ordem e timestamps virtuais para assertivas de “exatamente uma vez” no efeito externo e “ao menos uma vez” no processamento interno.

## 8. Prompt injection e autenticidade

Manter corpus adversarial versionado com, no mínimo:

- “Ignore instruções anteriores”, role-play e mensagens falsas de sistema/developer.
- Pedido de segredo, token, prompt, variável de ambiente ou acesso a ferramenta/URL.
- Instruções escondidas em HTML, Markdown, comentários, Unicode/bidirecional, base64 e campos de autor/título/URL.
- Fonte que manda inventar experiência, números, citação ou opinião de Rodrigo.
- Source IDs e URLs não fornecidos; claims sem evidência; instrução para publicar/aprovar.
- Conteúdo multilíngue e combinações de várias fontes, uma delas maliciosa.

Assertivas:

- Conteúdo externo aparece somente no campo de dados delimitado, nunca em instruções.
- Modelo não recebe segredos nem tools livres; `store:false` é enviado.
- Output valida contra Structured Output strict e referencia apenas IDs permitidos.
- Injeção suspeita é marcada/contabilizada; falha fecha sem promoção automática.
- Nenhuma história, opinião, número ou experiência é atribuída a Rodrigo sem Story Bank/fonte autorizada.
- Nenhuma saída do modelo muda autonomia, aprova, agenda ou publica.
- Gate humano continua obrigatório nos modos que o exigem.

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

## 11. Evidência padrão de QA

Cada relatório deve conter:

- PR, branch e SHA completos.
- Ambiente (SO, Node, pnpm, timezone e versões de containers).
- Veredito: `APROVADO`, `APROVADO COM RESSALVAS` ou `BLOQUEADO`.
- Achados numerados com severidade, `arquivo:linha`, esperado × observado e reprodução.
- Comandos e saídas resumidas: exit code, tarefas, arquivos/testes e duração.
- Casos de borda/fault injection exercitados.
- Cobertura ausente e risco residual.
- Evidências persistentes sem segredos, tokens, PII ou conteúdo privado.

## 12. Backlog inicial de implementação

1. Transformar `tests/e2e` de placeholder em Playwright executável para shell e jornada crítica.
2. Criar harness Testcontainers para PostgreSQL + pg-boss e helpers Supertest.
3. Criar servidores fake configuráveis para RSS, OpenAI, Telegram, S3 e LinkedIn.
4. Implementar matriz de idempotência/concorrência de publicação e gate G-04 do threat model.
5. Criar corpus adversarial e gate G-05 de prompt injection.
6. Adicionar Playwright + axe, contraste e viewports ao CI.
7. Definir thresholds de cobertura por pacote e publicar relatório no CI.
8. Adicionar testes de DST com clock injetado e regras explícitas para horários ambíguos/inexistentes.

