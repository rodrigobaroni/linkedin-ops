# Mapa de escopo — MVP vs fases posteriores

- Versão: 0.2 · 2026-10-13 · Farol
- Referências: `prd.md` §5, `docs/backlog/README.md`

## Critérios de corte

Um item entra no MVP somente se responder **sim** a todas:

1. **Necessário para o ciclo central?** Sem ele, Rodrigo não consegue ir de "5 cards" a "post publicado via API oficial" em modo assistido.
2. **Reduz risco inegociável?** Segurança de tokens, idempotência, auditoria mínima, conteúdo externo como dado. (Itens de risco entram mesmo que não sejam "features".)
3. **Cabe em uma tarefa de 1 branch/floor** com critérios verificáveis e um responsável claro.
4. **Não depende de decisão externa pendente** (ex.: aprovação de escopo de API) — se depender, entra com fallback explícito.

Itens que respondem **não** a 1 ou 2 vão para Fase 2/3, mesmo que baratos. Itens "MVP (corte)" são os primeiros a sair se o prazo apertar.

## Tabela por épico

| Épico | MVP (Fase 1) | MVP (corte, sai primeiro) | Fase 2 | Fase 3 |
|---|---|---|---|---|
| **EPIC-00 Foundation** | Monorepo pnpm+Turborepo; CI (lint, typecheck, test, build, secret scan); Docker Compose dev; contracts package; Prisma/migrations; worker pg-boss; API NestJS base; web shell | — | Renovate/Dependabot; preview envs | — |
| **EPIC-01 Product & Design** | PRD, jornadas, mvp-scope, backlog; mapa de navegação; wireframes de Curadoria, Estúdio, Calendário, Fontes, Memória, Configurações; design tokens; estados empty/loading/error | Protótipo navegável de alta fidelidade | Telas de Analytics | Telas de Engajamento assistido e Perfil |
| **EPIC-02 Identity & Editorial Memory** | Login single-user com sessão segura e `userId` em todas as entidades; Voice Profile versionado (modelo+API+UI); Story Bank (modelo+API+UI); pilares e públicos; pacote `editorial-engine` com prompts versionados e Structured Outputs; harness de evals (naturalidade, fidelidade, voz, experiência inventada) | Entrevista guiada para Story Bank | Inglês como idioma do motor; import de posts antigos para o Voice Profile | Multiusuário real (papéis) |
| **EPIC-03 Sources & Opportunities** | Fontes RSS/Atom (CRUD, teste, saúde, pausa automática); domínios permitidos; watchlist; coletor + normalização; dedup; classificação e score; scheduler seg/qua/sex 09:00 `America/Sao_Paulo` com recuperação de ciclo perdido; seleção de 5 com diversidade; expiração; API + state machine de oportunidades; UI de curadoria; entrada manual de assunto; "rodar agora" | Reativar expiradas; importar OPML | Ranking com feedback de descarte/seleção (Sextante); outras fontes (newsletters por e-mail, YouTube) | — |
| **EPIC-04 Draft Studio** | Item/versão/aprovação (modelo, state machine, API); job de geração (post + 3 hooks + fontes + sugestão de mídia); regenerar com instrução = nova versão; editor com prévia, contador, hooks, fontes, versões com diff; aprovar versão; badges de gates | Render local de code-card (Satori/Sharp) | Carrossel/documento (se a API suportar); repurposing | Comentários assistidos por URL (EPIC-08) |
| **EPIC-05 Scheduling & Publishing** | OAuth LinkedIn (conectar/desconectar, token cifrado, expiração monitorada); publicar texto com idempotência e reconciliação; publicar imagem; modelo de agendamento com timezone explícito; scheduler de publicação; calendário (UI); status/erros/retry; motor de política de autonomia (3 modos conforme PRD §6 v0.2: Assistido, Piloto automático controlado com janela de cancelamento, Piloto automático completo; gates; mídia exige humano; razão registrada; troca de modo); UI de autonomia e integrações; prova de acesso real à API (G-01) | Arrastar-e-soltar no calendário; `assistedPrefetchDraft` | Ativação dos modos piloto **em produção** (MVP entrega o motor e a UI; ativação só após 2 semanas de Assistido sem incidente) | Métricas de posts, se a API permitir |
| **EPIC-06 Notifications** | Adaptador Telegram (vínculo por código, chat autorizado, webhook com segredo); eventos → notificações; preferências; central interna | `quiet_hours` | Comandos no Telegram (cancelar/aprovar), se decidido | — |
| **EPIC-07 Analytics** | Apenas contrato: taxonomia de eventos de produto gravados desde o MVP (seleção, descarte com motivo, edição, aprovação, publicação) | — | Métricas, ranking com feedback, recomendações semanais | — |
| **EPIC-08 Assisted Engagement** | — | — | Contrato e protótipo | Comentário assistido por URL fornecida, sempre com revisão humana |
| **EPIC-09 Profile Optimization** | — | — | Contrato e protótipo | Auditoria e recomendações de perfil, sem edição automática |
| **EPIC-10 Security, Reliability & Deployment** | Threat model; política LinkedIn documentada; segredos e cifra de tokens; endurecimento de sessão (cookies, CSRF, rate limit); defesas contra prompt injection; audit log; observabilidade (Pino, health, OTel básico, alertas críticos); backup/restore testado; scans Semgrep/Trivy/gitleaks em CI com triagem (gate G-06); retenção/exportação/exclusão de dados (LGPD); deploy Oracle Cloud (Compose + Caddy + TLS); estratégia de testes e E2E do fluxo crítico | — | Alertas avançados; rotação de chaves automatizada; runbooks completos | — |

## Resumo de contagem (backlog inicial)

| Fase | Tarefas |
|---|---|
| MVP (Fase 1) | T-001 a T-048, T-050 a T-063 (ver `docs/backlog/README.md`) |
| Contratos no MVP (EPIC-07) | T-049 |
| Fase 2/3 | a detalhar após o MVP; os épicos têm placeholder no README do backlog |

## Marcos propostos

| Marco | Conteúdo | Critério |
|---|---|---|
| M1 Fundação | EPIC-00 completo; T-050/051 (threat model, política LinkedIn); T-061 (prova de acesso real à API, gate G-01) | `pnpm turbo lint typecheck test build` verde em CI; Compose sobe api/web/worker/postgres/minio |
| M2 Memória + Fontes | EPIC-02 e EPIC-03 | Ciclo real seg/qua/sex gera 5 cards com fontes reais de Rodrigo |
| M3 Estúdio | EPIC-04 | Seleção → rascunho com hooks/fontes → versões → aprovação |
| M4 Publicação | EPIC-05 + EPIC-06 | Post real publicado via API, idempotente, com Telegram; token cifrado; gates G-02/G-03/G-04 com evidência |
| M5 Produção | EPIC-10 essenciais | Rodando em Oracle Cloud com backup restaurado em teste; gates G-05/G-06 com evidência; E2E crítico verde; 2 semanas sem incidente |

## Decisões de corte pendentes (Rodrigo)

- Cards de código: MVP (corte) ou Fase 2.
- Fallback "copiar e publicar manualmente" caso a API do LinkedIn atrase.
- Entrevista guiada do Story Bank: MVP (corte) ou Fase 2.
