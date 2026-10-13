# security

Segurança e conformidade com o LinkedIn. Mantido por Sentinela (Security & LinkedIn Compliance Reviewer). Resumo na note `security-policy`.

| Documento | Conteúdo |
|---|---|
| [threat-model.md](./threat-model.md) | STRIDE por componente, ativos, superfícies, ameaças TM-xx, mitigações, severidade, owners; gates G-01..G-06 que condicionam publicação real e piloto automático |
| [linkedin-policy.md](./linkedin-policy.md) | O que a plataforma pode e não pode fazer via API oficial: produtos/escopos, limites, proibição de scraping/browser automation/engajamento inautêntico, métricas realmente disponíveis, app review |
| [oauth-and-tokens.md](./oauth-and-tokens.md) | OAuth 2.0 (authorization code, state, PKCE condicional), envelope encryption dos tokens, rotação/revogação, sessões, cookies, CSRF, webhook Telegram, rate limiting |
| [data-and-lgpd.md](./data-and-lgpd.md) | Dados pessoais tratados, base legal, retenção, exportação/exclusão, logs e backups |
| [prompt-injection.md](./prompt-injection.md) | Injeção e exfiltração via fontes externas; controles no pipeline (delimitação, Structured Outputs sem tools livres, allowlists, fail-closed) |

Findings abertos e vereditos ficam na note `security-policy`; findings novos usam `.github/ISSUE_TEMPLATE/security.md`.
