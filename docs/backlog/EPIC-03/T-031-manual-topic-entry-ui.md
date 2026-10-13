# T-031 · UI de entrada manual de assunto

- Épico: EPIC-03 Sources & Opportunities
- Responsável (papel/agente): Vitral (frontend)
- Branch/floor: `feat/T-031-manual-topic-entry-ui`
- Estado: todo
- Dependências: T-030, T-029

## Contexto

PRD §7.5: título obrigatório, notas, URLs de referência, pilar e formato opcionais; cria item `selected` e inicia geração; fatos fornecidos por Rodrigo são marcados como origem "autor".

## Resultado esperado

Botão "Novo assunto" (Início e Curadoria) abrindo formulário; validação Zod do contrato; aviso quando URL está fora dos domínios permitidos; redireciona para o estúdio em estado "gerando".

## Critérios de aceite (verificáveis)

- [ ] Submeter com apenas título funciona; com URL inválida mostra erro inline.
- [ ] Aviso de domínio não permitido é exibido sem bloquear.
- [ ] Playwright cobre o fluxo até o estúdio.

## Fora de escopo

Importar texto de posts antigos.

## Plano de teste

Playwright + componente.

## Riscos de segurança / compliance

Validação de URL no cliente é só UX; a validação real fica na API (T-029).
