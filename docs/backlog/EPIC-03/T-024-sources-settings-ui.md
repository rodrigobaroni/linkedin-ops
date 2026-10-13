# T-024 · UI de Fontes, domínios e watchlist

- Épico: EPIC-03 Sources & Opportunities
- Responsável (papel/agente): Vitral (frontend)
- Branch/floor: `feat/T-024-sources-settings-ui`
- Estado: todo
- Dependências: T-007, T-013, T-023

## Contexto

J5 completa: adicionar com prévia, saúde, pausar/retomar, domínios, watchlist.

## Resultado esperado

Tela Fontes com lista e saúde (último sucesso, falhas, itens/semana), fluxo de adicionar com teste e prévia, edição, pausa/retomada, seção de domínios permitidos e de watchlist com peso; estado vazio orientando o primeiro cadastro.

## Critérios de aceite (verificáveis)

- [ ] Prévia do feed exibe títulos escapados (teste com título contendo `<script>`).
- [ ] Fonte pausada automaticamente aparece com alerta e ação "retomar".
- [ ] Playwright cobre adicionar/testar/salvar/pausar.

## Fora de escopo

Import OPML.

## Plano de teste

Playwright + componente.

## Riscos de segurança / compliance

Renderização segura de conteúdo externo.
