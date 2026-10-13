# Política de uso da API do LinkedIn

- Owner: Sentinela; implementação: Pêndulo
- Versão da revisão: 2026-10-13
- Escopo do produto: publicação e, somente quando autorizada, leitura/analytics do perfil pessoal de Rodrigo
- Regra de precedência: termos e permissões exibidos para o app no Developer Portal prevalecem sobre este resumo

> Este documento é um controle de produto e engenharia, não aconselhamento jurídico. A API e seus
> programas são versionados; toda capability deve ser verificada no app real antes de ser prometida.

## 1. Veredito

**APROVADO COM RESSALVAS para texto e uma imagem; BLOQUEADO para analytics/leitura de atividade até
aprovação e scopes reais.**

O MVP pode solicitar o produto self-service **Share on LinkedIn** e o scope `w_member_social` para
publicar em nome do membro autenticado. O sistema não deve pressupor acesso a `r_member_social`,
analytics pessoais, comentários, reações, seguidores ou Community Management. A documentação oficial
atual declara `r_member_social` fechado a novos pedidos e trata Community Management como produto
vetted, destinado atualmente a organizações legais registradas e casos comerciais.

## 2. Princípios inegociáveis

1. Operar o LinkedIn somente por OAuth 2.0 e APIs oficiais disponibilizadas ao app.
2. Nunca usar Selenium, Playwright, extensão de navegador, cookies de sessão do LinkedIn, scraping,
   endpoint privado/reverse-engineered ou automação do site.
3. Nunca criar conta falsa, interação falsa, bot de engajamento, mass comment/like/repost/DM, ou
   mecanismo para manipular algoritmo/distribuição.
4. O usuário vê exatamente o texto/mídia/visibilidade que será publicado; modos automáticos obedecem
   gates, política de autonomia e trilha de auditoria.
5. Solicitar apenas os scopes necessários para a capability ativa. Capability sem scope/aprovação fica
   escondida ou claramente indisponível, nunca simulada.
6. Respeitar consentimento, finalidade, limites de armazenamento e exclusão de dados do LinkedIn.
7. Tratar respostas do LinkedIn como dados externos validados; nunca registrar token ou payload pessoal
   completo em log.

## 3. Produtos e scopes mínimos

| Capability | Produto/programa | Scope mínimo | Status no LinkedIn Ops |
|---|---|---|---|
| Publicar texto/link no perfil pessoal | Share on LinkedIn | `w_member_social` | MVP, condicionado ao app real. |
| Upload e publicação de uma imagem do próprio membro | Share on LinkedIn / Images ou Assets API disponível ao app | `w_member_social` | MVP, condicionado a teste integrado. |
| Identificar o membro/Person URN no fluxo | Sign in with LinkedIn using OpenID Connect | `openid profile` | Usar se necessário; `email` não é necessário para publicar. |
| Obter e-mail | OpenID Connect | `email` | Fora do mínimo; não solicitar sem finalidade separada. |
| Ler posts, comentários e likes do membro | Member Post Management | `r_member_social` | **Bloqueado:** permissão restrita; documentação atual diz que o programa está fechado. |
| Analytics dos posts pessoais | Community Management / Member Post Analytics | `r_member_postAnalytics` | **Bloqueado por padrão:** exige acesso real ao programa/produto e app review. |
| Analytics do perfil/seguidores | Community Management / Member Analytics | `r_member_profileAnalytics` | **Bloqueado por padrão:** exige acesso real ao programa/produto e app review. |
| Página de empresa | Community Management | `w_organization_social`, `r_organization_social`, outros | Fora de escopo. |

### Pedido recomendado do MVP

- Começar com `w_member_social`.
- Adicionar `openid profile` somente se o fluxo escolhido precisar do identificador/claims OIDC para
  construir ou confirmar o autor. Não pedir `email` por conveniência.
- Não incluir scopes de leitura/analytics no consentimento do MVP.
- Após callback, comparar os scopes efetivamente retornados com os solicitados e armazenar essa lista;
  falhar fechado se `w_member_social` não estiver presente.

OpenID Connect autentica o membro para o app e fornece claims limitados; a própria documentação alerta
que o recurso não “verifica identidade” e não deve ser apresentado assim. Login no dashboard e conexão
da conta para publicação são decisões distintas.

## 4. Capacidades de publicação

### Confirmado na documentação oficial

- O guia self-service **Share on LinkedIn** associa `w_member_social` à criação de post pelo membro
  autenticado e documenta texto, URL/artigo e imagem.
- A documentação mais nova da **Posts API** lista posts orgânicos de texto, imagem, vídeo, documento,
  artigo, multi-image, poll e celebration; carrossel é listado apenas como sponsored.
- A **Images API** aceita owner pessoa e `w_member_social` para upload; com esse scope write-only, não se
  deve presumir que GET de imagem esteja disponível.
- Respostas de criação bem-sucedida trazem um identificador/URN que deve ser persistido para auditoria.
- APIs REST versionadas exigem `Linkedin-Version: YYYYMM` e `X-Restli-Protocol-Version: 2.0.0` quando a
  documentação do endpoint assim determinar.

### Escopo implementável nesta fase

- Texto e uma imagem, visibilidade selecionada e exibida antes da publicação.
- URL/artigo somente depois de teste de contrato do endpoint disponível ao app.
- Vídeo, documento, multi-image, polls e celebration ficam fora do MVP até contrato, UX, limites de mídia
  e idempotência específicos serem revisados.
- “Carrossel orgânico” não deve ser prometido: a tabela atual da Posts API marca carrossel como não
  suportado para post orgânico. Um documento PDF não deve ser rotulado como carrossel sem clareza na UI.

### Ambiguidade que precisa de prova

O guia self-service ainda documenta `POST /v2/ugcPosts` + Assets API, enquanto a documentação de
Community Management informa que Posts API e Images API substituem UGC Posts e Assets. Isso **não**
autoriza assumir que todo app self-service possui os endpoints novos. Pêndulo deve testar no app real,
registrar endpoint, headers, versão, status e campos de resposta sem registrar token ou conteúdo pessoal.

## 5. Rate limits e tratamento de erro

- Toda chamada é rate limited. Há limite diário por aplicação e por membro; o reset diário ocorre à
  meia-noite UTC segundo a documentação geral.
- Limites padrão por endpoint não são publicados universalmente. Consultar **Developer Portal → Analytics**
  após ao menos uma chamada no dia; não codificar números “conhecidos” na aplicação.
- `429` deve honrar `Retry-After` quando presente, aplicar backoff exponencial com jitter e orçamento de
  retries. Publicação nunca faz retry cego depois de timeout/resultado ambíguo.
- Métricas de quota por rota/app/membro devem acionar alerta antes do esgotamento. O portal informa alertas
  de app a 75%, mas eles podem atrasar; o sistema precisa de telemetria própria sem dados pessoais.
- A documentação do Community Management informa, para o **Development Tier**, 500 requests por app e
  100 por membro; esses números não são aplicados ao Share on LinkedIn nem ao Standard Tier sem confirmação.
- `401/403` por scope/revogação marca a conexão como `reauthorization_required`; não entra em loop.
- `426` ou versão sunset bloqueia a fila afetada e alerta. Revisar versões mensalmente e migrar antes da
  data publicada.

## 6. Leitura, analytics e métricas de perfil pessoal

Não confundir “a documentação descreve o endpoint” com “nosso app tem permissão”.

| Dado/métrica documentada | Scope documentado | Pode aparecer no produto? |
|---|---|---|
| Conteúdo de posts/comentários/likes do membro | `r_member_social` | Não no MVP; scope fechado/restrito. |
| Impressões, membros alcançados, reshares, reações, comentários | `r_member_postAnalytics` | Só após aprovação e teste real. |
| Saves, sends, link clicks, CTA clicks, seguidores ganhos, profile views vindos do conteúdo | `r_member_postAnalytics` | Só quando a versão/endpoint real retornar a métrica; algumas combinações/agregações têm restrições. |
| Seguidores, profile viewers e search appearances | `r_member_profileAnalytics` | Só após aprovação e teste real. |
| Demografia de audiência, page analytics, ads | scopes de organização/ads | Fora de escopo para perfil pessoal. |

Regras:

- Não criar métrica derivada com nome que implique dado fornecido pelo LinkedIn quando ela vier apenas de
  eventos internos. Usar prefixo/descrição “métrica interna”.
- Não exibir “alcance”, “impressões”, “engagement rate” ou “profile views” sem campo oficial recebido e
  provenance do endpoint/versão.
- A documentação de Member Post Analytics declara valores best-effort e, em certos casos, diferenças da
  UI; não usar para faturamento nem prometer igualdade com a UI.
- Se Community Management for aprovado, dados de atividade social de membros têm limite de armazenamento
  de 48 horas e perfil de outros membros somente cache de 24 horas, salvo regra oficial mais restritiva.
- Não exportar, combinar com CRM, enriquecer perfil, prospectar ou usar Member Data para advertising,
  sales ou recruiting.

## 7. Community Management e app review

Community Management não é requisito para o primeiro publish self-service, mas é gate para capabilities
avançadas de Profile Management/Member Analytics.

Processo documentado:

1. Criar app e associá-lo a LinkedIn Page/organização elegível.
2. Conferir restricted use cases, API Terms e Marketing API Terms.
3. Para o programa atual, usar organização legal registrada, e-mail empresarial verificável, site,
   endereço e privacy policy; uma pessoa super admin da Page verifica o app.
4. Solicitar Development Tier com caso de uso exato. Rejeição pode exigir novo app para nova tentativa.
5. Integrar e, para Standard Tier, submeter overview, credenciais de teste e screencast de alta resolução
   demonstrando cada caso declarado, consentimento OAuth e tratamento de dados.
6. Manter o app aderente; mudança material em uso, armazenamento, exclusão ou distribuição pode exigir
   notificação/re-review.

**Risco de elegibilidade:** o produto é self-hosted e inicialmente pessoal. A documentação atual diz que
Community Management está disponível a organizações legais registradas para casos comerciais. Rodrigo
precisa confirmar se há entidade, domínio/e-mail comercial, site, política de privacidade e Page elegível.
Sem isso, analytics pessoal fica fora de escopo sem bloquear publicação self-service.

## 8. Condutas proibidas

O LinkedIn Ops não deve:

- extrair perfil, feed, posts, comentários, métricas ou conexões por HTML, browser, extensão ou endpoint
  privado;
- automatizar o website do LinkedIn para publicar, comentar, curtir, repostar, conectar ou enviar DM;
- gerar/operar fake accounts ou interações coordenadas/inautênticas;
- automatizar comentários em terceiros; a feature futura de comentário é somente sugestão, para URL
  fornecida por Rodrigo, com revisão humana e execução manual/oficial se a API autorizada existir;
- burlar rate limit, acesso, CAPTCHA, robots, versão, role ou restrição de produto;
- copiar/distribuir conteúdo ou dados de membros sem direito/consentimento;
- armazenar token em localStorage, browser, log, prompt, analytics ou issue;
- usar dados do LinkedIn para leads, CRM, recrutamento, ads targeting ou enriquecimento de pessoas;
- representar a aplicação como parceira/certificada pelo LinkedIn sem autorização escrita.

Violação pode levar a restrição/encerramento da conta e acesso à API.

## 9. Gate de release verificável

Antes da primeira publicação real, anexar a uma evidência interna:

- produto(s) habilitado(s) no Developer Portal;
- scopes exibidos no Auth tab e scopes efetivamente retornados;
- redirect URI exata e HTTPS em produção;
- endpoint, versão e headers aceitos para texto e imagem;
- quota exibida no portal depois de chamada de teste;
- publicação em conta de teste/conta autorizada, com URN persistido;
- desconexão/reauth e tratamento de 401, 403, 429, timeout e resposta ambígua;
- confirmação de que nenhuma capability restrita aparece habilitada.

Nunca colar tokens, client secret ou dados pessoais nessa evidência.

## 10. O que não foi possível verificar apenas por documentação pública

1. **[VERIFICAR NO APP]** Se o app de Rodrigo receberá Posts/Images REST ou somente o fluxo UGC/Assets
   documentado em Share on LinkedIn.
2. **[VERIFICAR NO APP]** Quotas exatas de cada endpoint para o produto/tier concedido.
3. **[VERIFICAR NO APP]** Se programmatic refresh tokens serão habilitados; a documentação os limita a
   parceiros aprovados.
4. **[VERIFICAR NO APP]** Elegibilidade de Rodrigo para Community Management e os scopes
   `r_member_postAnalytics`/`r_member_profileAnalytics`.
5. **[NÃO DISPONÍVEL SEGUNDO DOC ATUAL]** Novos pedidos de `r_member_social`.
6. **[VERIFICAR COM LINKEDIN]** Endpoint programático oficial de revogação aplicável a este produto; até
   confirmação, desconectar localmente e orientar revogação nas configurações do LinkedIn.

## 11. Perguntas abertas — decisão de Rodrigo

1. **[DECISÃO RODRIGO]** Há entidade legal, e-mail empresarial, site, privacy policy e LinkedIn Page que
   possam sustentar um pedido futuro de Community Management?
2. **[DECISÃO RODRIGO]** Se o app não obtiver leitura/analytics, aceitar analytics apenas internos e
   publicação text/image como MVP?
3. **[DECISÃO RODRIGO]** Se a aprovação da API atrasar, aceitar fallback “copiar e publicar manualmente”,
   explicitamente marcado como manual e sem browser automation?

## 12. Fontes oficiais consultadas

- [Authorization Code Flow (3-legged OAuth)](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- [Getting Access to LinkedIn APIs](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
- [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin)
- [Sign In with LinkedIn using OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)
- [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)
- [Images API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api)
- [Rate Limiting](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits)
- [Community Management overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview)
- [Community Management App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review)
- [Member Post Statistics](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/post-statistics)
- [Member Follower Statistics](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/follower-statistics)
- [Restricted Uses of LinkedIn Marketing APIs and Data](https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases)
- [Data Storage Requirements](https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements)
- [API Terms of Use](https://www.linkedin.com/legal/l/api-terms-of-use)
- [Additional Terms for the LinkedIn Marketing API Program](https://www.linkedin.com/legal/l/marketing-api-terms)
- [User Agreement](https://www.linkedin.com/legal/user-agreement)
- [Prohibited software and extensions](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibition-of-scraping-software)

Links e conclusões revisados em 2026-10-13. Revalidar antes de cada release que altera a integração.
