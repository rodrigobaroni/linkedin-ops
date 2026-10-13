# T-023 · Fontes, domínios permitidos e watchlist: modelo e API

- Épico: EPIC-03 Sources & Opportunities
- Responsável (papel/agente): Alicerce (backend)
- Branch/floor: `feat/T-023-sources-model-api`
- Estado: todo
- Dependências: T-008, T-015

## Contexto

J5. Fontes RSS/Atom com teste no cadastro, saúde, pausa automática; domínios permitidos; watchlist de termos com peso.

## Resultado esperado

Entidades `Source` (tipo `rss|atom|manual`, url, canonicalUrl, nome, pilar padrão, peso, ativo, pausadoAutomaticamente, lastSuccessAt, consecutiveFailures), `AllowedDomain`, `WatchlistTerm` (termo, peso); CRUD; `POST /sources/test` (busca e parseia sem salvar, retorna 3 itens e domínio); regra de pausa automática após 5 falhas consecutivas (atualizada pelo coletor T-025).

## Critérios de aceite (verificáveis)

- [ ] `POST /sources/test` com URL inválida retorna erro tipado; com feed válido retorna prévia escapada.
- [ ] Cadastro de fonte adiciona o domínio canônico à lista permitida.
- [ ] Remoção de fonte não apaga `SourceItem` históricos (soft delete).
- [ ] Limite: timeout 10 s e tamanho máximo 5 MB no teste de feed; redirecionamentos limitados a 3.

## Fora de escopo

Coleta periódica (T-025), UI (T-024), OPML (corte).

## Plano de teste

Supertest com servidor de fixtures de feeds (válido, inválido, enorme, redirect loop).

## Riscos de segurança / compliance

SSRF: bloquear IPs privados/loopback e esquemas não http(s) no teste e na coleta; conteúdo escapado.
