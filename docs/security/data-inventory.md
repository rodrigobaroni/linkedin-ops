# Inventário de dados pessoais por tabela (T-063)

- Owner: Sentinela (política); inventário: Alicerce; prazos: Rodrigo
- Versão: 0.2, 2026-10-23, base `main` 7d9ffd6 (ressalvas do Atlas no #117)
- Complementa [`data-and-lgpd.md`](./data-and-lgpd.md): o §2 de lá descreve categorias; este documento as mapeia a
  tabelas e colunas, com a retenção de cada uma e o mecanismo que a aplica.

Legenda de retenção:

- **[definido]**: prazo fixado em ADR, spec ou código. Só estes são aplicados automaticamente.
- **[proposto, matriz §4 — D1]**: prazo da matriz §4 de `data-and-lgpd.md`, que ainda aguarda a aprovação do
  Rodrigo (§11, pergunta 2). Nada é apagado por ele até a aprovação.
- **[DECISÃO RODRIGO — pendente]**: sem prazo nem na matriz; ver §5.
- **segue o dono/cascata**: a linha não tem prazo próprio; sai com o dono ou com a linha de que depende.

## 1. Achados (estado em 7d9ffd6)

1. **A exclusão completa do titular é bloqueada pelo próprio banco.** `audit_events.user_id` é `ON DELETE
   RESTRICT`, e `draft_versions`, `approvals` e `audit_events` têm triggers append-only que rejeitam UPDATE,
   DELETE e TRUNCATE (I3/I11, migração `init`). Excluir a conta e anonimizar o audit exige um caminho de erasure
   controlado no banco, que muda essas invariantes: **ADR nova, revisão de Atlas e Sentinela** (T-063, fora deste
   documento).
2. **As cópias de backup no Mac não expiram.** A VM mantém os 14 dumps mais recentes (`infra/deploy/backup-db.sh`);
   o `backup-offsite.sh pull` copia para `~/Backups/linkedin-ops` e nunca apaga nada. A matriz propõe 35 dias
   rolling. Enquanto isso valer, um dado excluído persiste indefinidamente nas cópias do Mac.
3. **Prazos definidos sem mecanismo que os aplique:** sessões vencidas, `oauth_states` e `idempotency_keys`
   (§2). O job `retention.purge` (T-063, PR 2) passa a aplicá-los. Os demais prazos da matriz ficam como
   proposta até o D1.
4. **Tabelas que já recebem dados:** conta, sessões, throttles, OAuth, `publications` (publicação manual,
   T-039), `audit_events`, Carreira (`cv_bases`, `tailoring_batches`, `job_postings`, `tailored_cvs`),
   `job_fetch_domain_state` e a fila do pg-boss. As editoriais (§3) ainda não são escritas por nenhum fluxo.

## 2. Tabelas em uso

| Tabela | Dados pessoais ou sensíveis | Origem | Retenção | Mecanismo |
|---|---|---|---|---|
| `users` | e-mail, nome, `password_hash`, `linkedin_member_urn`, TOTP cifrado, locale, timezone | Rodrigo, LinkedIn | sem prazo; até a exclusão da conta | exclusão de conta (T-063, pendente de ADR) |
| `sessions` | hash do segredo, **IP**, **user agent**, datas | browser | vida da sessão: inativa 7 dias, absoluta 30 dias **[definido, ADR-0007]**; uma sessão vencida ou revogada não autentica mais. Prazo extra para apagar a linha (≤ 24 h): [proposto, matriz §4 — D1] | `retention.purge` apaga sessões vencidas ou revogadas |
| `login_throttles` | chave com sha256 do e-mail ou IP, ou `reauth:<userId>` | sistema | 90 dias [proposto, matriz §4 — D1] | nenhum até o D1 |
| `oauth_states` | hashes de state e nonce, code verifier cifrado, `return_to` | sistema | vale 10 min; usado invalida **[definido, código do OAuth]**. Prazo extra para apagar a linha (≤ 24 h): [proposto, matriz §4 — D1] | `retention.purge` apaga states vencidos ou usados (hoje só limpeza oportunista) |
| `oauth_tokens` | access e refresh **cifrados**, `provider_subject`, `member_name` | LinkedIn | até desconexão, revogação ou expiração; ciphertext apagado na hora da desconexão **[definido, código, ADR-0004]** | desconexão (já existe) |
| `autonomy_settings` | preferências de autonomia | Rodrigo | segue o dono/cascata | cascata de `users` |
| `publications` | `body` (post publicado), `external_url`, `external_post_id` | Rodrigo | **[DECISÃO RODRIGO — pendente]** (D3: até a exclusão ou prazo fixo) | nenhum |
| `audit_events` | `user_id`, `actor_id`, **IP**, **user agent**, `before`/`after` (só ids, status e contagens por política), `correlation_id` | sistema | 2 anos, depois anonimizar o payload e manter o evento mínimo [proposto, matriz §4 — D1] | append-only; anonimização depende da ADR de erasure |
| `idempotency_keys` | `response_body` (pode conter dados da resposta), `request_hash` | sistema | **24 h** (`expires_at` = criação + 24 h) **[definido, contracts.md §1 e schema]** | `retention.purge` |
| `cv_bases` | **CV estruturado** (contato, experiências, formação), `extracted_text` (temporário), `injection_evidence` | Rodrigo | `extracted_text` apagado ao sair de `EXTRACTING` (no máximo ~40 min) **[definido, código do #92/#103]**; versão ativa: até a exclusão; **versões substituídas: [DECISÃO RODRIGO — pendente]** (D2) | sweep do CV, `DELETE /career/cv` |
| `tailoring_batches` | ids | sistema | segue o dono/cascata (vagas, CV base) | cascata |
| `job_postings` | `url` normalizada, `page_text` (**texto de terceiro**), `extracted`, `injection_evidence`, `blocked_*` | site da vaga, Rodrigo | `page_text` de vaga `FAILED`: ~40 min **[definido, código do #101]**; **vagas e o restante: [DECISÃO RODRIGO — pendente]** (D2) | sweep das vagas, `DELETE /career/jobs/{id}` |
| `tailored_cvs` | **CV adaptado** com proveniência, `match_report` | sistema e Rodrigo | **[DECISÃO RODRIGO — pendente]** (D2) | cascata da vaga |
| `job_fetch_domain_state` | domínios e horários, sem usuário | sistema | não é dado pessoal | — |
| `pgboss.job`, `pgboss.archive` | payloads só com ids, correlation id e `requestedBy` (userId); saídas e erros classificados | sistema | **[DECISÃO RODRIGO — pendente]** (D6) | padrão do pg-boss |
| Logs de app (Pino → docker) | correlation id, ids, domínios; sem conteúdo (#102, #107, #108) | sistema | 30 dias [proposto, matriz §4 — D1] | rotação do docker a confirmar (Estaleiro) |
| Logs de segurança | tentativas de login, reauth, rate limit, eventos de sessão (sem segredo) | sistema | 180 dias [proposto, matriz §4 — D1] | a definir com o Estaleiro |
| Traces | diagnóstico (sem conteúdo por padrão) | sistema | 14 dias [proposto, matriz §4 — D1] | não há tracing ativo hoje |
| Backups (dump cifrado com GPG) | tudo acima | sistema | 35 dias rolling [proposto, matriz §4 — D1] | VM: 14 dumps; Mac: sem rotação (achado 2, D5) |

## 3. Tabelas ainda sem escrita

Prazo registrado agora; aplicado quando o fluxo existir e o D1 for aprovado.

| Tabela | Dados | Retenção |
|---|---|---|
| `voice_profiles` | tom, notas | versão substituída + 30 dias [proposto, matriz §4 — D1] |
| `story_bank_entries` | histórias pessoais, que podem ter dado sensível; soft delete por `deleted_at` | apagar 30 dias depois de `deleted_at` [proposto, matriz §4 — D1] |
| `content_pillars` | nome, descrição, público-alvo | segue o dono/cascata |
| `sources` | URL, nome da fonte | segue o dono/cascata |
| `source_items` | URL, **autor (terceiro)**, `content_text` | 90 dias (PRD §10); corpo bruto ≤ 7 dias [proposto, matriz §4 — D1] |
| `watchlists` | nome, pilar | segue o dono/cascata |
| `curation_runs` | horários, estatísticas, erro classificado | segue o dono/cascata |
| `opportunities` | título e resumo derivados de terceiros | não publicada: 90 dias [proposto, matriz §4 — D1] |
| `drafts`, `draft_versions`, `approvals` | texto dos posts, razões | descartados: 1 ano; publicados: até a exclusão [proposto, matriz §4 — D1]; append-only (achado 1) |
| `schedules` | data, timezone, `cancel_reason` (texto livre do Rodrigo) | segue o dono/cascata (o draft) |
| `media_assets` (S3) | uploads e renders | não publicada: 90 dias ou 30 depois do descarte; publicada: até a exclusão [proposto, matriz §4 — D1] |
| `notifications` | `payload` | 30 dias [proposto, matriz §4 — D1] |
| `draft_version_story_entries`, `draft_version_source_items`, `opportunity_source_items`, `watchlist_sources` | só ids (junções) | segue o dono/cascata |

**Dados de terceiros.** `source_items.author`, `source_items.content_text`, `job_postings.page_text` (texto da
vaga, inclusive nomes de recrutadores que a página traga) e `job_postings.extracted`. Os prazos estão nas tabelas
acima. Os overrides de 24 h e 48 h do LinkedIn Marketing API (`data-and-lgpd.md` §4) **não se aplicam hoje**:
nada lê dados de membros pela API.

## 4. Backups: o que se pode prometer

- Os dumps são cifrados com GPG e não podem ser editados para remover um titular. O compromisso possível é:
  **o dado excluído só permanece nos backups até o fim da rotação, e qualquer restore reaplica as exclusões antes
  de os dados voltarem a ser usados.**
- Para isso ser verdade faltam a rotação das cópias no Mac (achado 2, D5) e a reaplicação das exclusões no restore,
  que depende da ADR de erasure. Até lá, uma resposta de exclusão não pode afirmar prazo de expiração dos backups.
- A chave GPG fica só no Mac, com senha; uma exclusão não exige trocá-la.

## 5. Decisões pendentes do Rodrigo

Todas **[DECISÃO RODRIGO — pendente]**. As propostas são do plano da T-063; nada abaixo está implementado.

| # | Decisão | Proposta |
|---|---|---|
| D1 | Aprovar a matriz §4 de `data-and-lgpd.md` inteira (§11, pergunta 2): todos os prazos marcados [proposto, matriz §4 — D1] acima, entre eles audit 2 anos, drafts descartados 1 ano, logs de segurança 180 dias, traces 14 dias, backups 35 dias, throttles 90 dias e o prazo de até 24 h para apagar sessões e OAuth states | aprovar como está |
| D2 | Carreira: versões de CV substituídas; vagas e CVs adaptados | versões: 30 dias depois da substituição; vagas e adaptados: 90 dias depois da última atualização |
| D3 | Conteúdo publicado: até a exclusão ou prazo fixo (`data-and-lgpd.md` §11, pergunta 4) | até a exclusão |
| D4 | Exportação: na hora, sem guardar arquivo; ou link de uso único com arquivo por até 7 dias (`data-and-lgpd.md` §7) | na hora |
| D5 | Rotação das cópias de backup no Mac | 35 dias, com ao menos as 7 cópias mais recentes |
| D6 | Histórico de jobs do pg-boss (concluídos e falhos) | 7 dias |
| D7 | Exportar ou não o `page_text` das vagas (texto de terceiro) | não exportar; só URL e extração |
| D8 | Texto da frase de confirmação da exclusão de conta e do aviso de que, sendo single-user, apagar a conta desativa a instância; controlador formal e contato (`data-and-lgpd.md` §11, pergunta 1) | a definir com Pena |
