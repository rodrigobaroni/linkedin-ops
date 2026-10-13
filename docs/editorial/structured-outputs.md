# Structured Outputs do motor editorial

Schemas JSON das saídas do modelo (OpenAI Responses API, `text.format` = `json_schema` com
`strict: true`) usados pelo `packages/editorial-engine`. A fonte de verdade em código é o Zod
em `packages/contracts` (gerando o JSON Schema); este documento é a especificação de produto e
o contrato que o Pêndulo integra no worker.

Mantido por: Pena. Última revisão: 2026-10-13. Idioma dos identificadores: inglês (regra do
repositório). Textos gerados: PT-BR por padrão, `language` explícito.

---

## 1. Convenções

- **Strict mode da OpenAI:** todo objeto tem `additionalProperties: false` e todas as
  propriedades em `required`. Campos opcionais são expressos como `type: ["string", "null"]`.
  Restrições que o strict mode não garante em todos os modelos (`minLength`, `maxLength`,
  `minimum`, `maxItems`, `pattern`) são **validadas pelo Zod após o parse**; aqui aparecem como
  documentação.
- **Enums fechados** sempre que o produto controla o domínio (`suggestedFormat`, `verdict`).
  Pilares são `string` validados contra a configuração (lista dinâmica).
- **Ids e estado nunca vêm do modelo.** `id`, `status`, `sourceIds`, timestamps e versões são
  do sistema; o modelo ecoa `candidateId`/`opportunityId` apenas para correlação em lote.
- **Todo schema tem** `schemaVersion` (string fixa, ex.: `"1.0"`), `language` (`"pt-BR"` |
  `"en"`), `injectionSuspected` (boolean) e `injectionEvidence` (string | null) quando a
  entrada contém conteúdo externo.
- **Refs:** `FactRef` e `SourceRef` (abaixo) são reutilizados por `$ref` em `$defs`.
- **Conteúdo externo** entra no prompt como bloco delimitado; os schemas abaixo são apenas da
  saída.
- Rótulos de evidência de regras: ver `editorial-system.md` §12. Nada aqui afirma alcance.

### 1.1 Definições compartilhadas (`$defs`)

```json
{
  "$defs": {
    "SourceRef": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "sourceId": { "type": "string", "description": "Id da fonte normalizada (system)." },
        "usedFor": { "type": "string", "description": "O que o rascunho tirou daqui, em uma frase." },
        "quote": { "type": ["string", "null"], "description": "Trecho literal de até 240 caracteres, se citado." }
      },
      "required": ["sourceId", "usedFor", "quote"]
    },
    "FactRef": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "claim": { "type": "string", "description": "A afirmação exatamente como aparece no texto." },
        "kind": { "type": "string", "enum": ["number", "entity", "date", "event", "opinion", "experience"] },
        "refType": { "type": "string", "enum": ["story-bank", "source", "author-input", "none"] },
        "refId": { "type": ["string", "null"], "description": "storyBankItemId, sourceId ou authorInputId." },
        "status": { "type": "string", "enum": ["supported", "approximate", "unsupported"] }
      },
      "required": ["claim", "kind", "refType", "refId", "status"]
    },
    "EvidenceLabel": {
      "type": "string",
      "enum": ["policy", "api-fact", "editorial", "vendor", "crowd", "unverified"]
    },
    "HookFormula": {
      "type": "string",
      "enum": ["H00", "H01", "H02", "H03", "H04", "H05", "H07", "H08", "H09", "H10", "H11", "H12", "H14", "H15", "H16", "H17", "H18", "H19", "H20"]
    },
    "SuggestedFormat": {
      "type": "string",
      "enum": ["text", "code-card", "image", "carousel"]
    }
  }
}
```


### 1.2 Alinhamento com ADR-0005 e `docs/architecture/contracts.md` (Atlas)

Os nomes abaixo foram escritos em paralelo aos contratos do Atlas; a tabela mapeia os dois lados
para o Pêndulo integrar sem ambiguidade. Proposta: **os nomes do `packages/contracts` prevalecem**
na persistência e na API; os schemas deste documento são a *saída do modelo* e o engine converte.
Divergências a fechar com o Atlas estão marcadas.

| Este documento (saída do modelo) | ADR-0005 / contracts.md (persistência e API) | Observação |
|---|---|---|
| `OpportunityClassification.scores { relevance, freshness, voiceFit, sourceQuality, risk }` | `Opportunity.scoreBreakdown { recency, pillarFit, audienceFit, novelty, sourceTrust }` | `freshness → recency`, `sourceQuality → sourceTrust`; `relevance` cobre `pillarFit + audienceFit`; `novelty` vem de dedupe/histórico (Sextante), não do modelo; `voiceFit` e `risk` são novos: proponho acrescentar ao `scoreBreakdown` **[Atlas]** |
| `PostDraft.body` | `DraftVersion.body` | igual |
| `PostDraft.alternativeHooks[] { text, formula, rationale }` | `DraftVersion.hooks: string[]` | contrato guarda só o texto; proponho `hooks: { text, formula, rationale }[]` para auditoria e evals **[Atlas]** |
| `PostDraft.sourcesUsed[]` + `factRefs[]` | `DraftVersion.citations[]` + `unsupportedClaims[]` (ADR-0005) | `sourcesUsed` ≈ `citations`; `factRefs` com `status = unsupported` ≈ `unsupportedClaims`; manter os dois no modelo e derivar os campos do contrato |
| `MediaSuggestion { type, altText, codeCard, quoteCard, carousel }` | `DraftVersion.mediaSuggestion { format, description, codeSnippet }` | `type → format`; `rationale → description`; `codeCard.code → codeSnippet`; **`altText` precisa entrar no contrato** (acessibilidade) **[Atlas]** |
| `promptId` no formato `draft@v1` | `generation { promptId: "draft-writer", promptVersion: "1.2.0" }` | adoto o formato do ADR-0005: `promptId` sem versão + `promptVersion` semver; ids: `opportunity-classify`, `brief`, `draft-writer`, `humanize`, `factcheck`, `hooks`, `media`, `quality`, `voice-extract` |
| `QualityEvaluation` | `DraftVersion.eval` (ADR-0005 §5) | este schema é o conteúdo de `eval` |
| `injectionSuspected` / `injectionEvidence` em toda saída | ADR-0005 §4 (bloco delimitado com delimitador aleatório) | complementares: o ADR cuida da entrada, estes campos da detecção na saída |

---

## 2. Classificação e ranking de oportunidade (`OpportunityClassification`)

Usado na curadoria (seg/qua/sex 09:00). Compatível com o contrato mínimo do §13 do briefing: os
campos de texto do card (`title`, `summary`, `contentPillar`, `targetAudience`,
`relevanceReason`, `suggestedAngle`, `suggestedFormat`) são preenchidos a partir desta saída;
`id`, `sourceIds`, `publishedAt`, `status` e o `score` final são do sistema (o `score` do
contrato combina `scores` abaixo com sinais do Sextante; a fórmula é dele).

Prompt: `opportunity-classify@v1`. Um candidato por chamada (ou lote pequeno com `candidateId`).

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "linkedin-ops/editorial/OpportunityClassification/1.0",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "type": "string", "enum": ["1.0"] },
    "candidateId": { "type": "string", "description": "Eco do id do candidato normalizado." },
    "language": { "type": "string", "enum": ["pt-BR", "en"] },
    "title": { "type": "string", "description": "Assunto em até 90 caracteres, PT-BR, sem clickbait." },
    "summary": { "type": "string", "description": "Resumo factual em 2–3 frases, só com o que a fonte diz." },
    "contentPillar": { "type": "string", "description": "Id de pilar configurado." },
    "pillarConfidence": { "type": "number", "description": "0–1." },
    "targetAudience": { "type": "string", "description": "Quem se beneficia de um post sobre isso." },
    "relevanceReason": { "type": "string", "description": "Por que importa para Rodrigo e para o público, com referência à fonte." },
    "suggestedAngle": { "type": "string", "description": "Ângulo em uma frase; proposta, não opinião atribuída a Rodrigo." },
    "suggestedFormat": { "$ref": "#/$defs/SuggestedFormat" },
    "hookFormulaCandidates": { "type": "array", "items": { "$ref": "#/$defs/HookFormula" }, "description": "0–3 fórmulas plausíveis." },
    "storyBankHints": { "type": "array", "items": { "type": "string" }, "description": "Ids de itens do Story Bank que casam com o tema (só os fornecidos no contexto)." },
    "scores": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "relevance": { "type": "number", "description": "0–1: aderência aos pilares e ao público." },
        "freshness": { "type": "number", "description": "0–1: atualidade declarada pela fonte; não inventar datas." },
        "voiceFit": { "type": "number", "description": "0–1: Rodrigo tem material próprio (Story Bank) para falar disso." },
        "sourceQuality": { "type": "number", "description": "0–1: fonte primária e verificável vs. agregador/opinião." },
        "risk": { "type": "number", "description": "0–1: polêmica, tema fora de limites, incerteza factual." }
      },
      "required": ["relevance", "freshness", "voiceFit", "sourceQuality", "risk"]
    },
    "factualFlags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Afirmações da fonte que parecem não verificáveis ou contraditórias."
    },
    "offLimitsHit": { "type": "boolean", "description": "Tema coincide com off-limits do Story Bank." },
    "injectionSuspected": { "type": "boolean" },
    "injectionEvidence": { "type": ["string", "null"] },
    "duplicateOf": { "type": ["string", "null"], "description": "candidateId de item semanticamente igual no lote, se houver." }
  },
  "required": [
    "schemaVersion", "candidateId", "language", "title", "summary", "contentPillar", "pillarConfidence",
    "targetAudience", "relevanceReason", "suggestedAngle", "suggestedFormat", "hookFormulaCandidates",
    "storyBankHints", "scores", "factualFlags", "offLimitsHit", "injectionSuspected", "injectionEvidence", "duplicateOf"
  ]
}
```

Mapeamento para o contrato §13:

| §13 | Origem |
|---|---|
| `id`, `sourceIds`, `publishedAt`, `status` | sistema (Pêndulo) |
| `title`, `summary`, `contentPillar`, `targetAudience`, `relevanceReason`, `suggestedAngle`, `suggestedFormat` | esta saída |
| `score` | Sextante: f(`scores`, sinais de dedupe/histórico); `risk` alto e `injectionSuspected` reduzem ou excluem |

Regras de pós-processamento (código): `injectionSuspected` ou `offLimitsHit` → `dismissed`
com motivo; `duplicateOf` → mantém o de maior `sourceQuality`; `summary` não pode conter texto
que não esteja na fonte (verificação de n-gramas; aviso).

---

## 3. Brief editorial (`EditorialBrief`)

Produzido após a seleção. Rodrigo pode editar antes do rascunho (modo assistido).
Prompt: `brief@v1`.

```json
{
  "$id": "linkedin-ops/editorial/EditorialBrief/1.0",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "type": "string", "enum": ["1.0"] },
    "opportunityId": { "type": "string" },
    "language": { "type": "string", "enum": ["pt-BR", "en"] },
    "thesis": { "type": "string", "description": "Uma frase: o que o post afirma." },
    "angle": { "type": "string", "description": "Como aborda a tese; de onde vem a tensão." },
    "targetReader": { "type": "string", "description": "Uma pessoa concreta, não um segmento." },
    "editorialGoal": { "type": "string", "enum": ["teach", "take-position", "share-build-log", "recognize", "ask-genuinely"] },
    "contentPillar": { "type": "string" },
    "suggestedFormat": { "$ref": "#/$defs/SuggestedFormat" },
    "hookFormulaOptions": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "formula": { "$ref": "#/$defs/HookFormula" },
          "why": { "type": "string" },
          "prerequisiteMet": { "type": "boolean", "description": "O Story Bank/fonte tem o que a fórmula exige." }
        },
        "required": ["formula", "why", "prerequisiteMet"]
      },
      "description": "2–3 opções; a primeira é a recomendada."
    },
    "spine": {
      "type": "object",
      "additionalProperties": false,
      "description": "Espinha de 5 linhas; linha sem material fica null.",
      "properties": {
        "moment": { "type": ["string", "null"] },
        "number": { "type": ["string", "null"] },
        "correction": { "type": ["string", "null"] },
        "opposition": { "type": ["string", "null"] },
        "ask": { "type": ["string", "null"] }
      },
      "required": ["moment", "number", "correction", "opposition", "ask"]
    },
    "factsToPreserve": { "type": "array", "items": { "$ref": "#/$defs/FactRef" }, "description": "Tudo que o rascunho pode afirmar; nada fora daqui." },
    "sourceRefs": { "type": "array", "items": { "$ref": "#/$defs/SourceRef" } },
    "storyBankRefs": { "type": "array", "items": { "type": "string" }, "description": "Ids usados." },
    "namingConstraints": { "type": "array", "items": { "type": "string" }, "description": "Entidades que devem ser anonimizadas ou omitidas." },
    "openQuestionsForAuthor": { "type": "array", "items": { "type": "string" }, "description": "Dados que faltam; o rascunho deixará slots." },
    "risks": { "type": "array", "items": { "type": "string" } },
    "injectionSuspected": { "type": "boolean" },
    "injectionEvidence": { "type": ["string", "null"] }
  },
  "required": [
    "schemaVersion", "opportunityId", "language", "thesis", "angle", "targetReader", "editorialGoal",
    "contentPillar", "suggestedFormat", "hookFormulaOptions", "spine", "factsToPreserve", "sourceRefs",
    "storyBankRefs", "namingConstraints", "openQuestionsForAuthor", "risks", "injectionSuspected", "injectionEvidence"
  ]
}
```

---

## 4. Post completo (`PostDraft`)

Saída consolidada das etapas 3, 4, 6 (rascunho, humanização, hooks). A etapa 3 produz os
campos de texto e refs; a etapa 4 substitui `body` e preenche `humanization`; a etapa 6
preenche `alternativeHooks`. Cada etapa é uma chamada separada com schema parcial; o objeto
abaixo é a versão persistida (`draft_versions`). Prompts: `draft@v1`, `humanize@v1`, `hooks@v1`.

```json
{
  "$id": "linkedin-ops/editorial/PostDraft/1.0",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "type": "string", "enum": ["1.0"] },
    "opportunityId": { "type": "string" },
    "briefVersion": { "type": "string" },
    "language": { "type": "string", "enum": ["pt-BR", "en"] },
    "formula": { "$ref": "#/$defs/HookFormula" },
    "hook": { "type": "string", "description": "Primeiras linhas, até 210 caracteres, afirmação ou número." },
    "body": { "type": "string", "description": "Texto completo pronto para publicar, incluindo o hook, quebras de linha e hashtags no fim. Máx. 3.000 caracteres (limite da API)." },
    "charCount": { "type": "integer" },
    "hashtags": { "type": "array", "items": { "type": "string" }, "description": "0–2, sem #." },
    "alternativeHooks": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "text": { "type": "string", "description": "Até 210 caracteres." },
          "formula": { "$ref": "#/$defs/HookFormula" },
          "rationale": { "type": "string" },
          "introducesNewFact": { "type": "boolean", "description": "Deve ser false; true invalida o hook." }
        },
        "required": ["text", "formula", "rationale", "introducesNewFact"]
      },
      "description": "3–5 itens; ao menos um com fórmula diferente da principal."
    },
    "sourcesUsed": { "type": "array", "items": { "$ref": "#/$defs/SourceRef" } },
    "factRefs": { "type": "array", "items": { "$ref": "#/$defs/FactRef" }, "description": "Todo número, entidade, data, experiência e opinião do body." },
    "slots": { "type": "array", "items": { "type": "string" }, "description": "Marcadores {{...}} deixados no texto por falta de dado." },
    "openQuestionsForAuthor": { "type": "array", "items": { "type": "string" } },
    "firstCommentSuggestion": { "type": ["string", "null"], "description": "Texto sugerido para o 1º comentário (ex.: link da fonte). Publicação é passo separado e aprovado." },
    "humanization": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "promptId": { "type": "string" },
        "paragraphDensity": { "type": "array", "items": { "type": "integer" }, "description": "Marcadores por parágrafo após a revisão." },
        "actions": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "pass": { "type": "string", "enum": ["scrub", "rhythm", "add", "self-check"] },
              "ruleId": { "type": "string" },
              "before": { "type": "string" },
              "after": { "type": "string" },
              "reason": { "type": "string" }
            },
            "required": ["pass", "ruleId", "before", "after", "reason"]
          }
        },
        "voiceConflicts": { "type": "array", "items": { "type": "string" }, "description": "Termos em vocabularyUsed que colidiram com a lista; não alterados." },
        "overCorrectionGuardTriggered": { "type": "boolean" },
        "factsChanged": { "type": "boolean", "description": "Deve ser false; true reverte a etapa." }
      },
      "required": ["promptId", "paragraphDensity", "actions", "voiceConflicts", "overCorrectionGuardTriggered", "factsChanged"]
    },
    "injectionSuspected": { "type": "boolean" },
    "injectionEvidence": { "type": ["string", "null"] }
  },
  "required": [
    "schemaVersion", "opportunityId", "briefVersion", "language", "formula", "hook", "body", "charCount",
    "hashtags", "alternativeHooks", "sourcesUsed", "factRefs", "slots", "openQuestionsForAuthor",
    "firstCommentSuggestion", "humanization", "injectionSuspected", "injectionEvidence"
  ]
}
```

Validações em código (Zod): `charCount == body.length` (recalculado); `body.length <= 3000`;
`hook == primeiros 210 caracteres do body` (normalizado); `hashtags.length <= 2`;
`alternativeHooks` entre 3 e 5, nenhum com `introducesNewFact = true`; `factRefs` sem
`unsupported` para aprovação automática; `slots` vazio para publicar.

---

## 5. Sugestão de mídia (`MediaSuggestion`)

Renderização local (Satori/Resvg/Sharp) pelo worker; nunca geração de imagem por IA no MVP.
Prompt: `media@v1`.

```json
{
  "$id": "linkedin-ops/editorial/MediaSuggestion/1.0",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "type": "string", "enum": ["1.0"] },
    "type": { "type": "string", "enum": ["none", "code-card", "quote-card", "carousel", "author-image"] },
    "rationale": { "type": "string", "description": "Por que esta mídia (ou nenhuma)." },
    "altText": { "type": ["string", "null"], "description": "Obrigatório quando type != none. Descrição acessível, até 300 caracteres." },
    "codeCard": {
      "type": ["object", "null"],
      "additionalProperties": false,
      "properties": {
        "language": { "type": "string", "description": "Linguagem do snippet (ex.: typescript)." },
        "title": { "type": "string" },
        "code": { "type": "string", "description": "Só código que está no post, na fonte ou fornecido por Rodrigo; até 25 linhas." },
        "caption": { "type": ["string", "null"] },
        "sourceRef": { "type": ["string", "null"], "description": "De onde veio o código (sourceId/storyBankItemId/authorInputId)." }
      },
      "required": ["language", "title", "code", "caption", "sourceRef"]
    },
    "quoteCard": {
      "type": ["object", "null"],
      "additionalProperties": false,
      "properties": {
        "text": { "type": "string", "description": "Linha do próprio post, até 200 caracteres." },
        "attribution": { "type": "string", "description": "Nome/handle de Rodrigo (dos renderTokens)." }
      },
      "required": ["text", "attribution"]
    },
    "carousel": {
      "type": ["object", "null"],
      "additionalProperties": false,
      "properties": {
        "slides": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "title": { "type": "string", "description": "Até 8 palavras." },
              "body": { "type": "string", "description": "Até 12 palavras." }
            },
            "required": ["title", "body"]
          },
          "description": "6–9 slides; conteúdo só do post."
        }
      },
      "required": ["slides"]
    },
    "authorImageRequest": { "type": ["string", "null"], "description": "Pedido a Rodrigo de foto/print real, quando a mídia certa não pode ser gerada (ex.: 'print do dashboard de latência')." }
  },
  "required": ["schemaVersion", "type", "rationale", "altText", "codeCard", "quoteCard", "carousel", "authorImageRequest"]
}
```

Validação: exatamente o sub-objeto do `type` preenchido, os demais `null`; `altText` não nulo
se `type != none`; `codeCard.code` deve aparecer (normalizado) no post, na fonte ou na entrada
manual.

---

## 6. Avaliação de qualidade (`QualityEvaluation`)

Etapa 8. O prompt recebe o resultado do lint determinístico (densidade, pontes, travessões,
tríades, emoji, repetição) e dos relatórios anteriores; o modelo pontua e justifica com
trechos. Prompt: `quality@v1`.

```json
{
  "$id": "linkedin-ops/editorial/QualityEvaluation/1.0",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "type": "string", "enum": ["1.0"] },
    "draftVersionId": { "type": "string" },
    "language": { "type": "string", "enum": ["pt-BR", "en"] },
    "verdict": { "type": "string", "enum": ["pass", "warn", "fail"] },
    "scores": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "factualFidelity": { "type": "integer", "description": "1–5" },
        "noInventedExperience": { "type": "integer" },
        "naturalness": { "type": "integer" },
        "voiceMatch": { "type": "integer" },
        "specificity": { "type": "integer" },
        "structureAndHook": { "type": "integer" },
        "editorialSafety": { "type": "integer" },
        "repetition": { "type": "integer" }
      },
      "required": ["factualFidelity", "noInventedExperience", "naturalness", "voiceMatch", "specificity", "structureAndHook", "editorialSafety", "repetition"]
    },
    "blockers": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "ruleId": { "type": "string" },
          "evidenceLabel": { "$ref": "#/$defs/EvidenceLabel" },
          "excerpt": { "type": "string" },
          "message": { "type": "string", "description": "PT-BR, para o card." },
          "suggestedFix": { "type": ["string", "null"] }
        },
        "required": ["ruleId", "evidenceLabel", "excerpt", "message", "suggestedFix"]
      }
    },
    "warnings": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "ruleId": { "type": "string" },
          "evidenceLabel": { "$ref": "#/$defs/EvidenceLabel" },
          "excerpt": { "type": "string" },
          "message": { "type": "string" },
          "suggestedFix": { "type": ["string", "null"] }
        },
        "required": ["ruleId", "evidenceLabel", "excerpt", "message", "suggestedFix"]
      }
    },
    "fabricationSuspects": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "excerpt": { "type": "string" },
          "reason": { "type": "string" }
        },
        "required": ["excerpt", "reason"]
      },
      "description": "Afirmações sem ref ou com ref que não sustenta o texto."
    },
    "clicheHits": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "excerpt": { "type": "string" },
          "category": { "type": "string", "enum": ["vocabulary", "grammar", "reveal-bridge", "sincerity", "opener", "closer", "rhythm", "emoji", "triad", "em-dash"] },
          "paragraphIndex": { "type": "integer" }
        },
        "required": ["excerpt", "category", "paragraphIndex"]
      }
    },
    "readsAs": { "type": "string", "enum": ["human", "mixed", "ai"], "description": "Estimativa de leitura humana; não é score de detector." },
    "injectionSuspected": { "type": "boolean" },
    "injectionEvidence": { "type": ["string", "null"] },
    "summaryForCard": { "type": "string", "description": "2 frases em PT-BR para o Estúdio." }
  },
  "required": [
    "schemaVersion", "draftVersionId", "language", "verdict", "scores", "blockers", "warnings",
    "fabricationSuspects", "clicheHits", "readsAs", "injectionSuspected", "injectionEvidence", "summaryForCard"
  ]
}
```

Regra de veredito em código (prevalece sobre o modelo): qualquer `blocker` → `fail`;
`fabricationSuspects` não vazio → `fail`; `warnings.length >= 3` → `warn`; senão `pass`.
Blockers possíveis: `fact.unsupported`, `experience.invented`, `safety.off-limits`,
`safety.naming`, `safety.injection`, `structure.link-in-body`, `structure.all-caps-hook`,
`structure.over-3000`, `cliche.reveal-bridge-in-hook`, `cliche.sincerity-announcement`,
`cliche.closer`.

---

## 7. Extração de Voice Profile (`VoiceProfileExtraction`)

Entrada: 3–6 amostras reais coladas por Rodrigo. Saída: proposta de campos do perfil, aprovada
na UI antes de salvar. Prompt: `voice-extract@v1`.

```json
{
  "$id": "linkedin-ops/editorial/VoiceProfileExtraction/1.0",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "type": "string", "enum": ["1.0"] },
    "sampleCount": { "type": "integer" },
    "rhythm": { "type": "string" },
    "openers": { "type": "array", "items": { "type": "string" } },
    "closers": { "type": "array", "items": { "type": "string" } },
    "punctuation": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "emDash": { "type": "string", "enum": ["never", "rare", "normal"] },
        "ellipsis": { "type": "string", "enum": ["never", "rare", "normal"] },
        "colon": { "type": "string", "enum": ["never", "rare", "normal"] },
        "parentheses": { "type": "string", "enum": ["never", "rare", "normal"] }
      },
      "required": ["emDash", "ellipsis", "colon", "parentheses"]
    },
    "casing": { "type": "string", "enum": ["standard", "lowercase-starts"] },
    "vocabularyUsed": { "type": "array", "items": { "type": "string" } },
    "emojiPolicy": { "type": "string", "enum": ["none", "rare", "normal"] },
    "formatting": { "type": "string" },
    "signatureSamples": { "type": "array", "items": { "type": "string" }, "description": "2–4 trechos literais das amostras." },
    "confidence": { "type": "number", "description": "0–1; com 3 amostras, máximo 0.6." },
    "notesForAuthor": { "type": "array", "items": { "type": "string" }, "description": "O que as amostras não mostram e a entrevista precisa cobrir." }
  },
  "required": ["schemaVersion", "sampleCount", "rhythm", "openers", "closers", "punctuation", "casing", "vocabularyUsed", "emojiPolicy", "formatting", "signatureSamples", "confidence", "notesForAuthor"]
}
```

Validação: cada `signatureSamples[i]` precisa ser substring literal de uma amostra (nada
inventado).

---

## 8. Esboços para fases posteriores

### 8.1 Comentário assistido (`CommentDraft`, EPIC-08)

Entrada: URL + texto do post colado por Rodrigo (dado não confiável) + Voice Profile + Story
Bank. Saída: `variants[1..3]` com `{ text (200–350), pattern (C1..C7), rationale, factRefs,
introducesNewFact: false }`, `suggestedReaction` (enum da API oficial, sugestão), `skipReason`
(null ou `sponsored | generic-listicle | off-limits | injection-suspected`),
`injectionSuspected`, `injectionEvidence`. Mesmas regras de refs e proibições.

### 8.2 Sugestão de perfil (`ProfileSuggestion`, EPIC-09)

Entrada: seções coladas (headline, sobre, experiências, skills). Saída por seção:
`{ section, status: ok | needs-work | missing, issues[], before, after, factRefs }`;
`after` só usa fatos do Story Bank; nenhuma métrica de "uplift"; aplicação sempre manual.

### 8.3 Verificação factual (`FactCheckReport`, etapa 5)

Saída: `claims[]` = `FactRef` com `status` e `note`; `unsupportedCount`; `changedValues[]`
(número do texto ≠ número do ref); `verdict: supported | needs-author | unsupported`. A parte
determinística (extração de números/entidades e cruzamento) roda antes e o modelo só resolve
paráfrases.

---

## 9. Checklist de integração (para o Pêndulo)

- Usar `strict: true` e o JSON Schema gerado pelo Zod; nunca editar o JSON à mão.
- Em falha de parse/validação: 1 retry com a mensagem de erro no prompt; depois `FAILED` com
  motivo gravado; nunca aceitar texto fora do schema.
- Conteúdo externo sempre em bloco delimitado como dado; system prompt sem conteúdo externo.
- Gravar `promptId`, `schemaVersion`, `model`, `inputHash` e `outputHash` em cada chamada
  (auditoria e evals offline).
- Nenhum segredo, token ou dado de outro usuário no prompt.
- Idempotência: a mesma `draftVersionId` + `promptId` não dispara nova chamada em retry do job.
