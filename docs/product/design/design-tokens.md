# Design tokens e padrões de componentes — LinkedIn Ops

- Versão: 0.1
- Data: 2026-10-13
- Responsável: Aurora (Product Design)
- Base: Tailwind CSS + shadcn/ui
- Objetivo: interface sóbria, confiável e orientada à decisão; não imitar visualmente o LinkedIn

## Princípios visuais

- **Confiança antes de decoração:** alta legibilidade, status explícito e consequências visíveis.
- **Densidade equilibrada:** desktop suporta comparação; mobile preserva conteúdo em uma coluna.
- **Semântica consistente:** azul para ação, verde para confirmação, âmbar para atenção, vermelho para erro/perigo.
- **Cor nunca trabalha sozinha:** todo estado combina cor com texto e, quando útil, ícone.
- **Tema claro no MVP:** tokens já usam variáveis semânticas para permitir tema escuro posterior, mas o tema escuro não é requisito desta onda.

## Cores

### Primitivas

| Família | Token | Hex | Uso |
|---|---|---:|---|
| Slate | `slate-950` | `#0F172A` | texto principal |
| Slate | `slate-700` | `#334155` | texto secundário forte |
| Slate | `slate-600` | `#475569` | texto secundário |
| Slate | `slate-400` | `#94A3B8` | ícones/placeholder não crítico |
| Slate | `slate-300` | `#CBD5E1` | borda forte |
| Slate | `slate-200` | `#E2E8F0` | borda padrão |
| Slate | `slate-100` | `#F1F5F9` | fundo sutil |
| Slate | `slate-50` | `#F8FAFC` | fundo da aplicação |
| White | `white` | `#FFFFFF` | superfície |
| Blue | `blue-800` | `#1E40AF` | primary hover/pressed |
| Blue | `blue-700` | `#1D4ED8` | primary padrão |
| Blue | `blue-100` | `#DBEAFE` | fundo informativo/seleção |
| Blue | `blue-50` | `#EFF6FF` | fundo informativo sutil |
| Green | `green-800` | `#166534` | texto success |
| Green | `green-100` | `#DCFCE7` | fundo success |
| Amber | `amber-900` | `#78350F` | texto warning |
| Amber | `amber-100` | `#FEF3C7` | fundo warning |
| Red | `red-800` | `#991B1B` | texto destructive/error |
| Red | `red-700` | `#B91C1C` | destructive padrão |
| Red | `red-100` | `#FEE2E2` | fundo destructive/error |
| Violet | `violet-800` | `#5B21B6` | modo completo/política |
| Violet | `violet-100` | `#EDE9FE` | fundo do modo completo |

Contraste esperado no tema claro: texto principal em branco e `blue-700` com branco atendem texto normal AA; pares de status usam o tom 800/900 sobre o tom 100. Validar valores finais com teste automatizado e inspeção real, especialmente texto pequeno.

### Semânticas shadcn/ui

Usar CSS variables em HSL para compatibilidade com o padrão shadcn. A implementação pode converter para OKLCH numa evolução, mantendo os nomes semânticos.

```css
:root {
  --background: 210 40% 98%;       /* #F8FAFC */
  --foreground: 222 47% 11%;       /* #0F172A */
  --card: 0 0% 100%;
  --card-foreground: 222 47% 11%;
  --popover: 0 0% 100%;
  --popover-foreground: 222 47% 11%;
  --primary: 221 83% 53%;          /* #1D4ED8 */
  --primary-foreground: 0 0% 100%;
  --secondary: 210 40% 96%;        /* #F1F5F9 */
  --secondary-foreground: 215 25% 27%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 35%; /* #475569 */
  --accent: 214 95% 93%;           /* #DBEAFE */
  --accent-foreground: 224 76% 33%;
  --destructive: 0 74% 42%;        /* #B91C1C */
  --destructive-foreground: 0 0% 100%;
  --border: 214 32% 91%;           /* #E2E8F0 */
  --input: 213 27% 84%;            /* #CBD5E1 */
  --ring: 221 83% 53%;
  --radius: 0.625rem;

  --success: 142 72% 29%;
  --success-foreground: 0 0% 100%;
  --success-subtle: 141 79% 93%;
  --warning: 32 95% 44%;
  --warning-foreground: 25 86% 22%;
  --warning-subtle: 48 96% 89%;
  --info: 221 83% 53%;
  --info-subtle: 214 95% 93%;
  --automation: 263 70% 50%;
  --automation-subtle: 251 91% 95%;
}
```

### Status de conteúdo

| Estado | Fundo | Texto/borda | Ícone sugerido |
|---|---|---|---|
| Rascunho | `slate-100` | `slate-700` | arquivo |
| Em revisão | `blue-100` | `blue-800` | olho/lupa |
| Aprovado | `green-100` | `green-800` | check em círculo |
| Agendado | `violet-100` | `violet-800` | calendário/relógio |
| Publicando | `blue-50` | `blue-800` | spinner + texto |
| Publicado | `green-100` | `green-800` | check duplo/link |
| Falha | `red-100` | `red-800` | alerta em círculo |

### Pilares editoriais

Pilares são configuráveis e podem usar uma paleta limitada: azul, teal, violeta, laranja, rosa e slate. Cada chip inclui o nome. Não reutilizar as cores de erro/sucesso para comunicar qualidade. Quando houver mais de seis pilares, repetir a paleta é aceitável porque a identificação textual é obrigatória.

## Tipografia

### Família

```text
Sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      "Segoe UI", sans-serif
Mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace
```

Não depender de download de fonte para a interface funcionar. Mono é restrita a IDs, diff e detalhes técnicos.

### Escala

| Token | Tailwind | Tamanho/linha | Peso | Uso |
|---|---|---|---|---|
| `display-sm` | `text-3xl leading-9` | 30/36 px | 700 | onboarding/empty especial; uso raro |
| `heading-1` | `text-2xl leading-8` | 24/32 px | 700 | título da tela |
| `heading-2` | `text-xl leading-7` | 20/28 px | 650/700 | título de seção |
| `heading-3` | `text-lg leading-7` | 18/28 px | 600 | card/drawer |
| `body-lg` | `text-base leading-7` | 16/28 px | 400 | texto longo/editor |
| `body` | `text-sm leading-6` | 14/24 px | 400 | UI padrão |
| `label` | `text-sm leading-5` | 14/20 px | 600 | rótulos/botões |
| `caption` | `text-xs leading-4` | 12/16 px | 500 | metadado auxiliar; nunca ação essencial |
| `mono` | `font-mono text-xs` | 12/18 px | 400 | correlationId/diff |

Editor do post usa no mínimo 16 px no mobile para evitar zoom automático. Comprimento confortável de texto: `max-w-prose` (aprox. 65–75 caracteres por linha). Não usar caixa alta em frases; overline curto pode usar tracking moderado.

## Espaçamento e layout

Escala base de 4 px, usando tokens Tailwind existentes:

| Token | Valor | Tailwind | Uso |
|---|---:|---|---|
| `space-1` | 4 px | `1` | proximidade ícone/texto |
| `space-2` | 8 px | `2` | elementos internos compactos |
| `space-3` | 12 px | `3` | grupos de campo/chip |
| `space-4` | 16 px | `4` | padding mobile/card compacto |
| `space-5` | 20 px | `5` | card padrão |
| `space-6` | 24 px | `6` | seções internas |
| `space-8` | 32 px | `8` | separação de seções |
| `space-10` | 40 px | `10` | cabeçalho/conteúdo amplo |
| `space-12` | 48 px | `12` | blocos de página |

### Containers

- largura máxima geral: `max-w-screen-2xl` (1536 px), centralizado;
- padding de página: 16 px mobile, 24 px tablet, 32 px desktop;
- gap de grid: 16 px mobile, 24 px desktop;
- sidebar: 256 px expandida, 72 px recolhida;
- Estúdio: 58/42% a partir de 1200 px; 50/50% entre 1024–1199; painel alternado abaixo de 1024;
- conteúdo de formulário: máximo 720 px; não esticar inputs de texto curto pela tela inteira.

### Breakpoints

Usar breakpoints Tailwind como referências, ajustando por conteúdo:

- `sm` 640 px: dois controles curtos podem ficar lado a lado;
- `md` 768 px: cards podem usar duas colunas quando couber;
- `lg` 1024 px: sidebar e Estúdio dividido;
- `xl` 1280 px: Curadoria em duas colunas confortáveis;
- `2xl` 1536 px: limitar conteúdo, evitando linhas excessivamente longas.

## Raio, borda e sombras

| Token | Valor | Uso |
|---|---:|---|
| `radius-sm` | 6 px | badge, chip |
| `radius-md` | 10 px | input, botão, card padrão (`--radius`) |
| `radius-lg` | 14 px | dialog, sheet, destaque |
| `radius-full` | 9999 px | avatar, contador, status compacto |
| `border-default` | 1 px `slate-200` | superfície e divisão |
| `border-strong` | 1 px `slate-300` | input/controle |

```css
--shadow-xs: 0 1px 2px rgb(15 23 42 / 0.05);
--shadow-sm: 0 1px 3px rgb(15 23 42 / 0.08), 0 1px 2px rgb(15 23 42 / 0.05);
--shadow-md: 0 8px 24px rgb(15 23 42 / 0.10);
--shadow-overlay: 0 20px 50px rgb(15 23 42 / 0.18);
```

- cards comuns: borda + `shadow-xs` opcional;
- card selecionado: borda primary de 2 px, sem aumentar dimensão (usar ring);
- popover/dropdown: `shadow-md`;
- dialog/sheet: `shadow-overlay`;
- foco nunca é comunicado por sombra decorativa; usar ring específico.

## Movimento

| Token | Valor | Uso |
|---|---:|---|
| `duration-fast` | 120 ms | hover/focus |
| `duration-base` | 180 ms | accordion/popover |
| `duration-slow` | 240 ms | sheet/dialog |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | padrão |

Respeitar `prefers-reduced-motion: reduce`: remover deslocamento, parallax e animações contínuas; manter mudança instantânea/opacidade curta. Spinners mantêm alternativa textual “Carregando”.

## Iconografia

- Preferência: Lucide, 16 px em controles e 20–24 px em navegação/estado vazio.
- Ícones decorativos usam `aria-hidden="true"`.
- Botão somente com ícone exige nome acessível e tooltip em desktop; em ações críticas, preferir ícone + texto.
- Links externos incluem ícone e texto acessível “abre em nova aba”.

## Padrões shadcn/ui

### Botões

| Variante | Uso | Exemplo de copy |
|---|---|---|
| `default` | uma ação principal por região | `Selecionar e gerar`, `Aprovar esta versão` |
| `secondary` | ação alternativa segura | `Regenerar`, `Testar conexão` |
| `outline` | navegação/ação terciária | `Ver fontes`, `Comparar versões` |
| `ghost` | ação de baixa ênfase | `Cancelar`, menus |
| `destructive` | ação destrutiva confirmada | `Desconectar LinkedIn`, `Descartar` no diálogo |
| `link` | navegação inline | `Entender o modo` |

- altura padrão: 40 px (`h-10`); confortável/mobile: 44 px mínimo de alvo, com padding ao redor quando necessário;
- loading preserva largura e troca o conteúdo por spinner + verbo no gerúndio (`Salvando…`);
- desabilitado sempre tem explicação adjacente ou tooltip acessível; não usar somente `cursor-not-allowed`.

### OpportunityCard

Composição recomendada sobre `Card`:

```text
CardHeader: posição, pilar, atualidade, score
CardTitle: assunto
CardContent: resumo + fonte + público + justificativa + ângulo + formato + gates
CardFooter: Ver fontes | Descartar | Selecionar e gerar
```

- card inteiro não é botão; ações internas têm alvos independentes;
- título é `h2`/`h3` conforme o contexto;
- estado selecionado usa `aria-current` ou texto de status, não checkbox falso;
- em mobile, footer empilha: primária largura total, secundárias abaixo/lado a lado.

### Badges e chips

- `Badge` de status: ícone + rótulo; não interativo;
- chip de filtro removível usa `Button` com `aria-label="Remover filtro Pilar: IA"`;
- tooltip complementa, nunca contém informação essencial exclusiva;
- máximo de três badges visíveis por card; excedentes viram `+2 sinais`, expansível.

### Formulários

- `Label` sempre visível; placeholder é exemplo, não rótulo;
- texto de ajuda antes do erro; erro associado por `aria-describedby`;
- obrigatoriedade marcada por texto/asterisco explicado;
- validação ocorre no blur e no submit, não a cada tecla para textos longos;
- valores sensíveis nunca voltam preenchidos; OAuth não expõe token;
- `Textarea` do Estúdio começa com altura útil e pode expandir; contador não interrompe digitação.

### Dialog, AlertDialog, Sheet e Drawer

- `Dialog`: decisão curta/reversível, regenerar, agendar;
- `AlertDialog`: publicar, descartar, desconectar, revogar aprovação;
- `Sheet`: filtros e formulários de apoio no desktop;
- `Drawer`: equivalente mobile quando o teclado não for o foco principal;
- foco inicial na opção mais segura, exceto confirmação comum de formulário;
- ao fechar, devolver foco ao disparador.

### Tabs e Accordion

- Estúdio desktop: `Tabs` para Prévia, Hooks, Fontes, Mídia e Versões;
- mobile: segmentado `Editor/Apoio`, depois tabs roláveis dentro de Apoio;
- `Accordion` para detalhes do card e seções do Voice Profile mobile;
- estado ativo usa texto, borda e `aria-selected`, não só fundo.

### Table e lista responsiva

- tabelas desktop têm cabeçalho fixo apenas quando a altura exigir;
- mobile converte cada linha em card sem ocultar ações essenciais;
- ordenação anuncia coluna e direção;
- seleção em massa não entra no MVP onde possa causar publicação/descartes acidentais.

### Toast, Alert e banner

- toast: sucesso de baixa consequência por 5–8 s e botão “Desfazer” quando possível;
- alert inline: validação, gate, fonte pausada;
- banner de página: falha que afeta a tela;
- banner global: LinkedIn desconectado ou risco sobre publicação;
- nenhum erro crítico desaparece automaticamente.

### Skeleton e progresso

- skeleton replica a estrutura e não pulsa sob `prefers-reduced-motion`;
- usar `Progress` somente quando o valor for real;
- geração de IA usa progresso indeterminado + etapas factuais (`Na fila`, `Gerando`, `Validando`), sem percentual inventado;
- operações acima de 10 s oferecem contexto e permitem navegar quando seguro.

### Diff de versões

- modo unificado como padrão, lado a lado em telas largas;
- adição: fundo verde sutil + prefixo `+`; remoção: vermelho sutil + prefixo `−` e tachado opcional;
- alternativa textual para leitores de tela: “Trecho adicionado/removido”; não depender de cor.

## Copy em PT-BR

### Voz da interface

- direta, calma e específica;
- verbos nomeiam resultado: `Agendar publicação`, não `Continuar`;
- evitar culpa e antropomorfismo: `Não foi possível gerar`, não `A IA ficou confusa`;
- distinguir sistema de usuário: `Aprovado por Rodrigo` / `Aprovado pela política v3`;
- não prometer o que a API não confirmou.

### Glossário consistente

| Usar | Evitar |
|---|---|
| oportunidade | ideia quente, lead |
| rascunho | conteúdo gerado |
| versão | variante (exceto hooks) |
| fonte | referência quando significar URL/artigo |
| modo assistido/controlado/completo | automático ligado/desligado |
| publicar | postar (em ações formais) |
| agendar | programar (mistura de termos) |
| em revisão | pendente genérico |
| guardrail / critério de segurança* | gate sem explicação |

\* Na UI principal, preferir “critério de segurança/qualidade”; “guardrail” pode aparecer como termo secundário em Configurações.

### Modelos

- Sucesso: `Versão v4 aprovada.`
- Erro preservado: `Não foi possível salvar. Seu texto continua nesta tela.`
- Empty: `Nenhuma publicação agendada nesta semana.`
- Ação: `Escolher horário`, `Revisar fontes`, `Reconectar LinkedIn`.
- Desabilitado: `Aprove uma versão antes de agendar.`
- Confirmação: `Publicar a versão v4 agora no perfil de Rodrigo Baroni?`

## Convenções de implementação

- Criar tokens semânticos no preset compartilhado de Tailwind; componentes consomem semântica, não hex direto.
- Estender shadcn/ui por composição; preservar semântica HTML e comportamento Radix.
- Variantes via `class-variance-authority` para `status`, `severity` e `autonomyMode`.
- Não codificar regra de negócio no componente visual; receber estado e ações por props tipadas.
- Storybook não é requisito do MVP, mas os estados de componente devem ter fixtures determinísticas para QA visual.

## Perguntas abertas

- **[DECISÃO RODRIGO]** Existe identidade visual pessoal (logo, cores ou fonte) a incorporar? Até resposta, usar esta base neutra e confiável.
- **[DECISÃO RODRIGO]** Tema escuro é prioridade no MVP? A hipótese é não; os tokens semânticos mantêm a evolução possível.

