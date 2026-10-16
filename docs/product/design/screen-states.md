# Estados de tela e conteúdo — LinkedIn Ops

- Versão: 0.1
- Data: 2026-10-13
- Responsável: Aurora (Product Design)
- Referências: `../prd.md`, `../user-journeys.md`, `wireframes.md`

## Regras comuns

- **Loading preserva contexto:** usar skeleton com a mesma geometria do conteúdo; nunca substituir toda a aplicação por spinner.
- **Erro explica e recupera:** título em linguagem simples, o que foi preservado, ação principal e `correlationId` recolhido em “Detalhes para suporte”.
- **Empty não é erro:** explica por que não há dados e oferece uma próxima ação possível.
- **Sucesso não depende só de toast:** atualiza o estado persistente na tela. Toast confirma ações curtas; transições críticas também aparecem no item/linha do tempo.
- **Atualização parcial:** falha de um painel não apaga os demais. Ex.: Analytics indisponível não impede o Estúdio.
- **Conteúdo assíncrono:** ações ficam desabilitadas somente no escopo afetado; `aria-live="polite"` anuncia progresso e conclusão.
- **Dados externos:** títulos, resumos e trechos são texto escapado. Nunca renderizar HTML recebido de fontes.
- **Tempo:** toda data relativa tem data/hora absoluta acessível. Agendamentos sempre mostram `America/Sao_Paulo` e offset atual.

## Matriz por tela

| Tela | Empty | Loading | Error | Success |
|---|---|---|---|---|
| **Hoje** | “Tudo em dia. A próxima curadoria será qua, 14 out, às 09:00.” + `Novo assunto`; se instalação nova, checklist de LinkedIn, fontes e Voice Profile | skeleton de 2 pendências, resumo da curadoria e agenda; cabeçalho/nav continuam ativos | alerta por bloco; erro geral: “Não foi possível montar seu resumo” + `Tentar novamente`; não esconder alertas críticos já conhecidos | pendências ordenadas por urgência, lote atual e próxima publicação; toast somente após ação originada nesta tela |
| **Curadoria** | Sem lote: “A curadoria ainda não rodou” + próximo horário + `Rodar agora`; lote válido sem candidatos: explicar filtros/fontes sem inventar cards | cinco skeletons numerados; após seleção, loading apenas no card: “Gerando rascunho…” | ciclo falhou: causa resumida + `Tentar novamente`; lote incompleto nunca é apresentado como completo; falha ao selecionar mantém o card disponível | lote com 5 cards quando houver candidatos; contador `0–5 selecionadas`; card escolhido vira `Gerando` e depois `Abrir no Estúdio` |
| **Novo assunto** | formulário limpo com exemplo de ajuda, sem dados pré-preenchidos que pareçam fato do autor | ao validar URL, loading inline por URL; ao gerar, formulário fica somente leitura e mostra destino | erro por campo; falha da geração preserva o formulário + `Tentar gerar novamente` | item criado e redirecionado ao Estúdio; toast “Assunto criado. Estamos gerando o rascunho.” |
| **Estúdio** | rota sem versão durante geração: painel “Gerando o primeiro rascunho” com etapas; sem item válido: 404 contextual + `Voltar para Hoje` | skeleton apenas ao trocar painel; autosave mostra `Salvando…`; regeneração preserva versão atual e mostra progresso separado | geração: “Não foi possível gerar; seu item foi preservado”; autosave: faixa persistente `Não salvo` + `Tentar novamente`/copiar texto; conflito mostra diff; erro de fonte não apaga texto | `Todas as alterações salvas`; versão criada na timeline; aprovação/agendamento refletidos no status e na ação seguinte |
| **Calendário** | “Nenhuma publicação nesta semana” + itens aprovados/não agendados + `Agendar`; se nenhum item, `Ir para Curadoria` | skeleton da grade/lista; reagendamento mantém card fantasma no slot original até confirmar | falha ao carregar deixa lista “não agendados” se disponível; conflito de slot inline; falha ao reagendar retorna visualmente ao slot anterior | item aparece no slot, com status e timezone; toast “Agendado para qua, 14 out, 10:00 (America/Sao_Paulo)” |
| **Histórico** | “Nenhum item corresponde aos filtros” + `Limpar filtros`; instalação nova: explicar que o histórico aparecerá após selecionar uma oportunidade | skeleton de linhas/cards; filtros continuam utilizáveis quando dados locais estão disponíveis | “Não foi possível carregar o histórico” + retry; export/filtro com erro fica isolado | resultados com total, filtros refletidos na URL e paginação; ações específicas por status |
| **Auditoria do item** | item sem eventos é inconsistência: mensagem de erro, não empty | skeleton da timeline e detalhe | evento indisponível: manter cabeçalho/status; mostrar `Tentar novamente`; IDs só em detalhes de suporte | timeline cronológica completa, ator, versão, modo/política, horário e razão de decisões automáticas |
| **Story Bank** | “Seu Story Bank está vazio” + explicação de autenticidade + `Nova entrada`; entrevista guiada somente se entrar no escopo | skeleton de cards/linhas; salvar mostra estado no botão | validação inline; falha ao salvar preserva todos os campos; entrada não encontrada → voltar à lista | card salvo com visibilidade `Público`/`Não público`, origem dos fatos e data; nova versão indicada |
| **Voice Profile** | onboarding com seções essenciais e indicação “Você poderá editar depois”; sem bloquear o restante do produto, mas alertar qualidade | skeleton das seções; salvar nova versão não bloqueia leitura | falha ao salvar preserva campos + opção de copiar; exemplo inválido marcado inline | cabeçalho `Versão vigente vN`; timestamp, completude e histórico de versões atualizados |
| **Fontes** | “Adicione fontes para a primeira curadoria” + `Adicionar fonte`; watchlist vazia tem CTA próprio | tabela/cards skeleton; teste de feed tem progresso inline com nome da etapa | falha geral preserva alertas de saúde conhecidos; feed inválido explica o motivo; após 5 falhas, `Pausada automaticamente` + `Corrigir` | fonte testada mostra 3 itens recentes; salvar inclui estado `Ativa`; saúde/último sucesso visíveis |
| **Analytics** | “Ainda não há dados suficientes” + requisito legível, por exemplo “publique 2 posts”; sem gráficos zerados enganosos | skeleton mantém títulos/período; tabela alternativa carrega junto | aviso “Alguns dados não puderam ser carregados”; identifica período e fonte; demais métricas continuam | período, fonte dos dados, atualização e tabelas equivalentes aos gráficos; recomendação liga para evidências |
| **Notificações** | “Você não tem notificações” ou “Nenhuma precisa de ação”; link para preferências | skeleton de lista, filtros ativos | “Não foi possível atualizar”; manter cache com rótulo “Dados de hh:mm” | contador de não lidas sincronizado; ação abre destino; marcar como lida tem confirmação visual |
| **Configurações** | não aplicável à visão geral; integração não configurada usa empty específico | skeleton das integrações; nunca mostrar falso `Desconectado` antes de carregar | erro por seção com retry; salvar falhou preserva valores; nenhuma mudança visual como se tivesse salvo | valor persistido, `Salvo` + horário; alterações de política mostram nova versão e link para auditoria |
| **LinkedIn OAuth** | `LinkedIn não conectado` + benefícios/limites + `Conectar com LinkedIn` | retorno OAuth: “Confirmando conexão…”; bloquear cliques repetidos | acesso negado, state inválido, escopo ausente ou token expirado têm mensagens distintas; nunca mostrar token | identidade conectada, permissões relevantes em linguagem simples, expiração e última verificação |
| **Telegram** | passos 1–3 para vínculo; copy “Telegram só notifica” | ao vincular/testar: progresso inline e botão desabilitado | código inválido/expirado, chat não autorizado ou falha de entrega com correção específica | chat mascarado, último teste entregue e preferências ativas; conteúdo sensível nunca exibido |
| **Autonomia** | instalação nova já inicia em `Assistido`; não existe estado sem seleção | ao alterar: modo antigo continua marcado até resposta; diálogo mostra `Confirmando…` | falha mantém modo anterior, explica que nenhuma automação mudou | novo modo, policyVersion, horário e efeitos nos itens existentes; ao descer, lista aprovações revogadas |

## Estados do card de oportunidade

| Estado visual | Conteúdo/ação | Comportamento |
|---|---|---|
| Disponível | todos os campos + `Selecionar e gerar` + `Descartar` | ações independentes por card |
| Abaixo do limiar | faixa amarela, score e motivo + mesmas ações manuais | nunca ocultar a ressalva; não selecionar automaticamente |
| Selecionando | botão `Selecionando…`; card `aria-busy=true` | impedir duplo clique; demais cards continuam ativos |
| Gerando | progresso indeterminado, início e `Abrir item` | manter os dados da oportunidade visíveis |
| Rascunho pronto | badge `Rascunho pronto` + `Abrir no Estúdio` | seleção continua registrada |
| Descartado | card reduzido, motivo e `Desfazer` enquanto permitido | não remover imediatamente da ordem, evitando perda de contexto |
| Expirado | somente leitura + data de expiração + `Reativar` quando suportado | diferenciar de descartado |
| Falhou ao gerar | mensagem, `Tentar novamente`, `Ver detalhes` | oportunidade permanece selecionada; nenhuma versão parcial |

## Ciclo de vida do conteúdo

Os sete estados abaixo são o vocabulário principal mostrado ao usuário. Estados técnicos auxiliares do domínio (`SELECTED`, `GENERATING`, `DISCARDED`) aparecem como mensagens de atividade, não como jargão obrigatório no badge.

```text
DRAFT → IN_REVIEW → APPROVED → SCHEDULED → PUBLISHING → PUBLISHED
            ↑            │          │            └────→ FAILED
            └────────────┴──────────┘ (edição revoga aprovação/agendamento)
```

| Estado | Rótulo PT-BR | Definição visível | Ações principais | Restrições e avisos |
|---|---|---|---|---|
| `DRAFT` | **Rascunho** | primeira ou nova versão existe, ainda não entrou em revisão formal | `Abrir no Estúdio`, `Regenerar`, `Descartar` | geração completa; nenhuma publicação possível |
| `IN_REVIEW` | **Em revisão** | versão está sendo editada/revisada ou requer intervenção humana | `Editar`, `Regenerar`, `Aprovar esta versão`, `Descartar` | mostrar gates; bloqueios explicam correção; mídia sempre exige aprovação humana em qualquer modo |
| `APPROVED` | **Aprovado** | uma versão específica foi aprovada por Rodrigo ou por política | `Agendar`, `Publicar agora` quando permitido, `Editar`, `Descartar` | mostrar `Aprovado por` e razão; editar revoga aprovação após confirmação |
| `SCHEDULED` | **Agendado** | versão aprovada tem data/hora e timezone explícito | `Reagendar`, `Desagendar`, `Editar`, `Descartar` | mostrar horário local + timezone; editar revoga e desagenda; no Piloto automático controlado, mostrar prazo de cancelamento; no Piloto automático completo, informar que não há janela |
| `PUBLISHING` | **Publicando** | envio/reconciliação com LinkedIn em andamento | `Acompanhar`; nenhuma ação duplicada | texto: “Não tente publicar novamente”; mostrar tentativas sem expor segredo |
| `PUBLISHED` | **Publicado** | LinkedIn confirmou e a referência da publicação foi salva | `Ver no LinkedIn`, `Copiar link`, `Ver auditoria` | estado terminal no MVP; não prometer exclusão remota |
| `FAILED` | **Falha na publicação** | retries terminaram ou uma correção humana é necessária | varia: `Reconectar`, `Editar`, `Reagendar`, `Tentar novamente`, `Descartar` | causa legível, versão preservada e garantia explícita contra duplicação; retry só após reconciliação |

### Estados técnicos auxiliares

| Estado técnico | Apresentação | Observação |
|---|---|---|
| `SELECTED` | “Oportunidade selecionada. Preparando geração…” | dura pouco; link para item |
| `GENERATING` | “Gerando rascunho…” | falha volta a uma tela recuperável, sem versão parcial |
| `DISCARDED` | “Descartado” | fica no histórico; `Desfazer` apenas quando a regra permitir |

### Copy de transições críticas

- Editar aprovado: **“Editar cria uma nova versão e revoga a aprovação da v4. Continuar?”**
- Editar agendado: **“Editar cria uma nova versão, revoga a aprovação e libera o horário de qua, 14 out, 10:00. Continuar?”**
- Durante publicação: **“Confirmando a publicação com o LinkedIn. Não tente novamente enquanto verificamos o resultado.”**
- Falha recuperável: **“O texto e a versão v4 estão preservados. Corrija a conexão e reagende.”**
- Aprovação automática: **“Aprovado automaticamente pela política v3. Veja os 10 guardrails avaliados.”**

## Aparência do modo de autonomia

### Padrão global

O modo aparece:

1. no rodapé da sidebar desktop e no drawer mobile;
2. no cabeçalho de Hoje, Curadoria e Estúdio;
3. em qualquer decisão automática registrada na linha do tempo;
4. nos alertas da janela de cancelamento do piloto automático controlado;
5. na confirmação de ação cujo comportamento muda pelo modo.

Formato do badge: ícone + rótulo textual. Cores são apoio, nunca o único identificador.

| Modo | Badge | Mensagem curta | O que a UI enfatiza |
|---|---|---|---|
| Assistido | `◉ Assistido` | “Você aprova todas as etapas.” | ações humanas primárias; sugestões não parecem decisões tomadas |
| Piloto automático controlado | `◐ Controlado` | “O sistema aprova e agenda; você pode cancelar antes do prazo.” | razão da política, horário, notificação e contagem de `cancel_window_minutes` (padrão: 60) |
| Piloto automático completo | `◆ Completo` | “O sistema aprova e agenda sem janela de cancelamento.” | razão da política e indicação explícita de que não há prazo de cancelamento; mídia continua humana |

### Faixas contextuais

- **Piloto automático controlado / cancelamento disponível:** “Publicação automática às 10:00. Você pode cancelar até 09:00 (60 min).” A contagem é complemento; data/hora absoluta permanece.
- **Piloto automático controlado / prazo encerrado:** “A janela de cancelamento terminou. A publicação automática está sendo processada.”
- **Piloto automático completo / agendado automaticamente:** “Publicação automática às 10:00, sem janela de cancelamento.”
- **Piloto automático / gate falhou:** “A automação parou: 1 afirmação está sem fonte. Nada será publicado até sua revisão.”
- **Qualquer modo / mídia:** “Esta publicação inclui mídia e exige sua aprovação antes de agendar ou publicar.”
- **Modo rebaixado:** “3 aprovações automáticas foram revogadas e voltaram para revisão.” + lista de itens.

### Alteração de modo

- Subir de nível exige diálogo com diferenças concretas, confirmação e reautenticação definida por Segurança.
- O botão final nomeia a consequência: `Ativar Piloto automático controlado` / `Ativar Piloto automático completo`.
- Descer é imediato após confirmação simples e apresenta itens afetados antes de concluir quando possível.
- Itens existentes não são promovidos retroativamente ao subir.
- A interface não usa toggle binário para uma decisão de três níveis.

## Severidade de feedback

| Nível | Uso | Persistência | Exemplo |
|---|---|---|---|
| Informação | contexto sem ação urgente | inline; dismiss opcional | “Próxima curadoria qua às 09:00” |
| Sucesso | ação concluída | toast + estado persistente | “Versão v4 aprovada” |
| Atenção | risco/correção não bloqueante | inline até resolvido/dispensado | “1 afirmação sem fonte” em ação manual |
| Erro | ação falhou, dados preservados | inline/banner persistente | “Não foi possível salvar; copie ou tente novamente” |
| Crítico | risco de publicação/integração | alerta global + notificação | “LinkedIn desconectado; publicações suspensas” |

## Perguntas abertas

- **[DECISÃO RODRIGO]** Quando há menos de cinco candidatos acima do limiar, mostrar cards abaixo do limiar ou menos de cinco? Os estados cobrem ambos; a Curadoria assume a primeira opção.
- **[DECISÃO RODRIGO]** Permitir “marcar como publicado manualmente” caso OAuth não esteja disponível? Sem decisão, `PUBLISHED` exige confirmação da API oficial.

