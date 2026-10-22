# Exceção editorial D4: conteúdo plausível no CV adaptado

- Origem: decisão D4 de Rodrigo em 2026-10-22, spec
  `docs/superpowers/specs/2026-10-22-cv-tailoring-design.md` (§2, §5 passos 4–6, §8).
- Mantido por: Pena. Versão: 1.1.0. Data: 2026-10-22.
- Rótulo de evidência: `policy`.

## 1. A regra geral continua valendo

O sistema editorial do LinkedIn Ops proíbe inventar histórias, números, experiências ou opiniões
para Rodrigo (`editorial-system.md` §1, §4.4 e §10). Esta exceção **não revoga** essa regra. Ela
abre uma janela estreita, autorizada por Rodrigo, num único módulo.

## 2. Escopo da exceção

| Vale para | Não vale para |
|---|---|
| A etapa `cv.tailor` do módulo **Carreira**, ao gerar o CV adaptado a uma vaga | Posts, rascunhos, brief, hooks alternativos, comentários, respostas, curadoria |
| | Story Bank e Voice Profile (nunca recebem conteúdo `acrescentado`) |
| | `cv.extract` (extração do CV base é fiel ao PDF; nada é acrescentado) |
| | `job.extract` (extração da vaga é fiel à página) |
| | `cv.humanize` (só estilo; não acrescenta nada) |
| | Otimização do perfil do LinkedIn (parte A da spec), que é conteúdo público no LinkedIn: exige decisão própria de Rodrigo na spec da parte A |
| | Carta de apresentação ou qualquer outro texto futuro, salvo nova decisão registrada aqui |

Qualquer ampliação deste escopo exige decisão explícita de Rodrigo, registrada neste documento
com data, e bump de versão.

## 3. O que pode ser acrescentado

Rodrigo autorizou a IA a **preencher lacunas com conteúdo plausível** para aproximar o CV da vaga,
assumindo o risco. Interpretação adotada:

- **Pode**: reformular e expandir responsabilidades de uma experiência que já existe no CV base;
  explicitar uma competência coerente com o que a experiência descreve; acrescentar bullet que
  aproxime uma experiência existente de um requisito da vaga; acrescentar competência técnica ou
  comportamental à lista de competências.
- **Limites duros** (propostos por Pena, **confirmados por Rodrigo em 2026-10-22**, §9; mantêm o CV
  defensável em entrevista e em checagem de referências):
  1. Nunca criar empregador, cargo, período, formação, diploma, instituição, certificação, licença
     profissional, idioma com nível declarado, prêmio, publicação ou referência pessoal que não
     estejam no CV base.
  2. Nunca alterar datas, cargos, nomes de empresas ou de instituições do CV base.
  3. Nunca acrescentar número (percentual, valor, tamanho de equipe, volume) que não esteja no CV
     base. Um bullet acrescentado é qualitativo ("Conduzi a revisão de custos de nuvem do time")
     e não quantitativo ("Reduzi custos de nuvem em 32%").
  4. Nunca atribuir a Rodrigo opinião, cliente nomeado ou caso específico inexistente.
- Os limites são regra fixa do código (`packages/editorial-engine`), não configuração: afrouxá-los exige nova
  decisão de Rodrigo registrada aqui, novo prompt (`cv-tailor@1.1.0`) e mudança de código com teste.

## 4. Proveniência obrigatória

Todo trecho do CV adaptado carrega exatamente uma marcação:

| Marcação | Significado |
|---|---|
| `original` | Texto do CV base, sem alteração de conteúdo (pode ter sido reordenado) |
| `reescrito` | Mesmo conteúdo do CV base com outra redação, outra língua ou outra ênfase; cita o(s) trecho(s) de origem |
| `acrescentado` | Conteúdo que não está no CV base, gerado pela exceção D4; cita o requisito da vaga que motivou o acréscimo |

Regras:

1. A marcação é atribuída na geração (`cv.tailor`) e conferida em código: um trecho `original` ou
   `reescrito` precisa apontar para itens existentes do CV base; um `acrescentado` precisa apontar
   para requisito existente da vaga. Trecho sem marcação válida = saída inválida (até 2 novas
   tentativas, spec §9).
2. O `cv.humanize` nunca rebaixa `acrescentado` para outra marcação; se alterar um `original`, o
   código o promove a `reescrito`.
3. A marcação aparece **só na revisão** dentro do painel; **nunca no PDF** e nunca em metadados do
   PDF (spec §8).
4. Tradução para a língua da vaga conta como `reescrito`, nunca como `original`.

## 5. Transparência para Rodrigo

- O relatório de aderência lista **todos** os trechos `acrescentado`, agrupados por experiência,
  com o requisito que motivou cada um, para Rodrigo revisar e se preparar para a entrevista
  (spec §5 passo 6).
- A **nota de aderência** é calculada sobre o **CV base, antes de qualquer acréscimo**. O conteúdo
  `acrescentado` nunca melhora a nota. A UI deixa isso explícito ("aderência do seu CV atual a
  esta vaga").
- Texto de UI recomendado na tela da vaga: "Este CV contém N trechos acrescentados pela IA para
  aproximar o seu perfil da vaga. Revise antes de enviar: você responde por tudo o que estiver
  nele."

## 6. Isolamento do resto do sistema editorial

- O conteúdo `acrescentado` é dado do módulo Carreira: não alimenta Story Bank, Voice Profile,
  curadoria, posts, nem a futura otimização de perfil.
- No `packages/editorial-engine`, os prompts e regras do módulo vivem em `src/career/` e
  `src/prompts/cv-*/`, `src/prompts/job-*/`. Nenhum prompt de post importa de `src/career/`, e o
  prompt `cv-tailor` não importa regras de post que mencionem a exceção. Sugestão de verificação
  em CI: regra de import (ESLint `no-restricted-imports`) entre `src/career/**` e o restante.
- A verificação factual de posts (`factcheck@v1`) e a regra anti-fabricação (`editorial-system.md`
  §10) não aceitam esta exceção como justificativa em nenhum caso.

## 7. Riscos assumidos por Rodrigo (registro)

- Afirmação não verdadeira no CV pode ser questionada em entrevista ou checagem; pode ter
  consequências contratuais ou de reputação. Mitigações: limites duros do §3, marcação obrigatória
  e lista no relatório.
- O produto não envia candidaturas: o PDF é baixado e enviado por Rodrigo, que decide o que usa.

## 8. Língua do CV adaptado

O CV adaptado sai na língua da vaga quando ela é PT-BR ou inglês. Vaga em qualquer outra língua gera o CV
**em inglês**, com o aviso `language_fallback` no relatório ("vaga em {língua}; CV gerado em inglês"). As listas
do verificador (`humanizer-cv-rules.md` §4) só existem para PT-BR e inglês. Decisão de Rodrigo, §9.

## 9. Decisões de Rodrigo (2026-10-22)

| # | Decisão | Efeito |
|---|---|---|
| 1 | Limites duros da D4 **ativos**: a IA nunca acrescenta empregador, cargo, data ou período, formação, instituição, certificação nem número (§3). | Regra fixa no `cv-tailor@1.0.0` (item 9) e no pós-processamento do motor: segmento `acrescentado` com número ausente do CV base invalida a saída (até 2 novas tentativas, depois `falhou` com motivo `ai`); empregador, cargo, datas, formação, certificações e idiomas não são gerados pelo modelo, são copiados do CV base por id. |
| 2 | Vaga em língua diferente de PT-BR e inglês: gerar o CV **em inglês** com aviso no relatório (§8). | `targetLanguage = en` e aviso `language_fallback` no relatório de aderência. |

Implementação dos limites 1, 2 e 4 em código: guarda de entidades com léxico fechado de competências
([`cv-competency-lexicon.md`](./cv-competency-lexicon.md), decisão do Maestro em 2026-10-22).

## 10. Histórico

| Data | Versão | Mudança |
|---|---|---|
| 2026-10-21 | 1.0.0 | Texto inicial a partir da D4 (decisão de Rodrigo de 2026-10-22 na spec). Limites duros do §3 propostos por Pena, pendentes de confirmação. |
| 2026-10-22 | 1.1.0 | Rodrigo confirma os limites duros do §3 e decide o CV em inglês para vagas em outras línguas (§8, §9). |
