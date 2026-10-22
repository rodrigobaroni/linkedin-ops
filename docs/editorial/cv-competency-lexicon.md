# Léxico de competências do CV (`cv-competency-lexicon@1.0.0`)

- Implementação: `packages/editorial-engine/src/career/lint/cv-competency-lexicon.v1.0.0.ts` (módulo tipado;
  `JSON.stringify(CV_COMPETENCY_LEXICON)` é a forma JSON da lista) e a guarda de entidades em
  `packages/editorial-engine/src/career/entities.ts`.
- Decisão: Maestro, 2026-10-22 (PR #89, achados da Sentinela e do Crivo). Critérios e cobertura: pré-revisão da
  Pena (`cv-competency-lexicon-review`, critérios C1–C7, §3 e §4). Seed: Pêndulo; revisão item a item: Pena.
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
`any-case` para nomes distintivos, rejeitados mesmo em minúscula (`nubank`, `itaú`, `magazine luiza`), e
`capitalized` para nomes que também são palavras comuns (`Via`, `Rede`, `Meta`, `Spring`), rejeitados só quando
escritos como nome. Termos da lista que aparecem num requisito, em qualquer grafia, também passam a contar como
nomes usados pela vaga.

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
  `foundation`, `practitioner`, `agilist` ou `belt` é rejeitado como credencial;
- formas curtas ambíguas (`Next`, `Neon`, `Delta`, `Stone`, `Rede`, `Spring`, `Express`): só a forma qualificada
  (`Next.js`, `Neon Postgres`, `Delta Lake`, `Spring Boot`, `Express.js`) (C2, C5).

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

## 5. Histórico

| Data | Versão | Mudança |
|---|---|---|
| 2026-10-22 | 1.0.0 | Seed a partir da pré-revisão da Pena (C1–C7, cobertura §3, `denyTerms` §4); `denyTerms` aplicada em tempo de execução com modos `any-case` e `capitalized` (Sentinela, PR #89). |
