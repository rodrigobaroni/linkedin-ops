# Acessibilidade — checklist WCAG 2.2 AA

- Versão: 0.1
- Data: 2026-10-13
- Responsável: Aurora (Product Design)
- Escopo: dashboard web responsivo do LinkedIn Ops
- Meta: conformidade WCAG 2.2 nível AA, sem impedir melhorias AAA quando de baixo custo

## Critérios de aceite globais

- Todo fluxo principal funciona apenas com teclado: Curadoria → Estúdio → Aprovação → Agendamento → acompanhamento.
- Interface reflow em 320 CSS px sem rolagem horizontal, exceto conteúdo bidimensional essencial (grade do calendário e diff lado a lado), que possui alternativa linear.
- Zoom de texto a 200% e zoom de página a 400% não ocultam conteúdo ou ação.
- Nenhum erro crítico de axe-core nas rotas-chave; achados sérios precisam de justificativa e plano antes da entrega.
- Teste manual com VoiceOver + Safari (macOS/iOS) e NVDA + Chrome (Windows) cobre o fluxo crítico.
- Não depender de cor, posição, hover, arraste, tempo relativo ou ícone isolado para transmitir informação.

## 1. Perceptível

### 1.1 Alternativas textuais — 1.1.1 (A)

- [ ] Toda mídia sugerida/publicada exige texto alternativo editável antes da aprovação quando a imagem comunica conteúdo.
- [ ] Imagem decorativa usa `alt=""`; nunca repetir a legenda no `alt`.
- [ ] Prévia de card de código descreve linguagem e propósito; o código permanece disponível como texto quando aplicável.
- [ ] Ícones decorativos têm `aria-hidden="true"`; botões somente com ícone têm nome acessível.
- [ ] Gráficos em Analytics têm resumo textual e tabela com os mesmos valores.
- [ ] Avatar não é usado como única identificação do perfil de publicação.

### 1.2 Mídia temporal — 1.2.x

Não há áudio/vídeo previsto no MVP. Se upload de vídeo entrar no escopo, legendas, transcrição e audiodescrição devem ser especificadas antes da implementação; não considerar o suporte atual suficiente por padrão.

### 1.3 Adaptável — 1.3.1, 1.3.2, 1.3.3, 1.3.5 (A/AA)

- [ ] Um único `h1` por rota; seções em ordem `h2`/`h3`, sem usar tamanho visual como substituto de hierarquia.
- [ ] Navegação usa `nav`; conteúdo principal, `main`; alertas, `role="alert"` apenas quando urgentes.
- [ ] Listas, tabelas, timeline e pares rótulo/valor usam elementos semânticos adequados.
- [ ] Ordem do DOM corresponde à ordem visual e de leitura; CSS grid não reposiciona conteúdo de modo contraditório.
- [ ] Instruções não dizem apenas “clique no botão verde à direita”; usam o nome da ação.
- [ ] Inputs de autenticação e perfil usam `autocomplete` correto (`username`, `current-password`, `one-time-code`, `name`).
- [ ] Card de oportunidade não transforma todo o card em botão com controles aninhados.

### 1.4 Distinguível — 1.4.1, 1.4.3, 1.4.4, 1.4.10–1.4.13 (A/AA)

- [ ] Texto normal tem contraste ≥ 4,5:1; texto grande (≥ 24 px regular ou ≥ 18,66 px bold) ≥ 3:1.
- [ ] Bordas, foco, ícones funcionais e estados de controles têm contraste ≥ 3:1 contra cores adjacentes.
- [ ] Status combina rótulo + ícone + cor: `Falha na publicação`, não somente ponto vermelho.
- [ ] Links dentro de parágrafos são sublinhados ou diferenciados além da cor.
- [ ] A 200% de texto, controles não truncam rótulos e cards crescem verticalmente.
- [ ] A 320 px, conteúdo usa uma coluna; calendário oferece agenda linear; tabelas viram cards; diff oferece modo unificado.
- [ ] Espaçamento customizado do usuário (linha 1,5; parágrafo 2; letras 0,12em; palavras 0,16em) não perde conteúdo/funcionalidade.
- [ ] Conteúdo revelado por hover também abre por foco, pode ser dispensado com Escape, permanece enquanto houver hover/foco e não cobre ação essencial.
- [ ] Tooltip nunca contém instrução ou erro disponível apenas nele.

## 2. Operável

### 2.1 Teclado — 2.1.1, 2.1.2, 2.1.4 (A)

- [ ] Todas as ações funcionam com Tab, Shift+Tab, Enter e Espaço conforme o padrão do controle.
- [ ] Tabs usam setas entre abas, Home/End e `aria-selected`; Tab sai do conjunto.
- [ ] Dialog/AlertDialog prende foco enquanto aberto, fecha com Escape quando seguro e devolve foco ao disparador.
- [ ] Não há armadilha no editor de texto, calendário, diff ou menus.
- [ ] Atalhos de tecla única não são usados por padrão; se existirem no editor, podem ser desativados/remapeados.
- [ ] Arrastar item no calendário tem alternativas `Reagendar` e `Mover para…` totalmente operáveis por teclado.

### 2.2 Tempo suficiente — 2.2.1, 2.2.2 (A)

- [ ] Sessão prestes a expirar avisa com antecedência e oferece extensão acessível; texto não salvo é preservado localmente quando seguro.
- [ ] Janela de veto informa horário absoluto e restante; não é um limite de interação imposto pela UI, e sim regra editorial configurável.
- [ ] Toast de sucesso não contém a única forma de desfazer; quando houver `Desfazer`, também manter estado recuperável na tela pelo período definido.
- [ ] Animação/progresso contínuo respeita `prefers-reduced-motion` e tem texto estático.

### 2.3 Convulsões e reações físicas — 2.3.1 (A)

- [ ] Nenhum conteúdo pisca mais de três vezes por segundo.
- [ ] Erros e publicação não usam flash; mudança de cor é estável.

### 2.4 Navegável — 2.4.1–2.4.7, 2.4.11 (A/AA)

- [ ] Primeiro controle oferece “Pular para o conteúdo principal”.
- [ ] Título do documento descreve rota e item: `Estúdio — IA e revisão de código — LinkedIn Ops`.
- [ ] Foco segue ordem lógica; ações primárias não são forçadas primeiro no DOM por conveniência visual.
- [ ] Texto de link descreve destino: `Abrir “IA e revisão de código” no Estúdio`, não repetição de `Abrir` sem contexto acessível.
- [ ] Breadcrumb usa `aria-current="page"`.
- [ ] Foco visível: ring sólido de 2 px + offset 2 px, contraste ≥ 3:1; não remover outline sem substituto.
- [ ] Foco não fica totalmente oculto por barra inferior, cabeçalho sticky, cookie/banner ou teclado virtual (WCAG 2.2, 2.4.11).
- [ ] Ao inserir/remover banners globais, não mover o foco nem causar salto inesperado.

### 2.5 Modalidades de entrada — 2.5.1–2.5.4, 2.5.7, 2.5.8 (A/AA)

- [ ] Nenhuma ação exige gesto multiponto, desenho de caminho ou movimento do dispositivo.
- [ ] Eventos de ponteiro disparam no `click`/up; ações destrutivas não concluem no pointer-down.
- [ ] Nome acessível do controle contém o rótulo visível (`Aprovar esta versão`).
- [ ] Drag-and-drop do calendário/diff tem alternativa por clique e teclado (2.5.7).
- [ ] Alvos interativos têm ao menos 24 × 24 CSS px e espaçamento suficiente; objetivo interno é 44 × 44 px para ações primárias mobile (2.5.8).
- [ ] Chips removíveis têm botão de remoção com alvo adequado e nome completo.

## 3. Compreensível

### 3.1 Legível — 3.1.1, 3.1.2 (A/AA)

- [ ] Documento define `lang="pt-BR"`.
- [ ] Trechos em inglês relevantes usam `lang="en"` quando a mudança de idioma afeta pronúncia.
- [ ] Termos técnicos aparecem em linguagem simples; `correlationId`, `idempotencyKey` e detalhes de OAuth ficam em seção de suporte.
- [ ] Siglas têm expansão no primeiro uso quando forem necessárias.

### 3.2 Previsível — 3.2.1–3.2.4, 3.2.6 (A/AA)

- [ ] Focar ou alterar um campo não navega nem salva por surpresa.
- [ ] Selecionar modo de autonomia não o ativa imediatamente; exige ação nomeada e confirmação.
- [ ] Navegação, nome dos destinos e posição das ações recorrentes são consistentes.
- [ ] Ajuda contextual e “Detalhes para suporte” permanecem em posição consistente (3.2.6).
- [ ] Links externos e nova aba são indicados.
- [ ] Atualização automática de status não rouba foco; é anunciada por live region adequada.

### 3.3 Assistência de entrada — 3.3.1–3.3.4, 3.3.7, 3.3.8 (A/AA)

- [ ] Erro identifica o campo e descreve correção; resumo no topo liga para cada campo inválido em formulários longos.
- [ ] Labels, formato esperado e exemplo aparecem antes do envio quando necessário.
- [ ] Ações legais/financeiras não se aplicam, mas publicar, descartar, desconectar OAuth e subir autonomia recebem revisão/confirmação e são auditadas.
- [ ] Dados já informados no mesmo fluxo são reutilizados ou selecionáveis, não redigitados (3.3.7). Ex.: versão/título acompanham o agendamento.
- [ ] Login/reautenticação aceita gerenciador de senhas e colar; não usa puzzle cognitivo nem bloqueia password managers (3.3.8).
- [ ] Código de uso único usa `autocomplete="one-time-code"`, permite colar e não exige memorização.
- [ ] Mensagem de erro não expõe existência de conta, token ou detalhe sensível.

## 4. Robusto

### 4.1 Compatível — 4.1.2, 4.1.3 (A/AA)

- [ ] Componentes shadcn/Radix preservam nome, função, valor e estados ARIA; extensões não quebram o padrão.
- [ ] HTML não contém IDs duplicados, labels órfãos ou controles aninhados inválidos.
- [ ] Mensagens de status (`Salvando`, `Salvo`, `Rascunho pronto`) usam `role="status"`/`aria-live="polite"` sem mover foco.
- [ ] Erros urgentes que impedem publicação usam anúncio assertivo uma vez; não repetem a cada render.
- [ ] Virtualização de listas, se usada, mantém total/posição compreensíveis e não remove o item focado.

## Aplicação por tela

### Hoje e Curadoria

- [ ] Os cinco cards têm título programático único e posição `1ª de 5`.
- [ ] Ordem visual é a ordem de leitura; filtros não mudam resultados sem anúncio `N oportunidades exibidas`.
- [ ] Pilar, atualidade, score e gate têm rótulos, não apenas chips coloridos.
- [ ] `Selecionar e gerar` anuncia início e conclusão; foco permanece na ação/card e oferece link para o Estúdio.
- [ ] Accordion mobile `Ver detalhes e fontes` informa expandido/recolhido.
- [ ] Link de fonte inclui domínio e indicação de nova aba; texto externo é escapado.
- [ ] Carrossel de cards compactos em Hoje não é a única forma de chegar às oportunidades.

### Estúdio

- [ ] Textarea/editor possui label acessível, descrição do limite e contador associado.
- [ ] Contador próximo do limite é anunciado sem vocalizar a cada tecla; anunciar em marcos (por exemplo, 2.800 e 3.000).
- [ ] Marcações de afirmação sem fonte são encontráveis via lista “Pendências”, não somente por destaque visual/hover.
- [ ] Hooks são botões com texto completo; aplicar hook cria versão e anuncia resultado.
- [ ] Prévia é identificada como aproximação e não duplica todo o texto na árvore acessível quando editor e preview aparecem juntos; permitir ocultar a duplicata do leitor quando necessário.
- [ ] Diff informa adição/remoção por texto; ordem de leitura é clara no modo unificado.
- [ ] Autosave nunca captura foco; erro de autosave é persistente e permite copiar o texto.
- [ ] Barra fixa mobile não cobre o editor nem o cursor com teclado aberto.
- [ ] Dialog de aprovação move foco ao título, resume versão/gates/fontes e devolve foco após fechar.

### Calendário

- [ ] Existe visualização “Agenda” linear com dia, hora, título e status.
- [ ] Grade usa cabeçalhos de linha/coluna quando implementada como tabela; se for grid ARIA, segue integralmente o padrão de teclado.
- [ ] Reagendamento funciona sem arrastar: `Reagendar` → data/hora → confirmar.
- [ ] Horário inclui timezone/offset e data completa; cor não é a única diferença entre livre, agendado, publicado e falha.
- [ ] Conflito de cadência é associado ao campo e à ação de confirmar.

### Histórico e auditoria

- [ ] Tabela desktop tem `caption` acessível, cabeçalhos e ordenação anunciada.
- [ ] Cards mobile preservam todos os campos essenciais e a ação contextual.
- [ ] Timeline é lista ordenada; cada evento inclui ação, ator, data/hora e estado.
- [ ] IDs técnicos possuem botão `Copiar` com anúncio “Copiado”, sem expor segredos.
- [ ] Filtros aplicados aparecem em texto e podem ser removidos individualmente.

### Story Bank e Voice Profile

- [ ] Visibilidade `Pode usar publicamente` usa controle explícito e descrição da consequência.
- [ ] “Não público” é anunciado em cada entrada relevante.
- [ ] Formulários longos têm headings, resumo de erros e salvamento que preserva dados.
- [ ] Tags podem ser adicionadas/removidas por teclado.
- [ ] Histórico de versões informa vigente/anterior em texto.

### Fontes e watchlists

- [ ] Teste de feed anuncia etapas e resultado; três itens de prévia são headings/lista, não HTML cru.
- [ ] Estado `Pausada automaticamente` tem causa e ação `Corrigir`.
- [ ] Peso numérico possui label, limites e alternativa a slider, se slider existir.
- [ ] Watchlist não depende de drag para reordenar/priorizar.

### Analytics

- [ ] Cada gráfico tem título, período, unidade, resumo e tabela equivalente.
- [ ] Paleta mantém distinção com padrões/rótulos para daltonismo.
- [ ] Tooltip de gráfico pode ser obtido por teclado, mas nenhum dado existe apenas nele.
- [ ] Números indisponíveis dizem `Não disponível`; não usar zero como substituto.

### Notificações

- [ ] Não lida é indicada por texto acessível além do ponto visual.
- [ ] Filtros anunciam quantidade; marcar como lida não remove foco inesperadamente.
- [ ] A ação tem contexto no nome acessível (`Resolver falha de “Liderança…”`).
- [ ] Atualizações em background não interrompem leitura; contador muda via status não urgente.

### Configurações, autonomia e integrações

- [ ] Os três modos são radio group/cards selecionáveis com descrição; não são toggle binário.
- [ ] Diferenças de automação estão em tabela/lista textual navegável.
- [ ] Contagem da janela de veto tem horário absoluto e não atualiza live region a cada segundo.
- [ ] Reautenticação aceita password manager/colar; erro não limpa o formulário principal.
- [ ] Fluxo OAuth informa que abrirá domínio externo e confirma retorno; popup tem fallback na mesma aba.
- [ ] Telegram deixa explícito que não aprova; código de vínculo aceita colar e tem validade descrita.
- [ ] Desconectar integrações e subir autonomia exigem confirmação com consequência concreta.

## Foco e comportamento após ações

| Evento | Destino do foco |
|---|---|
| Aplicar filtro | permanece no controle; status anuncia total |
| Fechar dialog | retorna ao disparador |
| Excluir/descartar card | próximo card; se não houver, heading da lista |
| Adicionar card/entrada | heading do novo item ou confirmação, conforme contexto |
| Erro no submit | resumo de erros; links levam ao campo |
| Navegar de rota | `h1`/container principal recebe foco programático após anúncio de título |
| Abrir tab | painel associado, sem mover foco automaticamente salvo ação explícita |
| Concluir geração | foco não é roubado; live region anuncia e card expõe `Abrir no Estúdio` |
| Publicação confirmada | heading/status `Publicado`; ação `Ver no LinkedIn` logo depois |

## Plano de verificação

### Automatizado em CI

- [ ] ESLint/a11y para JSX e validações de semântica.
- [ ] axe-core nas rotas: `/hoje`, `/curadoria`, `/estudio/:fixture`, `/calendario`, `/configuracoes/autonomia`.
- [ ] Playwright com teclado no fluxo Curadoria → Estúdio → Aprovar → Agendar.
- [ ] Teste de contraste dos tokens e snapshots dos estados de foco.
- [ ] Viewports 320 × 568, 390 × 844, 768 × 1024, 1440 × 900; detectar overflow horizontal.

### Manual por release relevante

- [ ] Tab/Shift+Tab em todas as ações; Escape em overlays; setas em tabs/radios.
- [ ] VoiceOver + Safari no macOS: fluxo crítico e anúncios de autosave/status.
- [ ] VoiceOver + Safari no iOS: Curadoria, editor com teclado e agenda.
- [ ] NVDA + Chrome no Windows: landmarks, cards, tabelas, dialog e calendário.
- [ ] 200% texto, 400% zoom, espaçamento de texto customizado.
- [ ] High Contrast/Forced Colors do Windows: foco, status e botões permanecem identificáveis.
- [ ] Reduced Motion e navegação por toque com alvos mínimos.

### Evidência esperada para QA

- relatório axe sem violações críticas/sérias não justificadas;
- vídeo curto do fluxo só por teclado;
- capturas em 320 px e 400% sem perda de ação;
- matriz leitor de tela × navegador com resultado e defeitos;
- lista de exceções com critério WCAG, impacto, responsável e prazo.

## Definition of Done de UI acessível

- [ ] Critérios aplicáveis acima verificados.
- [ ] Estados empty/loading/error/success têm heading ou anúncio compreensível.
- [ ] Copy de ação e erro revisada em PT-BR.
- [ ] Bugs de severidade bloqueante/alta corrigidos antes de liberar.
- [ ] Mudanças em componentes compartilhados testadas em pelo menos Curadoria, Estúdio e Configurações.
- [ ] Crivo recebe fixtures dos sete estados de conteúdo e dos três modos de autonomia.

## Perguntas abertas

- **[DECISÃO RODRIGO]** Há tecnologia assistiva ou combinação navegador/dispositivo pessoal que deva receber prioridade adicional além da matriz proposta?
- **[DECISÃO RODRIGO]** Deseja adotar como meta interna alvos de toque de 44 × 44 px em toda a UI mobile, acima do mínimo AA de 24 × 24 px? A recomendação de design é sim.

