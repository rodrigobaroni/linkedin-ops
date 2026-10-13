# T-011 · Mapa de navegação e wireframes da Curadoria

- Épico: EPIC-01 Product & Design
- Responsável (papel/agente): Aurora (design)
- Branch/floor: `docs/T-011-navigation-and-curation-wireframes`
- Estado: todo
- Dependências: T-009

## Contexto

Jornada J1 e PRD §7.3: cinco cards com assunto, resumo, fonte, atualidade, pilar, público, justificativa, ângulo, formato, score, badges de gates e ações. É a tela mais usada do produto.

## Resultado esperado

Mapa de navegação (Início, Curadoria, Estúdio, Calendário, Memória editorial, Fontes, Configurações, Auditoria); wireframes de Início e Curadoria (lote atual, lotes anteriores, descartar com motivo, rodar agora, novo assunto manual, estados empty/loading/error/expirado/abaixo-do-limiar); versão mobile para leitura e seleção. Entregue em `docs/product/design/` (Penpot/Figma + export PNG).

## Critérios de aceite (verificáveis)

- [ ] Todo campo do PRD §7.3 tem posição definida no card, em desktop e mobile.
- [ ] Estados: vazio (sem fontes), carregando, erro de ciclo, lote expirado, lote manual, candidato abaixo do limiar.
- [ ] Fluxo "Selecionar → confirmação → gerando → abrir estúdio" desenhado.
- [ ] Checklist WCAG 2.2 AA (contraste, foco, alvo de toque ≥ 24 px) anexado.

## Fora de escopo

Implementação; tokens (T-014).

## Plano de teste

Walkthrough com Farol usando J1 e variações V1–V5; teste heurístico (Nielsen) documentado.

## Riscos de segurança / compliance

Conteúdo externo sempre apresentado como citação/dado (visual distinto), nunca como texto do sistema.
