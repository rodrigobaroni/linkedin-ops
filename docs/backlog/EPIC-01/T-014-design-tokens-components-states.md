# T-014 · Design tokens, padrões de componentes e estados

- Épico: EPIC-01 Product & Design
- Responsável (papel/agente): Aurora (design) · implementação de tokens com Vitral
- Branch/floor: `docs/T-014-design-tokens-components`
- Estado: todo
- Dependências: T-011

## Contexto

Vitral precisa de tokens (cores, tipografia, espaçamento, raios, sombras, modo claro/escuro), cores por pilar e por estado do item, e padrões para cards, badges de gates, chips, tabelas, diálogos, toasts, estados vazios.

## Resultado esperado

`docs/product/design/tokens.md` + arquivo de tokens consumível (JSON/CSS vars) para Tailwind/shadcn; guia de componentes com estados (default/hover/focus/disabled/loading/error); paleta por pilar com contraste validado; iconografia; microcopy padrão em PT-BR para estados vazios e erros.

## Critérios de aceite (verificáveis)

- [ ] Contraste AA validado para texto e badges em claro e escuro.
- [ ] Tokens importados no `tailwind.config` de `apps/web` sem valores hard-coded nos componentes base.
- [ ] Mapa estado→cor para os estados do PRD §8.2.
- [ ] Guia de microcopy cobre: vazio, carregando, erro genérico, erro de integração, confirmação destrutiva.

## Fora de escopo

Protótipo de alta fidelidade (MVP corte).

## Plano de teste

Validação de contraste automatizada; revisão com Vitral.

## Riscos de segurança / compliance

Nenhum.
