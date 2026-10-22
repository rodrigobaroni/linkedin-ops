# Prova real da API do LinkedIn (T-061 / gate G-01)

> Status: **G-01 FECHADO** em 2026-10-22 (UTC). OAuth, escopos, `userinfo`, `id_token` (assinatura, `iss`, `aud`,
> `exp`/`iat`, `sub`) e `LinkedIn-Version` foram provados com o app real em 2026-10-21 (duas execuções do probe); a
> ausência de `nonce` foi provada e tratada como exceção aprovada pela Sentinela; e a primeira publicação real
> (`POST /rest/posts`) saiu pela plataforma em produção com texto escrito e confirmado pelo Rodrigo (ver
> "Resultados — primeira publicação real"). PKCE continua opcional (pendência 3).

## Contexto

O gate G-01 do MVP-0 exige provar, com o app e o token reais, que o fluxo OAuth 2.0 (authorization code)
concede `w_member_social` e que `POST /rest/posts` publica texto como membro. Condições da Sentinela
(2026-10-21): escopos **só** `openid profile w_member_social`, `LinkedIn-Version` fixo e suportado,
`X-Restli-Protocol-Version: 2.0.0`, PKCE desligado de forma explícita (N3) até a prova dizer o contrário.

## Como reproduzir

Pré-requisitos: `.env` na raiz do worktree com `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` e
`LINKEDIN_REDIRECT_URI=http://localhost:3001/api/v1/auth/linkedin/callback`. Essa URL precisa estar
cadastrada no portal do app. A porta 3001 precisa estar livre, ou seja, a API não pode estar rodando.

```sh
# 1. Autorização + userinfo + diagnóstico do id_token + checagem de versão (nada é publicado)
pnpm --filter @linkedin-ops/api linkedin:probe

# 2. (Opcional) PKCE: mesma coisa enviando code_challenge S256
pnpm --filter @linkedin-ops/api linkedin:probe -- --pkce

# 3. Publicação de teste: só com o texto aprovado pelo Rodrigo, confirmada digitando PUBLICAR
pnpm --filter @linkedin-ops/api linkedin:probe -- --publish-file /caminho/absoluto/texto.txt
```

O token existe só na memória do processo. Ele nunca é impresso nem gravado, e os erros do LinkedIn são
reduzidos a `code`/`message`. O diagnóstico do `id_token` imprime só **nomes** de claims e booleanos,
nunca valores. O `sub` do membro não entra neste documento.

## Resultados — execução 1 (2026-10-21, Rodrigo, sem `--publish-file`, sem `--pkce`)

| Item                                                  | Resultado                                                                                                                                                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data / operador                                       | 2026-10-21 / Rodrigo, máquina local                                                                                                                                                                                                                     |
| Escopos pedidos                                       | `openid profile w_member_social`                                                                                                                                                                                                                        |
| Escopos concedidos                                    | `openid profile w_member_social` ✅ (todos; nenhum a mais)                                                                                                                                                                                              |
| Validade do access token (`expires_in`)               | 5 183 999 s (~60 dias)                                                                                                                                                                                                                                  |
| Refresh token emitido                                 | não (esperado: o app não tem essa aprovação)                                                                                                                                                                                                            |
| `id_token` emitido                                    | sim                                                                                                                                                                                                                                                     |
| `id_token.nonce` confere                              | **não**. A execução 1 não separava "ausente" de "diferente"; ver abaixo                                                                                                                                                                                 |
| Campos de `GET /v2/userinfo`                          | `family_name, given_name, locale, name, picture, sub` (sem `email`, como pedido)                                                                                                                                                                        |
| `X-Restli-Protocol-Version` devolvido pelo `userinfo` | `1.0.0` (endpoint v2; o `/rest/posts` usa `2.0.0`)                                                                                                                                                                                                      |
| `LinkedIn-Version` usada e aceita                     | `202608` aceita ✅. `GET /rest/posts/urn:li:share:0` respondeu `403 ACCESS_DENIED` (`partnerApiPostsExternal.GET.20260801`), não `426`. A versão resolveu para `20260801`; o 403 é esperado, porque ler posts exige `r_member_social`, que não é pedido |
| PKCE S256 aceito                                      | não testado (sem `--pkce`); `LINKEDIN_PKCE=disabled` continua valendo (N3)                                                                                                                                                                              |
| `POST /rest/posts` (texto)                            | **provado** na primeira publicação real (2026-10-22, ver seção própria)                                                                                                                                                                                 |
| URN retornado (`x-restli-id`)                         | pendente                                                                                                                                                                                                                                                |
| Formação do author URN (`urn:li:person:<sub>`)        | **provado**: aceito como `author` na primeira publicação real (o `sub` é o do `userinfo`, pairwise)                                                                                                                                                     |
| Headers de limite observados                          | nenhum `x-ratelimit*`/`retry-after` nas respostas de `userinfo` e `/rest/posts`; só `x-restli-gateway-error: true` no 403                                                                                                                               |

### Cota exibida no Developer Portal (Analytics do app, consultada pelo Rodrigo em 2026-10-22, depois da publicação)

O portal lista, por recurso e método, um percentual de uso e dois limites diários (do app e por membro). Registro
sanitizado das linhas usadas pelo MVP-0:

| Recurso    | Método | Uso exibido | Limite diário do app | Limite diário por membro |
| ---------- | ------ | ----------- | -------------------- | ------------------------ |
| `posts`    | CREATE | 0%          | 180.000              | 500                      |
| `userinfo` | GET    | 0%          | 100.000              | 500                      |

O que o portal **não** exibiu: o consumo desta publicação e das chamadas do probe (uso continuou em 0% minutos depois,
ou seja, a contagem é agregada com atraso) e o horário de reset da janela diária. Com 500 posts por membro por dia, o
limite de publicação da própria plataforma (3 por usuário a cada 10 min, ADR-0007) fica muito abaixo da cota.
A lista completa do portal inclui outros recursos fora do escopo do MVP-0 (`ugcPosts`, `shares`, `images`, `videos`,
`documents`, `reactions`, `socialActions/*`, `groupMemberships`, `groupDefinitions`, `assets`), sem uso registrado.

## Resultados — execução 2 (2026-10-21, Rodrigo, probe `07be5b1`, sem publicar)

Diagnóstico do `id_token` sem nenhum valor de claim exibido:

| Item                                                 | Resultado                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Escopos, `expires_in`, refresh, campos do `userinfo` | iguais aos da execução 1                                                  |
| Header                                               | `alg=RS256`, `kid` presente                                               |
| Claims do payload (nomes)                            | `aud, exp, family_name, given_name, iat, iss, locale, name, picture, sub` |
| `nonce`                                              | **ausente**: não veio vazio nem divergente; o claim não existe no payload |
| `iss = https://www.linkedin.com/oauth`               | sim                                                                       |
| `aud` contém o `client_id`                           | sim (string)                                                              |
| `exp − agora` / `iat − agora`                        | 3599 s / −1 s (token de 1 h, recém-emitido)                               |
| `sub = userinfo.sub`                                 | sim                                                                       |
| Assinatura RS256 pela JWKS do LinkedIn               | válida                                                                    |
| `GET /rest/posts/urn:li:share:0`                     | `403 ACCESS_DENIED` (igual à execução 1; versão `202608` aceita)          |

### Discovery OIDC público do LinkedIn (consultado em 2026-10-21, sem credenciais)

`https://www.linkedin.com/oauth/.well-known/openid-configuration`:

- `issuer`: `https://www.linkedin.com/oauth` (igual a `LINKEDIN_OIDC_ISSUER`);
- `jwks_uri`: `https://www.linkedin.com/oauth/openid/jwks`; `id_token_signing_alg_values_supported`: `RS256`;
- `response_types_supported`: `code`; `subject_types_supported`: `pairwise`;
- `claims_supported`: `iss, aud, iat, exp, sub, name, given_name, family_name, picture, email,
email_verified, locale`. **`nonce` não aparece.**

A JWKS tinha uma chave RSA com `kid`, **sem** `alg` e sem `use`. A validação da API aceita esse formato:
o teste unitário `works with LinkedIn's real JWKS shape` cobre o caso.

## Resultados — primeira publicação real (2026-10-22 00:05 UTC, produção, Rodrigo)

Fluxo: login em https://linkedin.baroni.dedyn.io (release `581d3a1`), **Conectar LinkedIn** com reautenticação e
autorização no LinkedIn, texto escrito pelo Rodrigo na página **Publicar**, confirmação mostrando a conta e o texto
final, reautenticação e **um único** envio. Dados lidos do banco de produção pelo Maestro (sem tokens):

| Item              | Resultado                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conexão           | `LINKEDIN`, `ACTIVE`, membro "Rodrigo Baroni", escopos `openid profile w_member_social`, token cifrado (envelope, `key_version` 1), expira em 2026-12-21; sem refresh token |
| Publicação        | `SUCCEEDED` na tentativa 1 (o serviço só marca `SUCCEEDED` com HTTP 201 e `x-restli-id` presente)                                                                           |
| `x-restli-id`     | `urn:li:share:7518824731823804417` (formato `urn:li:share:`)                                                                                                                |
| URL               | `https://www.linkedin.com/feed/update/urn:li:share:7518824731823804417/`                                                                                                    |
| Latência          | 0,99 s entre `started_at` e `finished_at`                                                                                                                                   |
| Author            | `urn:li:person:<sub>` com o `sub` do `userinfo` (valor omitido: identificador pessoal pairwise)                                                                             |
| Duplicidade       | 1 linha em `publications`; nenhum reenvio                                                                                                                                   |
| Auditoria         | `auth.login`, `auth.reauth`, `auth.session.rotate`, `integration.linkedin.connect`, `publication.succeeded`                                                                 |
| Headers de limite | não registrados pela aplicação (o probe também não viu headers de rate limit nas chamadas de leitura)                                                                       |

## Pendências para fechar o G-01

1. ~~Nonce~~: **resolvido** (execução 2 + exceção aprovada; ver "Não conformidade do LinkedIn" abaixo).
2. ~~Publicação de teste~~: **resolvido** (primeira publicação real em produção; ver a seção abaixo).
3. **PKCE (opcional para o MVP-0).** Rodar com `--pkce`. Se o fluxo for aceito, propor
   `LINKEDIN_PKCE=required` em outra tarefa (hoje o boot recusa `required`).

## Não conformidade do LinkedIn: `nonce` omitido no `id_token`

O OIDC Core 1.0 deixa o `nonce` **opcional só na requisição** (§3.1.2.1). Uma vez enviado, o Authorization
Server **MUST** incluí-lo no `id_token` com o mesmo valor (§2), e o cliente **MUST** conferi-lo
(§3.1.3.7, item 11). O LinkedIn recebe o `nonce` no authorize, mas **não o devolve**: a execução 2 provou
que o claim está ausente, e o discovery não lista `nonce` em `claims_supported`. Isto é uma **não
conformidade/limitação de interoperabilidade do LinkedIn**, não o comportamento normal do OIDC.

Exceção aprovada pela Sentinela (2026-10-21, PR #84), implementada em
`apps/api/src/linkedin/id-token.verifier.ts`:

- a exceção é a constante `LINKEDIN_OMITS_ID_TOKEN_NONCE = true`, única e no código, nunca em env ou
  configuração; mudar exige nova execução do probe e o aval da Sentinela;
- o `nonce` continua sendo gerado (CSPRNG, só o SHA-256 é persistido com o state) e enviado no authorize;
- `nonce` **presente e igual** → aceito; **presente** vazio, não-string ou divergente → **rejeitado**;
- `nonce` **ausente** → aceito só sob a constante, e todas as demais checagens continuam obrigatórias:
  assinatura RS256 por chave da JWKS do LinkedIn, `iss` exato, `aud = client_id`, `exp`/`iat` (tolerância de
  60 s, idade máxima de 10 min) e `sub = userinfo.sub`. Em volta delas também continuam obrigatórios: o
  `state` de uso único, de 10 min, ligado a sessão + usuário e consumido atomicamente antes de qualquer
  chamada (N1); e a troca do `code` server-side com `client_secret`, cujo `id_token` chega por TLS direto
  do token endpoint, sem passar pelo front-channel;
- testes: unitários em `id-token.verifier.test.ts` (ausente aceito; ausente com assinatura, `aud`, `iss`,
  `exp`, `iat` ou `sub` inválidos rejeitado; presente vazio, numérico, nulo ou divergente rejeitado) e de
  integração em `linkedin.integration.test.ts` (o LinkedIn falso emite o formato real, sem `nonce`;
  `nonce` igual aceito; `nonce` divergente ou vazio rejeitado).

## Decisões derivadas

- `LinkedIn-Version: 202608` fica fixada no código (`linkedin.constants.ts`); qualquer troca exige nova
  execução do probe.
- Sem refresh token: o painel mostra a expiração (~60 dias) e pede reconexão (Sentinela, condição 10).
- `email` continua fora dos escopos; o `userinfo` confirma que ele não é devolvido.
- Nonce: exceção de interoperabilidade aprovada e documentada acima; o probe mantém a checagem
  (`nonce: ausente|vazio|DIFERENTE|igual`) para detectar se o LinkedIn passar a ecoá-lo.
