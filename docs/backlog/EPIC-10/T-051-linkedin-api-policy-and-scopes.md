# T-051 · Política de uso da API do LinkedIn, escopos e limites

- Épico: EPIC-10 Security, Reliability & Deployment
- Responsável (papel/agente): Sentinela (segurança) · validação técnica Pêndulo
- Branch/floor: Ground (Onda 1; consolidado pelo Maestro)
- Estado: todo
- Dependências: nenhuma

## Contexto

Risco principal do produto (PRD §12): acesso, escopos e limites da API oficial para perfis pessoais; o que é e não é permitido (automação, engajamento, métricas).

## Resultado esperado

`docs/security/linkedin-policy.md` com: produto/escopos necessários (hipótese `openid profile w_member_social`), processo de criação do app e callback, limites de taxa e tamanho (texto, imagem), tipos de post suportados (texto, imagem, documento/carrossel?), métricas disponíveis para perfis pessoais (e quais **não** são), regras de uso aceitável que o produto deve respeitar, lista explícita de práticas proibidas no código (browser automation, scraping, engajamento inautêntico), resposta à pergunta do PRD §13.6 (fallback manual).

## Critérios de aceite (verificáveis)

- [ ] Cada afirmação sobre a API aponta para a documentação oficial (URL e data de consulta).
- [ ] Tabela "formato → suportado pela API? → épico" para `text|image|code-card|carousel`.
- [ ] Lista de métricas disponíveis vs. indisponíveis para perfil pessoal, para o PRD §4 e EPIC-07.
- [ ] Recomendação sobre o fallback manual registrada para decisão de Rodrigo.

## Fora de escopo

Implementação (T-038+).

## Plano de teste

Revisão cruzada por Pêndulo; validação prática em T-038.

## Riscos de segurança / compliance

Conformidade com termos da API; sem heurísticas não oficiais apresentadas como fato.
