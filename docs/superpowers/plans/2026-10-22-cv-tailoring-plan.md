# Plano de implementação: CV adaptado por vaga

- Spec: `docs/superpowers/specs/2026-10-22-cv-tailoring-design.md`
- Modo: produção (plano → crítica do Maestro → implementação → revisão Sentinela + Crivo → QA)
- Pré-requisito do Rodrigo: `OPENAI_API_KEY` no `.env` local e no `.env` da VM (0600), sem passar pelo chat.

## Ordem e paralelismo

```
PR 1 Fundação ──► PR 2 CV base ──► PR 3 Vagas e lote ──► deploy
                  (UI do PR 2 e do PR 3 começam com a IA simulada enquanto o PR 1 é revisado)
```

No máximo três frentes ao mesmo tempo. Cada PR: branch próprio, floor próprio, CI verde, revisão Sentinela e Crivo,
merge autorizado pelo Rodrigo.

## PR 1 — Fundação (Pêndulo, Alicerce, Pena; Atlas revisa a arquitetura)

1. **ADR-0008** (`docs/adr/0008-anonymous-job-page-fetching.md`): busca anônima de páginas públicas de vagas,
   inclusive LinkedIn; risco aceito pelo Rodrigo; mitigações da Sentinela (limite por domínio, user agent
   identificável, recuo em login/429/999). Atualizar `docs/security/linkedin-policy.md` e o threat model.
2. **Exceção editorial D4** em `docs/editorial` (só módulo de CV; proveniência obrigatória).
3. **Motor de IA** em `packages/editorial-engine`:
   - porta `LlmClient` + adaptador OpenAI (Structured Outputs, timeout, retry limitado, sem log de conteúdo);
   - adaptador simulado para testes e desenvolvimento;
   - prompts versionados `cv.extract`, `job.extract`, `cv.tailor`, `cv.humanize` com schemas Zod em
     `packages/contracts`;
   - regras adaptadas da `linkedin-humanizer` (cabeçalho de atribuição MIT, ADR-0006) + verificador determinístico
     de frases proibidas (lista versionada).
4. **Worker** em `apps/worker`: pg-boss no mesmo Postgres (ADR-0002), filas `job.fetch` e `cv.tailor`,
   concorrência 3, backoff, dead letter; healthcheck do worker no Compose; o override de proxy compartilhado passa a
   subir o worker.
5. **Env**: `OPENAI_API_KEY` e `OPENAI_MODEL` validados em `validateRuntimeEnv` (obrigatórios em produção quando o
   módulo Carreira estiver ligado).

Aceite: testes do motor com o adaptador simulado; worker processa job de teste no CI (Testcontainers); ADR aceito
pela Sentinela e pelo Atlas.

## PR 2 — CV base (Alicerce na API e domínio, Vitral na tela)

1. Migration aditiva `cv_bases`; entidade e repositório no domínio.
2. Rotas `POST/GET/DELETE /career/cv` e `POST /career/cv/confirm` no registry (upload multipart como exceção
   declarada; limite 5 MB; só PDF por assinatura de arquivo, não só pela extensão).
3. Extração de texto do PDF no servidor; `cv.extract` estrutura; o PDF original é descartado após a extração.
4. Tela **Meu CV** (grupo Carreira no menu): upload, revisão editável por seção, confirmar, substituir, apagar.

Aceite: extração com PDFs fictícios versionados; conteúdo do CV ausente dos logs (teste de canário); a11y da tela.

## PR 3 — Vagas e lote (Pêndulo na busca, Alicerce no domínio e API, Vitral na tela)

1. Migrations `tailoring_batches`, `job_postings`, `tailored_cvs`.
2. Busca de páginas com as proteções da spec §8 (SSRF com validação de DNS a cada redirecionamento, 3 redirects,
   2 MB, 15 s) e extração do texto principal.
3. Jobs `job.fetch` → `job.extract` → `cv.tailor` → `cv.humanize`; nota de aderência sobre o CV base antes dos
   acréscimos; proveniência por trecho; idioma da vaga.
4. Rotas `/career/batches` e `/career/jobs/*` (lista, detalhe, colar texto, retry, apagar, PDF).
5. Renderização de PDF na hora do download, layout padrão, metadados neutros, nome normalizado.
6. Tela **Vagas**: colar links, lista com status, detalhe com relatório, colar texto, baixar PDF.

Aceite: pipeline completo com IA simulada; testes de prompt injection e SSRF; lote com falha no meio; PDF validado
(abre, texto selecionável, metadados neutros).

## Deploy

`infra/deploy/deploy-shared-host.sh deploy origin/main` (backup cifrado antes das migrations, rollback automático);
`OPENAI_API_KEY` adicionada ao `.env` da VM antes; primeiro lote real com 2 ou 3 links escolhidos pelo Rodrigo.

## Riscos

| Risco                             | Mitigação                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| LinkedIn bloqueia a busca anônima | Recuo imediato e colagem de texto; nunca usar a sessão do Rodrigo.                                                      |
| Custo de IA                       | Modelo configurável; uma chamada de extração por vaga e uma de adaptação; humanizer só regenera em reprovação (máx. 2). |
| Qualidade da extração de PDF      | Revisão manual obrigatória do CV base antes de usar.                                                                    |
| Conteúdo acrescentado pela IA     | Marcado na revisão e listado no relatório (decisão D4 do Rodrigo).                                                      |
