# T-030 · UI de Curadoria (5 cards, lotes anteriores, descartar, rodar agora)

- Épico: EPIC-03 Sources & Opportunities
- Responsável (papel/agente): Vitral (frontend) · revisão Aurora
- Branch/floor: `feat/T-030-curation-ui`
- Estado: todo
- Dependências: T-007, T-011, T-014, T-029

## Contexto

J1 completa. Tela mais usada: precisa ser rápida, clara e segura com conteúdo externo.

## Resultado esperado

Tela Curadoria: lote atual (5 cards com todos os campos, chips, badges de gates e sinais de score, ações Selecionar/Descartar/Ver fontes), seção de descartadas com desfazer, lotes anteriores com Reativar, botão Rodar agora (com cooldown), estados: vazio (sem fontes), carregando, erro de ciclo com tentar novamente, expirado, abaixo-do-limiar. Página Início mostra resumo do lote e itens em andamento.

## Critérios de aceite (verificáveis)

- [ ] Todos os campos do PRD §7.3 visíveis em desktop e mobile.
- [ ] Título de fonte com `<img onerror>` renderiza como texto.
- [ ] Selecionar mostra confirmação e estado "gerando" sem bloquear navegação; ao concluir, card vira link para o estúdio (polling/SSE).
- [ ] Playwright cobre J1 passos 3–8 e variações V3/V4.
- [ ] `axe` sem violações críticas; navegação por teclado entre cards.

## Fora de escopo

Entrada manual (T-031).

## Plano de teste

Playwright com API mockada e com API real em Compose.

## Riscos de segurança / compliance

Renderização segura; links externos `rel=noopener noreferrer`.
