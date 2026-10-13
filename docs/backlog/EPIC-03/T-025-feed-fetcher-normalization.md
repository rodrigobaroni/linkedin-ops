# T-025 · Coletor RSS/Atom e normalização de itens

- Épico: EPIC-03 Sources & Opportunities
- Responsável (papel/agente): Pêndulo (automação/integrações)
- Branch/floor: `feat/T-025-feed-fetcher-normalization`
- Estado: todo
- Dependências: T-006, T-023

## Contexto

Primeira etapa do ciclo (PRD §7.1). Itens são dados não confiáveis; precisam de normalização (título, resumo em texto puro, URL canônica, `publishedAt`, autor, idioma) e armazenamento com retenção.

## Resultado esperado

Job `sources.fetch` por fonte (paralelismo limitado, timeout, ETag/Last-Modified, limite de tamanho), parser tolerante, sanitização de HTML para texto, canonicalização de URL (remover UTM, normalizar host), extração de `publishedAt` com fallback "desconhecido", gravação em `SourceItem` com dedup por (`sourceId`, `guid|canonicalUrl`), atualização de saúde da fonte e pausa automática após 5 falhas, retenção de 90 dias (job de limpeza).

## Critérios de aceite (verificáveis)

- [ ] 50 fontes fixture coletadas em ≤ 3 min com concorrência 5.
- [ ] Item com HTML/script no título é armazenado como texto puro.
- [ ] Mesmo item com UTM diferente não duplica.
- [ ] Fonte com 5 falhas seguidas fica `pausedAutomatically = true` e gera alerta interno.
- [ ] Bloqueio de SSRF (IP privado, `file://`) testado.

## Fora de escopo

Dedup entre fontes (T-026), classificação (T-027).

## Plano de teste

Servidor de fixtures; Testcontainers; teste de retenção com relógio falso.

## Riscos de segurança / compliance

SSRF; bombas de XML; conteúdo externo como dado.
