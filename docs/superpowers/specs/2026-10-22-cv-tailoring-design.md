# Design: CV adaptado por vaga (módulo Carreira)

- Data: 2026-10-22
- Status: aprovado pelo Rodrigo em conversa (brainstorm), pendente de revisão desta spec
- Escopo deste ciclo: partes **B** (CV × uma vaga) e **C** (lote de vagas). A parte **A** (otimização do perfil do
  LinkedIn) terá ciclo próprio de spec, plano e implementação.

## 1. Objetivo

Rodrigo envia o próprio CV em PDF uma vez e, depois, de 1 a 20 links de vagas por vez. Para cada vaga o painel
devolve um **CV adaptado em PDF** e um **relatório de aderência**, processados em segundo plano.

## 2. Decisões do Rodrigo (2026-10-22)

| #   | Decisão                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Ordem: CV e vagas primeiro (B, depois C); perfil (A) depois.                                                                                                                                       |
| D2  | Remover a regra que proíbe acessar o LinkedIn e buscar vagas: o painel lê páginas de vagas, inclusive do LinkedIn. Risco à conta pessoal e ao app de publicação **aceito**. Registrar em ADR-0008. |
| D3  | Entrada do CV em **PDF**; saída em **PDF** com layout padrão gerado pelo painel.                                                                                                                   |
| D4  | A IA pode **preencher lacunas com conteúdo plausível** (risco autorizado). Exceção editorial válida **só para o módulo de CV**, nunca para posts.                                                  |
| D5  | Por vaga: PDF + **relatório de aderência**. Sem carta de apresentação neste ciclo.                                                                                                                 |
| D6  | O texto do CV passa pela skill `linkedin-humanizer` (sem marcas de texto de IA); o PDF sai com metadados neutros.                                                                                  |
| D7  | Lote de **5 a 20 links**, processamento em segundo plano; Rodrigo volta depois para ver.                                                                                                           |
| D8  | Leitura das vagas pela **abordagem A**: busca anônima pelo servidor, sem a sessão do Rodrigo; colagem de texto como alternativa.                                                                   |

## 3. Experiência (web)

Novo grupo **Carreira** no menu lateral, com duas telas:

- **Meu CV**: upload do PDF; o painel extrai o conteúdo em seções (contato, resumo, experiências, formação,
  competências, idiomas); Rodrigo revisa, corrige e confirma. Esse passa a ser o **CV base** (um ativo por vez; um
  upload novo cria uma nova versão e desativa a anterior). Ações: substituir, apagar.
- **Vagas**: campo para colar de 1 a 20 links (um por linha) e enviar. Lista com cada vaga e status:
  `buscando` → `analisando` → `pronto`, ou `falhou` com motivo; vaga que não abriu oferece **colar o texto** e
  reprocessar. Ao abrir uma vaga pronta: relatório de aderência e botão **Baixar PDF**. Ações: reprocessar,
  apagar.

Sem CV base confirmado, a tela Vagas orienta a enviar o CV primeiro.

## 4. Componentes

| Unidade                         | Local                       | Responsabilidade                                                                                                                                                                               |
| ------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motor de IA (núcleo da T-021)   | `packages/editorial-engine` | Adaptador OpenAI com Structured Outputs validados por Zod; tarefas `cv.extract`, `job.extract`, `cv.tailor`, `cv.humanize`; prompts versionados; conteúdo externo sempre delimitado como dado. |
| Worker e fila (núcleo da T-006) | `apps/worker`               | pg-boss; filas `job.fetch`, `cv.tailor`; concorrência 3; retries com backoff; uma falha não afeta outras vagas.                                                                                |
| Busca de páginas                | `apps/worker` (adapter)     | HTTP(S) anônimo com proteções da seção 8; extração do texto principal da vaga.                                                                                                                 |
| Domínio                         | `packages/domain`           | Entidades, regras e repositórios da seção 6; nada de regra de negócio na API ou no web.                                                                                                        |
| API                             | `apps/api`                  | Endpoints da seção 7, no padrão do T-008 (registry, Problem Details, guard N4).                                                                                                                |
| Renderização de PDF             | `apps/api` (download)       | Gera o PDF a partir do conteúdo estruturado, na hora do download; layout padrão; metadados neutros.                                                                                            |
| Web                             | `apps/web`                  | Telas Meu CV e Vagas (seção 3).                                                                                                                                                                |

## 5. Fluxo

1. **CV base**: upload (PDF ≤ 5 MB) → extração de texto do PDF → `cv.extract` estrutura em seções → Rodrigo
   revisa e confirma. O PDF original **não é armazenado**; só o conteúdo estruturado.
2. **Lote**: o envio cria um `TailoringBatch` e um `JobPosting` por link (links duplicados no mesmo lote são
   unificados) e enfileira `job.fetch` para cada um.
3. **`job.fetch`**: baixa a página, isola o texto da vaga e roda `job.extract` (título, empresa, senioridade,
   requisitos obrigatórios, desejáveis, competências técnicas e comportamentais, idioma). Sucesso → enfileira
   `cv.tailor`. Falha de busca → status `falhou` com motivo `fetch` (colar texto).
4. **`cv.tailor`**: entrada = CV base + requisitos extraídos. Saída estruturada:
   - nota de aderência **calculada sobre o CV base, antes de qualquer acréscimo** (0–100) e requisitos atendidos,
     cada um com o trecho do CV que o cobre;
   - requisitos que faltavam;
   - CV adaptado no **idioma da vaga**: experiências e competências reordenadas por relevância, resumo e bullets
     reescritos com a linguagem da vaga, lacunas preenchidas com conteúdo plausível (D4);
   - **proveniência por trecho**: `original`, `reescrito` ou `acrescentado`.
5. **`cv.humanize`**: aplica as regras adaptadas da `linkedin-humanizer` ao texto do CV; um verificador
   determinístico rejeita frases proibidas (lista versionada) e pede nova geração (no máximo 2).
6. **Pronto**: o relatório lista também tudo o que foi `acrescentado`, para Rodrigo se preparar.
7. **Download**: `GET` gera o PDF na hora; nome `CV-Rodrigo-Baroni-<empresa>-<cargo>.pdf` (normalizado, sem
   acentos nem espaços); metadados `Producer`/`Creator` neutros; texto selecionável.

## 6. Modelo de dados (novo, migration aditiva)

| Tabela              | Campos principais                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cv_bases`          | `id`, `user_id`, `version`, `is_active`, `content` (jsonb validado pelo schema de CV), `confirmed_at`, `created_at`                                                                |
| `tailoring_batches` | `id`, `user_id`, `cv_base_id`, `created_at`                                                                                                                                        |
| `job_postings`      | `id`, `user_id`, `batch_id`, `url`, `url_hash`, `source` (`linkedin` \| `outro` \| `colado`), `status`, `failure_reason`, `raw_text` (truncado), `extracted` (jsonb), `fetched_at` |
| `tailored_cvs`      | `id`, `job_posting_id`, `cv_base_id`, `content` (jsonb com proveniência por trecho), `match_report` (jsonb), `model`, `prompt_version`, `created_at`                               |

Todas com `user_id` (preparo multiusuário) e apagamento em cascata a partir do CV base e do lote.

## 7. API (registry `packages/contracts`)

| Rota                      | Método                     | Descrição                                                            |
| ------------------------- | -------------------------- | -------------------------------------------------------------------- |
| `/career/cv`              | `POST` (multipart; sessão) | Upload do PDF; devolve o rascunho extraído.                          |
| `/career/cv`              | `GET`                      | CV base ativo.                                                       |
| `/career/cv/confirm`      | `POST`                     | Confirma o rascunho revisado (corpo = conteúdo estruturado editado). |
| `/career/cv`              | `DELETE`                   | Apaga CV base e dependentes.                                         |
| `/career/batches`         | `POST`                     | Cria lote com 1–20 URLs.                                             |
| `/career/jobs`            | `GET`                      | Lista paginada de vagas com status.                                  |
| `/career/jobs/{id}`       | `GET`                      | Detalhe: requisitos, relatório, status.                              |
| `/career/jobs/{id}/text`  | `POST`                     | Texto colado para vaga que falhou; reprocessa.                       |
| `/career/jobs/{id}/retry` | `POST`                     | Reprocessa.                                                          |
| `/career/jobs/{id}/pdf`   | `GET`                      | PDF do CV adaptado.                                                  |
| `/career/jobs/{id}`       | `DELETE`                   | Apaga a vaga e o CV adaptado.                                        |

Upload é a única rota que aceita `multipart/form-data` (exceção declarada no registry; o guard N4 continua
exigindo sessão, `Origin` e `X-Requested-With`).

## 8. Segurança e privacidade

- **ADR-0008** registra D2: busca **anônima** de páginas públicas de vagas, inclusive `linkedin.com/jobs/view`;
  nunca com a sessão do Rodrigo nem com as credenciais do app de publicação; risco aceito; mitigações definidas
  pela Sentinela (limite de frequência por domínio, _user agent_ identificável, recuo imediato quando a página
  exigir login ou responder 429/999, sem retentativa agressiva).
- **SSRF**: só `http`/`https`; resolução de DNS validada contra faixas privadas, loopback, link-local e a rede
  Docker da VM, inclusive após cada redirecionamento; no máximo 3 redirecionamentos, 2 MB e 15 s por página.
- **Conteúdo não confiável**: texto de vaga e de CV entra no prompt delimitado como dado; instruções embutidas são
  ignoradas; testes de _prompt injection_ no conjunto da T-058.
- **Dados pessoais**: CV estruturado no Postgres, coberto pelo backup cifrado existente; PDF original descartado
  após a extração; conteúdo do CV nunca em logs, traces ou Problem Details; apagamento sob demanda.
- **Segredos**: `OPENAI_API_KEY` só no `.env` local e no `.env` da VM (0600).
- **Exceção editorial D4** documentada em `docs/editorial`, limitada ao módulo de CV; a marcação de proveniência
  é obrigatória e aparece só na revisão, nunca no PDF.

## 9. Erros

| Situação                                              | Comportamento                                               |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| Página não abre, exige login, 4xx/5xx, tempo esgotado | Vaga `falhou` (`fetch`), oferece colar texto.               |
| Página abre mas não parece vaga                       | `falhou` (`not_a_job`), oferece colar texto.                |
| Saída da IA inválida para o schema                    | Até 2 novas tentativas; depois `falhou` (`ai`).             |
| Verificador do humanizer reprova                      | Até 2 regenerações; depois entrega e sinaliza no relatório. |
| Sem CV base confirmado                                | Envio de lote recusado com orientação.                      |
| Mais de 20 links                                      | Recusado pelo contrato (validação).                         |

## 10. Testes

- Extração de CV e de vaga com documentos fictícios versionados (nenhum dado real do Rodrigo no repositório).
- Pipeline completo com o adaptador de IA simulado (respostas fixas), incluindo proveniência e nota antes dos
  acréscimos.
- Busca: páginas com instruções embutidas, endereços internos, redirecionamento para rede privada, resposta grande,
  tempo esgotado.
- PDF: abre, texto selecionável, metadados neutros, nome do arquivo normalizado.
- Lote com falha no meio não afeta as demais vagas; retry e colagem de texto.

## 11. Entrega

| PR              | Conteúdo                                                                                                                           | Responsáveis              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1. Fundação     | Motor de IA (adaptador OpenAI, Structured Outputs, prompts versionados, humanizer), worker pg-boss, ADR-0008, exceção editorial D4 | Pêndulo, Alicerce, Pena   |
| 2. CV base      | Upload, extração, revisão e confirmação (API e tela Meu CV)                                                                        | Alicerce, Vitral          |
| 3. Vagas e lote | Busca, extração de vaga, adaptação, relatório, PDF, tela Vagas                                                                     | Pêndulo, Alicerce, Vitral |

Cada PR com revisão da Sentinela e do Crivo; Atlas no PR 1 (arquitetura do motor e do worker).

## 12. Fora deste ciclo

Carta de apresentação; edição manual do CV adaptado no painel; otimização do perfil do LinkedIn (parte A);
notificação externa (Telegram) quando o lote termina; múltiplos layouts de PDF.

## 13. Pré-requisito do Rodrigo

`OPENAI_API_KEY` no `.env` local e no `.env` da VM, sem passar pelo chat.
