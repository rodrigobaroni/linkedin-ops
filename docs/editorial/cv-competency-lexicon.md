# Léxico de competências do CV (`cv-competency-lexicon@1.0.1`)

- Implementação: `packages/editorial-engine/src/career/lint/cv-competency-lexicon.v1.0.1.ts` (módulo tipado;
  `JSON.stringify(CV_COMPETENCY_LEXICON)` é a forma JSON da lista) e a guarda de entidades em
  `packages/editorial-engine/src/career/entities.ts`.
- Decisão: Maestro, 2026-10-22 (PR #89, achados da Sentinela e do Crivo). Critérios e cobertura: pré-revisão da
  Pena (`cv-competency-lexicon-review`, critérios C1–C7, §3 e §4). Seed: Pêndulo; revisão item a item: Pena
  (`cv-competency-lexicon-review` §6, aplicada na 1.0.1).
- Relacionados: [`career-editorial-exception.md`](./career-editorial-exception.md) §3 e §9 (limites duros da D4),
  [`career-prompts.md`](./career-prompts.md) §3 item 9.

## 1. Regra

Num trecho `acrescentado` ou `reescrito` do CV adaptado, um nome (palavra com maiúscula, sigla, token misto como
`K8s` ou `C#`, nome de mês) **só passa** se:

1. já estiver no **CV base**; ou
2. estiver no **léxico** **e** aparecer num **requisito citado** pelo trecho (`targetRequirementIds`).

Qualquer outro nome próprio é rejeitado: empregador, cliente, projeto, produto, pessoa, instituição,
certificação. O requisito citado não libera vocabulário por si só; ele só confirma que a vaga pede aquela
competência. Nomes que a própria vaga usa (a empresa, um cliente citado num requisito) são rejeitados em qualquer
grafia, inclusive minúscula (`nubank`). Comparações ignoram caixa e acento; termos de várias palavras casam como
frase (`Google Cloud` passa, `Google` sozinho não).

Os dígitos de um termo aceito do léxico (`ISO 27001`, `OAuth 2.0`, `GA4`) não contam como "número acrescentado".

A `denyTerms` também vale **em tempo de execução**: cada trecho é comparado com a lista por frase, sem caixa e
sem acento, e um termo encontrado é rejeitado (salvo se já estiver no CV base). Cada grupo declara como casa:
`any-case` para nomes distintivos, rejeitados mesmo em minúscula (`nubank`, `itaú`, `magazine luiza`);
`capitalized` para nomes que também são palavras comuns (`Via`, `Rede`, `Meta`, `Shell`, `Visa`, `XP`), rejeitados
só quando escritos como nome; e `lexicon-only` para formas curtas que não são clientes (`Spring`, `Linear`,
`Make`, `Temporal`), que **não** valem em tempo de execução: servem só para o teste de interseção as manter fora
do léxico, e a lista fechada já as rejeita quando aparecem como nome (não estão no léxico nem no CV base). Na abertura da frase, só ficam isentos nas construções fechadas e de alta confiança de uma
tabela **por termo** (`COMMON_OPENING_CONSTRUCTIONS`, testada): `Meta` e `Rede` seguidos de `de`, `da` ou `do`
("Meta de latência…", "Rede de pipelines…") e `Via` seguido de artigo ou de termo do léxico ("Via a API…",
"Via Python…"). Qualquer outra combinação falha fechado: "Meta em 2023…", "Delta para clientes…" e "Rede para
varejo…" reprovam, porque afirmariam um empregador inexistente; a regeneração é o custo aceito. `Delta` não tem
isenção de abertura ("Delta of the…" foi removido por não ser de alta confiança); `Delta Lake` passa como termo
citado do léxico.
Termos da lista citados pela vaga (num requisito), em qualquer grafia e em qualquer grupo, contam como nomes
usados pela vaga e são rejeitados na saída em qualquer grafia e posição (`rede` citado em minúscula pela vaga
reprova `rede` na saída). Efeito colateral aceito: se a vaga usa a palavra comum no sentido comum ("rede de
distribuição"), a mesma palavra na saída custa uma regeneração.

Precedência: uma ocorrência da `denyTerms` inteiramente contida na **mesma** ocorrência de um termo de várias
palavras do léxico que seja permitido naquele trecho (no CV base ou num requisito citado) vale como o produto, não
como a empresa: `Google Cloud`, `Amazon S3`, `Oracle Database`, `SAP HANA` e `OpenAI API` passam; `Google`,
`Amazon` ou `Oracle` sozinhos, e credenciais como `AWS Certified …`, continuam rejeitados.

## 2. O que entra e o que nunca entra

Entra: tecnologia, linguagem, framework, banco de dados, plataforma, ferramenta, protocolo, padrão técnico ou
metodologia (critério C1), com `category`, `areas` (dados, engenharia, produto, transversal) e as grafias reais
das vagas como `aliases` (C6, C7).

Nunca entra, nem como alias (`denyTerms`, com teste de interseção vazia):

- empresas clientes comuns no Brasil (bancos, varejistas, telecom, indústria, consultorias), big techs como
  empresa (`Google`, `Amazon`, `Oracle`, `SAP` sozinhos; a forma de produto entra: `Google Cloud`,
  `Oracle Database`, `SAP HANA`) e órgãos públicos ou universidades (C1, C4);
- certificações e credenciais (`PMP`, `CKA`, `AWS Certified …`, `ITIL Foundation`; limite duro 1, C3). Um
  padrão entra como conhecimento (`ISO 27001`, `ITIL`), mas seguido de `certified`, `certificação`,
  `foundation`, `practitioner`, `agilist`, `belt`, `associate`, `specialty` ou `fundamentals` é rejeitado como
  credencial, assim como códigos de prova (`AZ-900`, `DP-203`, `SAA-C03`), `expert` logo depois de um termo do
  léxico (`Kubernetes Expert`) e `Professional` logo antes de um termo do léxico ou de `Data Engineer`,
  `Cloud Architect` ou `Machine Learning Engineer` (`expert` e `professional` sozinhos são palavras comuns).
  A regra vale para **todo** trecho que difere da fonte, não só o `acrescentado` (Sentinela, PR #91): um trecho
  `reescrito` ou um `original` alterado só pode manter (ou encurtar) a frase de credencial que já está nos itens
  do CV base que ele cita, e só encurta preservando um marcador inequívoco (`Certified`, `Associate`,
  `Professional`, `Specialty`, código de prova…): "AWS Certified Solutions Architect" → "AWS Certified" passa;
  nunca acrescenta ou estende uma ("Trabalhei com Kafka" → "Trabalhei com Kafka associate" reprova); o
  humanizador que acrescenta uma credencial tem o trecho revertido. Uma credencial também nunca vira **cargo**
  (Sentinela S-1): as palavras de uma credencial do CV base até um substantivo de cargo ("Solutions Architect",
  "Data Engineer", "Kubernetes Administrator") reprovam em qualquer trecho, salvo dentro da própria credencial
  com marcador (e não precedida de introdutor de função como "Atuei como", "No papel de" ou "Worked as")
  ou quando o CV base já tem esse cargo como título de experiência; o substantivo de cargo sozinho
  só reprova com maiúscula ("Architect", nunca "backend engineer"). O humanizador recebe o CV base e
  segue as mesmas regras: o trecho que ganha credencial ou cargo vindo de credencial é revertido;
- formas curtas ambíguas (`Next`, `Neon`, `Delta`, `Stone`, `Rede`, `Spring`, `Express`, `Kong`, `XP`, `LeSS`):
  só a forma qualificada (`Next.js`, `Neon Postgres`, `Delta Lake`, `Spring Boot`, `Express.js`,
  `Kong Gateway`, `Extreme Programming`, `Large-Scale Scrum`) (C2, C5).

Exceções registradas: `VTEX` (marca e plataforma ao mesmo tempo, como `Salesforce`) entra porque é o produto que
as vagas de varejo citam e a guarda exige requisito citado. `Swift` fica: `SWIFT` (a rede bancária) dobra para o
mesmo token, mas não é cliente nem empregador nomeável num bullet, e o requisito precisa citá-lo.

## 3. Custo de um termo legítimo fora do léxico

A lista é fechada de propósito. Um termo técnico legítimo que ainda não esteja no léxico faz a guarda rejeitar o
trecho: isso custa **uma regeneração** do `cv.tailor` (até 2 por vaga; depois a vaga falha com motivo `ai`). A
correção é **acrescentar o termo ao léxico**: nova versão (`cv-competency-lexicon@1.0.1`), entrada com
`category`, `areas` e aliases, testes verdes (interseção com `denyTerms` vazia) e revisão da Pena.

O mesmo vale para a primeira palavra de uma frase: ela só é isenta quando está na lista fechada de verbos e
palavras de abertura da guarda (PT e EN) ou aparece em minúscula no CV base ou na vaga. Um verbo de abertura
ausente da lista também custa uma regeneração e se resolve acrescentando-o à lista.

## 4. Resíduo conhecido

Um nome **inventado**, escrito **todo em minúscula**, que **não está na `denyTerms`** e que a vaga não usa (por
exemplo, um cliente fictício `acmebank` em minúscula) não é detectável de forma determinística: para o
verificador, ele é indistinguível de uma palavra comum. A mitigação é a proveniência obrigatória: todo trecho
`acrescentado` aparece marcado na revisão do painel e listado no relatório de aderência, com a nota do que foi
acrescentado e por quê, e Rodrigo revisa antes de baixar o PDF (`career-editorial-exception.md` §4 e §5).
Quando um nome assim for observado, ele entra na `denyTerms` (nova versão).

O mesmo vale para um cliente com nome de palavra comum (grupo `capitalized`) escrito em minúscula no meio da frase
("pagamentos via visa"): a `denyTerms` não o pega e o caminho geral não pega minúsculas.

Na abertura da frase, os nomes `capitalized` acrescentados na 1.0.1 (`Folha`, `Dia`, `Record`, `Shell`…) não
ganharam construção na tabela fechada `COMMON_OPENING_CONSTRUCTIONS`: "Folha de pagamento automatizada…" ou "Dia
a dia…" reprova e custa uma regeneração. É falha fechada por decisão (Maestro, 2026-10-22); uma construção nova
só entra na tabela com revisão da Sentinela.

Uma forma curta `lexicon-only` que abre a frase como palavra comum ("Linear regression models…") só passa se a
palavra aparecer em minúscula no CV base ou na vaga; senão reprova (a lista de palavras de abertura continua
fechada a verbos e palavras gramaticais).

Uma frase mais longa do léxico vence a mais curta: com a vaga citando só `Kafka`, "Kafka Connect" reprova, porque
é outra entrada (`Kafka Connect`) que o requisito não cita. O mesmo vale para `Azure Databricks`, `Spark MLlib` e
`Cloud SQL`.

## 5. Histórico

| Data | Versão | Mudança |
|---|---|---|
| 2026-10-22 | 1.0.0 | Seed a partir da pré-revisão da Pena (C1–C7, cobertura §3, `denyTerms` §4); `denyTerms` aplicada em tempo de execução com modos `any-case` e `capitalized` (Sentinela, PR #89). |
| 2026-10-22 | 1.0.1 | Revisão item a item da Pena (§6). §6.1: `Bash` troca o alias `Shell` por `Shell Script` e `shell scripting` (`Shell` vai para `denyTerms`); `Power Query` perde o alias `M`; sai `Amazon Inc` (redundante); `Swift` fica, com nota. §6.2: `denyTerms` passa de 197 para 409 termos (bancos, seguradoras, varejo, indústria, consultorias, big techs, órgãos, universidades, plataformas de curso, credenciais). §6.3: 198 entradas novas, 339 → 537 (cloud, dados, ML/IA, engenharia, produto, padrões e regulação) e `Open Banking` como alias de `Open Finance`. §6.4: credenciais `associate`, `specialty`, `fundamentals`, códigos de prova e `expert`/`Professional` junto de termo do léxico. §6.6 R4: modo novo `lexicon-only` (o grupo `ambiguous-short-forms` passa a ele, com `LeSS`, `Temporal`, `Make`, `Monday`, `X`…); nomes de palavra comum (`Shell`, `Visa`, `Dia`, `Folha`, `XP`, `SUS`…) em `common-word-names` (`capitalized`); grupo novo `credentials-common-words` (`any-case`, Sentinela PR #91: `solutions architect` em minúscula também é credencial ou cargo; `Solutions Architect`, `Professional Data Engineer`). Check de credencial em todo trecho diferente da fonte (`reescrito`, `original` alterado e humanizador), não só no `acrescentado`. Decisões restritivas (D4): `Kong Gateway` sem o alias `Kong`; `Boa Vista` e `Conta Azul` em `capitalized` (palavras comuns); plurais `SLAs`, `SLOs`, `SLIs` e `ADRs` como aliases. A versão do léxico passa a constar em `promptVersions` do resultado do `cv.tailor` (ADR-0005 §3). Prompts inalterados. |
