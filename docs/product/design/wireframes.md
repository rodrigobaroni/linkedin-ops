# Wireframes — LinkedIn Ops

- Versão: 0.1 (baixa fidelidade)
- Data: 2026-10-13
- Responsável: Aurora (Product Design)
- Viewports de referência: desktop 1440 × 900; mobile 390 × 844
- Convenção: `[Ação]`, `( ) opção`, `[x] seleção`, `⋮ menu`, `! alerta`

Os wireframes definem hierarquia, conteúdo mínimo e comportamento responsivo. Não prescrevem dimensões de implementação pixel a pixel; os tokens estão em `design-tokens.md`.

## Estrutura global

### Desktop

```text
┌────────────── 256 px ─────────────┬──────────────── conteúdo fluido ────────────────┐
│ LinkedIn Ops                      │ Breadcrumb                         🔔 2   Rodrigo │
│                                   ├──────────────────────────────────────────────────┤
│ Hoje                              │ Título da tela                [ação contextual] │
│ Curadoria                         │ Descrição curta                                    │
│ Estúdio                         2 │                                                  │
│ Calendário                        │ [alerta global, quando existir]                   │
│ Histórico                         │                                                  │
│ ─ Memória editorial ─             │ Conteúdo                                          │
│ Story Bank                        │                                                  │
│ Voice Profile                     │                                                  │
│ Fontes                            │                                                  │
│ Analytics                         │                                                  │
│ Notificações                    2 │                                                  │
│ Configurações                     │                                                  │
│                                   │                                                  │
│ ● Assistido                       │                                                  │
│ ✓ LinkedIn conectado              │                                                  │
└───────────────────────────────────┴──────────────────────────────────────────────────┘
```

### Mobile

```text
┌──────────────────────────────┐
│ ‹  Título               🔔 2 │
│ [alerta global]              │
│                              │
│ conteúdo em uma coluna       │
│                              │
│ [ação primária fixa]*        │
├──────────────────────────────┤
│ Hoje  Curadoria  Calend. Mais│
└──────────────────────────────┘
* somente quando não cobre conteúdo nem teclado; respeita safe area.
```

## 1. Hoje — `/hoje`

### Desktop

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Hoje · terça, 13 de outubro                  Modo: Assistido [Entender modo]        │
│ Boa tarde, Rodrigo. Você tem 2 itens que precisam de atenção.                      │
├────────────────────────────────────────────────────────────────────────────────────┤
│ PRECISA DE VOCÊ                                                                     │
│ ┌──────────────────────────────┐ ┌──────────────────────────────┐                   │
│ │ Revisar rascunho             │ │ LinkedIn expira em 7 dias   │                   │
│ │ “IA e revisão de código”     │ │ Reconecte antes de publicar │                   │
│ │ IN_REVIEW · há 18 min        │ │ [Reconectar]                 │                   │
│ │ [Abrir no Estúdio]           │ └──────────────────────────────┘                   │
│ └──────────────────────────────┘                                                    │
├────────────────────────────────────────────────────────────────────────────────────┤
│ CURADORIA DE HOJE                  5 oportunidades · pronta às 09:07                │
│ [card compacto 1] [card compacto 2] [card compacto 3]    [Ver as 5 oportunidades] │
├────────────────────────────────────────────────────────────────────────────────────┤
│ PRÓXIMAS PUBLICAÇÕES                  ESTA SEMANA                                   │
│ Qua 14 · 10:00  Título… [Abrir]       1 publicado · 1 agendado · 1 em revisão      │
│ Sex 16 · 09:30  Slot livre            [Ver calendário]                             │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Prioridade: falha crítica → cancelamento perto do fim → aprovação humana pendente → lote atual → agenda. Quando não há pendências, trocar o bloco inicial por “Tudo em dia” e a próxima ação útil.

### Mobile

```text
┌──────────────────────────────┐
│ Hoje                    🔔 2 │
│ ● Assistido                  │
│                              │
│ Precisa de você              │
│ ┌──────────────────────────┐ │
│ │ Revisar rascunho         │ │
│ │ IA e revisão de código   │ │
│ │ [Abrir no Estúdio]       │ │
│ └──────────────────────────┘ │
│                              │
│ Curadoria de hoje       5/5 │
│ [1] [2] [3]  deslize →       │
│ [Ver as 5 oportunidades]    │
│                              │
│ Próxima publicação           │
│ Qua 14, 10:00 (São Paulo)   │
│ [Abrir calendário]           │
├──────────────────────────────┤
│ Hoje  Curadoria  Calend. Mais│
└──────────────────────────────┘
```

Cards compactos em carrossel têm alternativa “Ver as 5” e não dependem do gesto de arrastar.

## 2. Curadoria — `/curadoria`

### Desktop

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Curadoria                                       [Novo assunto] [Rodar agora]       │
│ Lote regular · 13 out, 09:07 · válido até 15 out, 09:00 · America/Sao_Paulo       │
│ [Lote atual] [Lotes anteriores]                 Pilar [Todos⌄] Fonte [Todas⌄]      │
├────────────────────────────────────────────────────────────────────────────────────┤
│ 5 oportunidades                                  1 selecionada · 4 disponíveis     │
│                                                                                    │
│ ┌───────────────────────────────┐ ┌───────────────────────────────┐                │
│ │ Card completo 01              │ │ Card completo 02              │                │
│ └───────────────────────────────┘ └───────────────────────────────┘                │
│ ┌───────────────────────────────┐ ┌───────────────────────────────┐                │
│ │ Card completo 03              │ │ Card completo 04              │                │
│ └───────────────────────────────┘ └───────────────────────────────┘                │
│ ┌───────────────────────────────┐                                                   │
│ │ Card completo 05              │                                                   │
│ └───────────────────────────────┘                                                   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Usar grade de duas colunas; nunca cinco colunas estreitas. Ordenação do ranking é preservada e anunciada como “1ª de 5”, não apenas por posição.

### Card de oportunidade — conteúdo obrigatório

```text
┌──────────────────────────────────────────────────────────────────┐
│ 1ª de 5   ● Engenharia de software    Hoje, há 4 h   Score 0,84 │
│                                                                  │
│ Agentes de IA estão mudando a revisão de código                  │
│                                                                  │
│ Novas ferramentas combinam análise estática e contexto do        │
│ repositório. A adoção cresce, mas revisão humana segue central.  │
│                                                                  │
│ Fonte                                                            │
│ MIT Technology Review · technologyreview.com ↗  +1 fonte         │
│                                                                  │
│ Público                                                          │
│ Líderes técnicos e pessoas desenvolvedoras sênior                │
│                                                                  │
│ Por que isso importa agora                                       │
│ Conecta IA aplicada a uma decisão concreta de engenharia.        │
│                                                                  │
│ Ângulo sugerido                                                  │
│ “O ganho não é remover revisão humana, é mudar onde ela começa.” │
│ Requer experiência própria: não                                  │
│                                                                  │
│ Formato sugerido: Texto + imagem             ✓ Fonte válida      │
│ [Ver fontes]             [Descartar] [Selecionar e gerar]        │
└──────────────────────────────────────────────────────────────────┘
```

Regras:

- assunto/título: até duas linhas;
- resumo: duas ou três frases; texto vindo de fonte sempre escapado;
- atualidade: data relativa + data absoluta no tooltip/foco;
- pilar: texto + cor, nunca apenas cor;
- justificativa começa por “Por que isso importa agora”;
- se abaixo do limiar, faixa no topo: `Abaixo do limiar de relevância · 0,58` e explicação;
- durante geração, ação vira `Gerando rascunho…` com progresso indeterminado e link “Abrir item”; os outros cards permanecem operáveis;
- card selecionado mostra `Rascunho pronto` + `Abrir no Estúdio`, sem perder os dados da oportunidade.

### Mobile

```text
┌──────────────────────────────┐
│ Curadoria               ⋮    │
│ Lote atual · válido até qua  │
│ 5 oportunidades             │
│ [Filtros] [Novo assunto]    │
│                              │
│ ┌──────────────────────────┐ │
│ │ 1ª de 5 · Hoje, há 4 h  │ │
│ │ Engenharia de software  │ │
│ │                          │ │
│ │ Agentes de IA estão…    │ │
│ │ Resumo em 3 linhas…     │ │
│ │                          │ │
│ │ Público: líderes…       │ │
│ │ Por que importa…        │ │
│ │ Ângulo sugerido…        │ │
│ │ Formato: Texto + imagem │ │
│ │ [Ver detalhes e fontes] │ │
│ │                          │ │
│ │ [Descartar]             │ │
│ │ [Selecionar e gerar]    │ │
│ └──────────────────────────┘ │
│ Card 2…                      │
├──────────────────────────────┤
│ Hoje  Curadoria  Calend. Mais│
└──────────────────────────────┘
```

No mobile, o card permanece integral; “Ver detalhes e fontes” usa accordion dentro do card, não modal em tela cheia.

## 3. Novo assunto — `/curadoria/novo`

```text
Desktop                                      Mobile
┌────────────────────────────────────────┐   ┌──────────────────────────────┐
│ Novo assunto                           │   │ ‹ Novo assunto               │
│ Título * [__________________________]  │   │ Título *                    │
│ Notas/ângulo [______________________]  │   │ [__________________________] │
│               [______________________] │   │ Notas/ângulo                │
│ URLs de referência                     │   │ [__________________________] │
│ [https://________________________] [+] │   │ Referências                 │
│ Pilar [Classificar automaticamente⌄]   │   │ [Adicionar URL]             │
│ Formato [Sugerir automaticamente⌄]     │   │ Pilar [Automático⌄]         │
│                                        │   │ Formato [Automático⌄]       │
│ [Cancelar]             [Gerar rascunho]│   │ [Gerar rascunho]            │
└────────────────────────────────────────┘   └──────────────────────────────┘
```

URLs são validadas individualmente. Texto inserido pelo autor pode ser marcado como “Fato informado por mim”; isso não autoriza a IA a inventar detalhes.

## 4. Estúdio — `/estudio` e `/estudio/[contentId]`

### Itens em andamento — desktop e mobile

```text
Desktop                                      Mobile
┌─────────────────────────────────────────┐  ┌──────────────────────────────┐
│ Estúdio                                 │  │ Estúdio                      │
│ 2 itens em andamento                    │  │ 2 itens em andamento         │
│ [Status: Todos⌄] [Ordenar: atenção⌄]   │  │ [Filtros]                    │
│ ┌─────────────────────────────────────┐ │  │ ┌──────────────────────────┐ │
│ │ IA e revisão…  IN_REVIEW  há 18 min│ │  │ │ IA e revisão…           │ │
│ │ ! 1 afirmação sem fonte            │ │  │ │ Em revisão · 1 pendência│ │
│ │ [Abrir no Estúdio]                 │ │  │ │ [Abrir no Estúdio]      │ │
│ └─────────────────────────────────────┘ │  │ └──────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │  │ Outro item…                 │
│ │ Postgres 18     APPROVED           │ │  │                              │
│ │ Próxima ação: agendar              │ │  │                              │
│ │ [Escolher horário]                 │ │  │                              │
│ └─────────────────────────────────────┘ │  │                              │
└─────────────────────────────────────────┘  └──────────────────────────────┘
```

Ordenação padrão: falha → cancelamento perto do fim → revisão/aprovação humana → aprovado sem horário → rascunho. Estado vazio orienta `Ir para Curadoria` ou `Novo assunto`.

### Desktop

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ‹ Curadoria   IA e revisão de código   IN_REVIEW · v4 salva 14:32   ● Assistido   │
│ Gates: ✓ fontes  ✓ voz  ! 1 afirmação sem fonte       [Descartar⋮] [Aprovar versão]│
├────────────────────────────── 58% ─────────┬────────────────────── 42% ─────────────┤
│ EDITOR                                    │ [Prévia][Hooks][Fontes][Mídia][Versões]│
│ 2.184 / 3.000 caracteres                  ├─────────────────────────────────────────┤
│ ┌───────────────────────────────────────┐ │ PRÉVIA NO LINKEDIN                     │
│ │ O melhor uso de IA na revisão…       │ │ ┌─────────────────────────────────────┐ │
│ │                                       │ │ │ Rodrigo Baroni · agora              │ │
│ │ [texto editável, parágrafos, listas] │ │ │ O melhor uso de IA na revisão…     │ │
│ │                                       │ │ │ …ver mais                           │ │
│ │ Afirmação destacada [sem fonte]      │ │ │                                     │ │
│ └───────────────────────────────────────┘ │ │ [mídia 1,91:1, se houver]           │ │
│ Salvando… / Todas as alterações salvas   │ └─────────────────────────────────────┘ │
│                                          │                                         │
│ [Regenerar com instrução]                │ Aparência aproximada. O LinkedIn pode  │
│                                          │ alterar quebras e truncamento.          │
├──────────────────────────────────────────┴─────────────────────────────────────────┤
│ Versão v4 selecionada · Editar revoga aprovação quando aplicável                   │
│ [Voltar] [Comparar versões]                      [Agendar]* [Publicar agora]*        │
└────────────────────────────────────────────────────────────────────────────────────┘
* habilitadas somente para versão aprovada e conforme o modo.
```

Painéis da coluna direita:

```text
HOOKS                         FONTES                       MÍDIA
┌─────────────────────────┐   ┌────────────────────────┐   ┌─────────────────────────┐
│ Atual: O melhor uso…    │   │ ✓ Fonte 1             │   │ Sugestão: imagem simples│
│                         │   │ MIT Tech Review ↗     │   │ [prévia]                │
│ Alternativa 1           │   │ Usada nos § 2 e 4    │   │ Alt text *              │
│ “Revisar código ficou…” │   │ [Ver trechos]         │   │ [____________________]  │
│ [Usar este hook]        │   │ [Remover da versão]   │   │ [Trocar] [Remover]      │
│                         │   │                        │   │                         │
│ Alternativas 2 e 3      │   │ ! Afirmação sem fonte│   │ Formato e tamanho       │
└─────────────────────────┘   └────────────────────────┘   └─────────────────────────┘

VERSÕES
┌──────────────────────────────────────────────────────────────────────────────┐
│ v4 · Rodrigo · agora · atual       [Comparar com…⌄]                          │
│ v3 · IA · 14:20 · “mais curto”     [Ver] [Restaurar como nova versão]       │
│ v2 · Rodrigo · 14:14               [Ver] [Restaurar como nova versão]       │
└──────────────────────────────────────────────────────────────────────────────┘
```

Regenerar abre diálogo com instrução opcional, resumo de que uma nova versão será criada e botão `Regenerar`. Aprovar abre um resumo de versão, gates, fontes e idioma. `Publicar agora` sempre usa confirmação explícita com versão e destino, mesmo no Piloto automático completo quando acionado manualmente.

### Mobile

```text
┌──────────────────────────────┐
│ ‹ Estúdio       IN_REVIEW ⋮  │
│ v4 · Salvo 14:32             │
│ ✓ fontes ✓ voz ! 1 pendência │
│ [Editor] [Apoio]             │
├──────────────────────────────┤
│ 2.184 / 3.000                │
│ ┌──────────────────────────┐ │
│ │ texto editável           │ │
│ │                          │ │
│ │ ! afirmação sem fonte    │ │
│ └──────────────────────────┘ │
│ Todas as alterações salvas  │
│ [Regenerar]                 │
│                              │
│ Ao escolher Apoio:          │
│ [Prévia][Hooks][Fontes] →   │
│ painel selecionado          │
├──────────────────────────────┤
│ [Aprovar esta versão]       │
└──────────────────────────────┘
```

Editor e apoio nunca aparecem lado a lado no mobile. A troca preserva cursor, scroll e texto. A barra de ação sobe acima do teclado e não encobre o último parágrafo.

## 5. Calendário — `/calendario`

### Desktop

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Calendário             [Hoje] [‹] 12–18 out [›] [Semana⌄]   [Agendar publicação]  │
│ Horários em America/Sao_Paulo (UTC−03:00)                     [Configurar janela]  │
├────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┤
│        │ Seg 12   │ Ter 13   │ Qua 14   │ Qui 15   │ Sex 16   │ Sáb 17   │ Dom 18   │
│ 09:00  │          │          │          │          │ [livre]  │          │          │
│ 10:00  │ Publicado│          │ ┌──────┐ │          │          │          │          │
│        │ Título…  │          │ │Agenda│ │          │          │          │          │
│        │          │          │ │Título│ │          │          │          │          │
│ 11:00  │          │          │ └──────┘ │          │          │          │          │
├────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┤
│ Não agendados (2)  [IN_REVIEW Título…] [APPROVED Outro título…]                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Selecionar/arrastar um item abre confirmação: título, versão, horário local, equivalente UTC, conflito/cadência e consequência. Teclado e botão “Mover” oferecem alternativa completa ao arraste.

### Mobile

```text
┌──────────────────────────────┐
│ Calendário              +    │
│ [‹] 12–18 out [›] [Hoje]    │
│ America/Sao_Paulo (UTC−03)  │
│ [Agenda] [Semana]            │
│                              │
│ SEG 12                       │
│ 10:00  ✓ Publicado · Título  │
│                              │
│ QUA 14                       │
│ 10:00  Agendado · Título     │
│         [Abrir] [Reagendar]  │
│                              │
│ SEX 16                       │
│ 09:00  + Slot livre          │
│                              │
│ Não agendados (2)            │
├──────────────────────────────┤
│ Hoje  Curadoria  Calend. Mais│
└──────────────────────────────┘
```

Agenda é a visualização padrão mobile. A grade semanal é opcional e rolável horizontalmente.

## 6. Histórico e auditoria — `/historico`

### Desktop

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Histórico                                                                          │
│ [Buscar título____] [Status: Todos⌄] [Período: 30 dias⌄] [Pilar⌄] [Limpar]        │
├────────────────────────────────────────────────────────────────────────────────────┤
│ Título                         Status       Última ação       Publicação     ⋮      │
│ IA e revisão de código        PUBLISHED    13 out, 10:00     Ver no LinkedIn ↗     │
│ Liderança em incidentes       FAILED       12 out, 09:18     [Resolver]            │
│ Postgres 18                   SCHEDULED    11 out, 15:42     14 out, 10:00         │
│                                                     [Paginação: ‹ 1 2 3 ›]        │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Detalhe `/historico/[contentId]`:

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ‹ Histórico   IA e revisão de código       PUBLISHED      [Ver no LinkedIn ↗]      │
│ Versão publicada v4 · America/Sao_Paulo · ID copiável                             │
├─────────────────────────────────┬──────────────────────────────────────────────────┤
│ LINHA DO TEMPO                  │ DETALHE DO EVENTO                                │
│ ● 10:00:07 Publicado            │ Publicado pela API oficial do LinkedIn           │
│ │ 10:00:01 Envio iniciado       │ Versão: v4 · aprovação: Rodrigo                  │
│ │ 09:32    Agendado             │ Idempotency key: •••• [Copiar]                   │
│ │ 09:31    Aprovado             │ CorrelationId: •••• [Copiar]                     │
│ │ 09:15    Rascunho gerado      │ [Abrir versão]                                  │
│ ● 09:14    Oportunidade escolhida│                                                  │
└─────────────────────────────────┴──────────────────────────────────────────────────┘
```

### Mobile

Lista vira cards. No detalhe, linha do tempo vem antes do painel; tocar em um evento expande detalhes inline. IDs técnicos ficam recolhidos sob “Detalhes para suporte”.

## 7. Story Bank — `/story-bank`

```text
Desktop                                      Mobile
┌─────────────────────────────────────────┐  ┌──────────────────────────────┐
│ Story Bank              [Nova entrada] │  │ Story Bank              +    │
│ Histórias e fatos autorizados           │  │ [Buscar] [Filtros]           │
│ [Buscar] [Pilar⌄] [Uso público⌄]       │  │                              │
│ ┌─────────────────────────────────────┐ │  │ ┌──────────────────────────┐ │
│ │ Migração sem downtime              │ │  │ │ Migração sem downtime   │ │
│ │ Engenharia · uso público           │ │  │ │ Engenharia · Público    │ │
│ │ 2 fatos com origem · usado 3 vezes │ │  │ │ 2 fatos com origem      │ │
│ │ [Abrir]                         ⋮   │ │  │ │ [Abrir]              ⋮  │ │
│ └─────────────────────────────────────┘ │  │ └──────────────────────────┘ │
└─────────────────────────────────────────┘  └──────────────────────────────┘
```

Formulário de entrada: título, história/fato, números e origem, pilar, data, `Pode usar publicamente`, anexos/links de evidência e revisão antes de salvar. “Não público” tem ícone + texto e nunca aparece como sugestão de rascunho.

## 8. Voice Profile — `/voice-profile`

### Desktop

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Voice Profile                       Versão vigente: v3 · 10 out   [Ver versões]    │
│ [Tom e intenção] [Estrutura] [Vocabulário] [Limites] [Exemplos]                    │
├────────────────────────────────────────────────────────────────────────────────────┤
│ Tom e intenção                                                                     │
│ Como deve soar?                                                                    │
│ [Direto] [Reflexivo] [Prático] [+ adicionar]                                       │
│ Orientações [__________________________________________________________________]  │
│                                                                                    │
│ Evitar                                                                             │
│ [“No mundo acelerado” ×] [promessas absolutas ×]                                   │
│                                                                                    │
│ Exemplos aprovados (3/5 recomendados)                         [Adicionar exemplo]   │
│ ┌ Post 1 · 1.842 caracteres · incluído ┐                                             │
│                                                                                    │
│ Alterações criam uma nova versão.                         [Descartar] [Salvar v4]  │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Mobile

Etapas em accordion, resumo de completude no topo e ação `Salvar nova versão` no final. Não usar wizard que impeça revisar seções anteriores.

## 9. Fontes e watchlists — `/fontes`

### Desktop

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Fontes e watchlists                                   [Importar OPML] [Adicionar]  │
│ [Fontes 12] [Watchlists 8] [Domínios permitidos 10] [Saúde]                       │
│ [Buscar________] [Estado: Todos⌄]                                                   │
├────────────────────────────────────────────────────────────────────────────────────┤
│ Fonte                 Estado      Último sucesso   Itens/sem  Peso  Ações           │
│ MIT Tech Review       ● Ativa     hoje, 08:58     14         1,2   [Testar] ⋮      │
│ Feed exemplo          ! Pausada   há 3 dias       0          1,0   [Corrigir] ⋮     │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Adicionar fonte usa sheet desktop/dialog mobile: URL → `Testar fonte` → prévia dos três itens → nome, pilar, peso e estado → `Salvar fonte`. HTML ou script nos campos é exibido como texto.

### Mobile

Abas roláveis, filtros em drawer e cada linha vira card com estado, último sucesso e menu. Ação `Adicionar fonte` permanece no cabeçalho; “Testar” tem resultado inline.

## 10. Analytics — `/analytics`

```text
Desktop                                      Mobile
┌─────────────────────────────────────────┐  ┌──────────────────────────────┐
│ Analytics         [Últimos 30 dias⌄]   │  │ Analytics                    │
│ Dados disponíveis via API oficial      │  │ [30 dias⌄]                   │
│ [2 publicados] [67% seleção] [18 min]  │  │ 2 publicados                 │
│                                         │  │ 67% lotes com seleção        │
│ Cadência semanal [gráfico de barras]    │  │ [gráfico rolável/alternativa]│
│ Funil editorial 5 → 2 → 2 → 2          │  │ Funil 5 → 2 → 2 → 2         │
│ Pilares [tabela/gráfico]                │  │                              │
│                                         │  │ Recomendação semanal         │
│ Recomendação semanal                    │  │ Dados insuficientes          │
│ “Mantenha…” [Ver evidências]            │  │ [Entender por quê]           │
└─────────────────────────────────────────┘  └──────────────────────────────┘
```

Não exibir métricas sem permissão ou suporte da API. Todo gráfico tem tabela equivalente e explicação de fonte/período. No MVP, blocos futuros dizem “Ainda não disponível” e não mostram números simulados.

## 11. Notificações — `/notificacoes`

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Notificações                                      [Marcar todas como lidas]         │
│ [Todas] [Precisam de ação 2] [Sistema] [Publicações]                                │
├────────────────────────────────────────────────────────────────────────────────────┤
│ ● Falha ao publicar “Liderança…”              agora                                │
│   LinkedIn desconectado. Reconecte e reagende.         [Resolver]                  │
│ ● Rascunho pronto                               há 18 min                          │
│   “IA e revisão de código” aguarda revisão.             [Abrir Estúdio]            │
│   Curadoria pronta                               hoje, 09:07                        │
│   Cinco oportunidades disponíveis.                      [Ver Curadoria]            │
└────────────────────────────────────────────────────────────────────────────────────┘
```

No mobile, mesma lista em uma coluna; filtros abrem sheet. Ler não resolve automaticamente. Eventos que precisam de ação permanecem em “Precisam de ação” até o problema ser resolvido ou dispensado explicitamente.

## 12. Configurações — `/configuracoes`

### Visão geral

```text
┌──────────────────────────────┬─────────────────────────────────────────────────────┐
│ Autonomia                    │ Configurações                                       │
│ Integrações                  │ Resumo                                               │
│  ├ LinkedIn                  │ ● Assistido · padrão                                │
│  └ Telegram                  │ ✓ LinkedIn conectado · expira em 42 dias            │
│ Preferências editoriais      │ ✓ Telegram conectado · última entrega hoje          │
│ Publicação e timezone        │ America/Sao_Paulo · máx. 1 post/dia                 │
└──────────────────────────────┴─────────────────────────────────────────────────────┘
```

No mobile, as subseções são uma lista; cada item abre uma rota com botão voltar.

### Autonomia — `/configuracoes/autonomia`

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Modo de autonomia                                                                  │
│ Define o que acontece sem você. Guardrails continuam ativos em todos os modos.     │
│                                                                                    │
│ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐                     │
│ │ ● ASSISTIDO      │ │ PILOTO AUTOMÁTICO│ │ PILOTO AUTOMÁTICO│                     │
│ │ Humano aprova    │ │ CONTROLADO       │ │ COMPLETO         │                     │
│ │ todas as etapas. │ │ Autoaprova e     │ │ Autoaprova e     │                     │
│ │ Atual · padrão   │ │ agenda; cancelar │ │ agenda sem janela│                     │
│ │                  │ │ em 60 min.       │ │ de cancelamento. │                     │
│ │                  │ │ [Selecionar]     │ │ [Selecionar]     │                     │
│ └──────────────────┘ └──────────────────┘ └──────────────────┘                     │
│                                                                                    │
│ Comparar o que é automático [tabela seleção/geração/aprovação/agendamento]         │
│ Guardrails ativos            [Ver e editar política v3]                            │
│ Janela de cancelamento       60 min no Piloto automático controlado                 │
│ Chave da política            `cancel_window_minutes`                                │
│ Mídia                        Sempre exige aprovação humana                           │
│ Última alteração             02 out, por Rodrigo [Ver auditoria]                   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Subir o nível abre confirmação com lista concreta das novas ações automáticas e reautenticação. Descer aplica imediatamente e lista itens cuja aprovação automática será revogada. O modo atual nunca é representado somente por cor. O Piloto automático completo declara explicitamente “sem janela de cancelamento”; mídia sempre retorna para aprovação humana.

### LinkedIn OAuth — `/configuracoes/integracoes/linkedin`

```text
┌──────────────────────────────────────────────────────────────────┐
│ LinkedIn                                                       │
│ ✓ Conectado como Rodrigo Baroni                                │
│ Permissão de publicação: ativa                                 │
│ Token: armazenado com segurança · expira em 42 dias            │
│ Última verificação: hoje, 13:40                                │
│ [Verificar conexão] [Reconectar] [Desconectar]                 │
│                                                                │
│ O LinkedIn Ops usa apenas OAuth e APIs oficiais.               │
└──────────────────────────────────────────────────────────────────┘
```

Nunca mostrar token, escopos sensíveis brutos ou segredo. “Desconectar” explica impacto nos itens agendados e exige confirmação.

### Telegram — `/configuracoes/integracoes/telegram`

```text
┌──────────────────────────────────────────────────────────────────┐
│ Telegram                                                       │
│ 1. Abra o bot oficial [Abrir Telegram ↗]                       │
│ 2. Envie /start e copie o código de uso único                  │
│ 3. Código [______] [Vincular]                                 │
│                                                                │
│ ✓ Chat vinculado · @r••••••                                   │
│ [Enviar teste] [Desvincular]                                  │
│                                                                │
│ Notificar sobre                                                │
│ [x] Curadoria pronta   [x] Rascunho pronto   [x] Falhas       │
│ [x] Agendamento       [x] Publicação         [ ] Resumo       │
│ [x] Silêncio 22:00–07:00, exceto falhas                       │
│                                                    [Salvar]    │
└──────────────────────────────────────────────────────────────────┘
```

Copy persistente: “O Telegram envia avisos e links. Aprovações e edições continuam no dashboard.”

## 13. Diálogos críticos

### Aprovar versão

```text
Aprovar a versão v4?
✓ 3 fontes vinculadas  ✓ voz  ! 1 aviso não bloqueante  PT-BR
Depois de aprovada, qualquer edição revogará esta aprovação.
[Cancelar] [Aprovar esta versão]
```

### Agendar

```text
Agendar “IA e revisão de código”
Versão v4 · aprovada por Rodrigo
Data [14/10/2026] Hora [10:00]
America/Sao_Paulo (UTC−03:00) · equivalente: 13:00 UTC
! Limite diário: este será o único post do dia.
[Cancelar] [Confirmar agendamento]
```

### Publicar agora

```text
Publicar agora no LinkedIn?
Versão v4 · perfil Rodrigo Baroni · texto + 1 imagem
Esta ação envia conteúdo pela API oficial. O resultado pode levar alguns segundos.
[Cancelar] [Publicar agora]
```

Após confirmar, mostrar `Enviando… Não feche esta página` sem permitir segundo clique. Se houver resultado incerto, usar `Confirmando publicação…` e bloquear nova tentativa até reconciliação.

## Perguntas abertas

- **[DECISÃO RODRIGO]** Cards de código entram no MVP? Se não, a aba Mídia aceita apenas upload/sugestão de imagem nesta fase.
- **[DECISÃO RODRIGO]** A entrevista guiada do Story Bank entra no MVP ou fica para Fase 2? O wireframe atual cobre o cadastro manual.
- **[DECISÃO RODRIGO]** Selecionar múltiplas oportunidades deve ser permitido no mesmo lote? O wireframe assume que sim e mostra aviso de cadência.
- **[DECISÃO RODRIGO]** O fallback de publicação manual será suportado? Se aprovado, Histórico e Estúdio precisarão da ação “Marcar como publicado manualmente”, com URL e auditoria.

