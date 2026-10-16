# Mapa de navegação — LinkedIn Ops

- Versão: 0.1 (Onda 1)
- Data: 2026-10-13
- Responsável: Aurora (Product Design)
- Referências: `../prd.md`, `../user-journeys.md`, `../mvp-scope.md`
- Idioma da interface: PT-BR

## Princípios

1. **O trabalho de hoje primeiro.** A entrada padrão responde “o que precisa de mim agora?” e leva da curadoria à publicação.
2. **Estado e consequência visíveis.** Status do conteúdo, modo de autonomia, timezone e saúde das integrações aparecem antes de ações irreversíveis.
3. **Uma fonte de verdade.** Aprovação, edição e auditoria acontecem no dashboard. Telegram apenas notifica e abre links profundos.
4. **Divulgação progressiva.** Configurações avançadas e evidências técnicas ficam disponíveis sem competir com a tarefa editorial.
5. **Rotas persistentes.** Filtros, aba do Estúdio e período do calendário usam query string para suportar voltar, atualizar e compartilhar links internos.

## Arquitetura de informação

```text
LinkedIn Ops
├── Hoje                         /hoje
│   ├── Pendências do dia
│   ├── Curadoria atual (até 5 oportunidades)
│   └── Próximas publicações
├── Curadoria                    /curadoria
│   ├── Lote atual               /curadoria?lote=atual
│   ├── Lotes anteriores         /curadoria?lote=anteriores
│   └── Novo assunto             /curadoria/novo
├── Estúdio                      /estudio
│   ├── Itens em andamento       /estudio
│   └── Item                     /estudio/[contentId]
│       ├── Prévia               ?painel=previa
│       ├── Hooks                ?painel=hooks
│       ├── Fontes               ?painel=fontes
│       ├── Mídia                ?painel=midia
│       └── Versões              ?painel=versoes
├── Calendário                   /calendario?visao=semana&data=YYYY-MM-DD
├── Histórico                    /historico
│   └── Item e auditoria         /historico/[contentId]
├── Memória editorial
│   ├── Story Bank               /story-bank
│   │   ├── Nova entrada         /story-bank/nova
│   │   └── Editar entrada       /story-bank/[storyId]
│   └── Voice Profile            /voice-profile
│       └── Versões              /voice-profile?painel=versoes
├── Fontes e watchlists          /fontes
├── Analytics                    /analytics
├── Notificações                 /notificacoes
└── Configurações                /configuracoes
    ├── Autonomia                /configuracoes/autonomia
    ├── LinkedIn OAuth           /configuracoes/integracoes/linkedin
    ├── Telegram                 /configuracoes/integracoes/telegram
    ├── Preferências editoriais  /configuracoes/editorial
    └── Publicação e timezone    /configuracoes/publicacao
```

## Navegação global

### Desktop (≥ 1024 px)

Barra lateral fixa de 256 px, recolhível para 72 px. Ordem:

1. Hoje
2. Curadoria
3. Estúdio — exibe um indicador com a quantidade de itens em andamento e abre a lista ordenada por ação necessária
4. Calendário
5. Histórico
6. separador “Memória editorial”: Story Bank, Voice Profile
7. Fontes
8. Analytics
9. Notificações — badge apenas para não lidas
10. Configurações

No rodapé da barra lateral:

- modo atual: `Assistido`, `Piloto automático controlado` ou `Piloto automático completo`;
- conexão LinkedIn: `Conectado`, `Atenção` ou `Desconectado`;
- menu do usuário.

O cabeçalho contextual contém breadcrumb, título, descrição curta, ações da tela e central de notificações. Alertas globais críticos — LinkedIn desconectado, falha de publicação ou aprovação automática que exige revisão — ficam abaixo do cabeçalho e não desaparecem ao trocar de tela.

### Mobile (< 768 px)

Barra inferior com quatro destinos e rótulos sempre visíveis:

- Hoje;
- Curadoria;
- Calendário;
- Mais.

“Mais” abre um drawer com Estúdio, Histórico, Story Bank, Voice Profile, Fontes, Analytics, Notificações e Configurações. O topo mostra título, voltar quando aplicável e sino de notificações. O modo de autonomia aparece como linha persistente no drawer e como badge nas telas em que altera o comportamento.

### Tablet (768–1023 px)

Usa barra lateral recolhida (ícone + tooltip) e o mesmo conteúdo responsivo do desktop. O Estúdio alterna entre editor e painel de apoio, sem dividir a largura em duas colunas estreitas.

## Rotas e objetivo de cada tela

| Rota | Objetivo | Ação primária | Entrada mais comum | Saída esperada |
|---|---|---|---|---|
| `/hoje` | Resumir pendências, lote atual e agenda | `Revisar oportunidades` ou ação pendente prioritária | login/notificação | Curadoria, Estúdio ou Calendário |
| `/curadoria` | Comparar as cinco oportunidades do lote | `Selecionar e gerar rascunho` | Hoje/TG “curadoria pronta” | Estúdio durante/após geração |
| `/curadoria/novo` | Iniciar conteúdo por assunto manual | `Gerar rascunho` | Curadoria/Hoje | Estúdio |
| `/estudio` | Priorizar rascunhos e itens em andamento | `Abrir no Estúdio` | sidebar/Hoje | item do Estúdio |
| `/estudio/[contentId]` | Editar, provar, versionar, aprovar e encaminhar | muda por estado: `Aprovar`, `Agendar`, `Publicar` | card selecionado/notificação | Calendário ou Histórico |
| `/calendario` | Visualizar, agendar e reagendar | `Agendar publicação` | Estúdio/sidebar | Estúdio ou confirmação |
| `/historico` | Localizar conteúdo e resultado anteriores | `Ver detalhes` | sidebar | auditoria do item |
| `/historico/[contentId]` | Explicar o que ocorreu, quando e por quê | `Abrir versão publicada` | Histórico/alerta | Estúdio somente quando recuperável |
| `/story-bank` | Gerenciar fatos e histórias autorizados | `Nova entrada` | Memória/Estúdio | entrada salva/versionada |
| `/voice-profile` | Definir tom, estrutura e limites de voz | `Salvar nova versão` | Memória/onboarding | perfil vigente |
| `/fontes` | Configurar feeds, domínios e watchlists | `Adicionar fonte` | sidebar/erro de curadoria | fonte validada e ativa |
| `/analytics` | Entender cadência e sinais disponíveis | `Ver recomendação semanal` | sidebar | decisão editorial; sem automação implícita |
| `/notificacoes` | Ver alertas internos e recuperar falhas | `Abrir item` | sino/sidebar | tela relacionada |
| `/configuracoes/autonomia` | Entender e alterar o que o sistema faz sozinho | `Alterar modo` | badge global/settings | política versionada e auditada |
| `/configuracoes/integracoes/linkedin` | Conectar/reconectar OAuth oficial | `Conectar LinkedIn` | onboarding/alerta | integração saudável |
| `/configuracoes/integracoes/telegram` | Vincular chat e preferências | `Vincular Telegram` | onboarding/settings | teste recebido |
| `/configuracoes/editorial` | Editar pilares, públicos e temas sensíveis | `Salvar alterações` | settings | política editorial atualizada |
| `/configuracoes/publicacao` | Definir timezone, janelas e cadência | `Salvar alterações` | settings/calendário | regra versionada |

## Fluxos prioritários

### 1. Ciclo assistido (padrão)

```text
/hoje
  → /curadoria (comparar 5)
  → selecionar oportunidade
  → geração assíncrona
  → /estudio/:id (editar e revisar fontes)
  → aprovar versão
  → /calendario (confirmar data + America/Sao_Paulo)
  → /estudio/:id ou /historico/:id (acompanhar publicação)
```

Não há atalho “gerar todas”. Selecionar uma oportunidade cria apenas o rascunho correspondente. Voltar à Curadoria preserva o progresso dos demais cards.

### 2. Piloto automático controlado

```text
Sistema seleciona + gera + aprova automaticamente + agenda
  → /hoje mostra “Publicação automática agendada”
  → /estudio/:id explica a aprovação e o horário
  → janela de cancelamento de cancel_window_minutes (padrão: 60 min)
  → Rodrigo pode Cancelar, Editar ou Reagendar antes do fim da janela
```

O sistema notifica a decisão automática e o limite para cancelamento. Conteúdo com mídia sempre exige aprovação humana e não segue para publicação automática.

### 3. Piloto automático completo

```text
Sistema seleciona + gera + aprova por política + agenda
  → /hoje e notificação mostram a decisão automática e o horário
  → /estudio/:id explica gates e razão da aprovação
  → publicação segue sem janela de cancelamento
```

Qualquer gate bloqueante reprovado termina em `IN_REVIEW`, nunca em publicação forçada. Conteúdo com mídia sempre exige aprovação humana, inclusive neste modo.

### 4. Recuperação de falha de publicação

```text
Alerta global / Notificação
  → /historico/:id ou /estudio/:id
  → causa em linguagem simples + correlationId copiável
  → Editar, Reconectar LinkedIn, Reagendar ou Tentar novamente
```

`Tentar novamente` reutiliza a tentativa idempotente; a UI nunca sugere “publicar outra vez” enquanto o resultado anterior estiver sendo reconciliado.

## Regras de navegação e segurança

- Links profundos exigem sessão e retornam ao destino original depois do login.
- Conteúdo externo não vira HTML executável; títulos, resumos e trechos são texto escapado.
- Links de fontes abrem em nova aba, com indicação acessível “abre em nova aba”.
- Ao sair do Estúdio com alterações ainda não salvas, bloquear a navegação com diálogo. Depois de salvo, sair não exige confirmação.
- Editar uma versão `APPROVED` ou `SCHEDULED` exige confirmação porque revoga aprovação e pode liberar o slot.
- “Descartar” usa diálogo com consequência e permite desfazer enquanto o lote ainda estiver válido.
- Voltar do Estúdio retorna à origem registrada (`Hoje`, `Curadoria`, `Calendário` ou `Histórico`), com fallback para `/hoje`.

## Hipóteses adotadas nesta versão

- `Hoje` é a home operacional; `Curadoria` guarda comparação do lote atual e acesso a lotes anteriores.
- Analytics entra no mapa desde o início, mas no MVP mostra apenas eventos e dados realmente disponíveis; recomendações avançadas ficam sinalizadas como “Em breve”, sem telas falsas.
- O Estúdio tem URL por item e abas em query string; isso torna notificações e suporte mais precisos.
- Configurações de integrações são separadas para que falhas de OAuth não se confundam com preferências editoriais.

## Perguntas abertas

- **[DECISÃO RODRIGO]** Quando houver menos de cinco candidatos acima do limiar, prefere ver cinco cards com os inferiores claramente marcados ou somente os aprovados pelo limiar?
- **[DECISÃO RODRIGO]** É permitido selecionar mais de uma oportunidade do mesmo lote? A hipótese atual é “sim”, com aviso de cadência.
- **[DECISÃO RODRIGO]** Se a permissão oficial de publicação atrasar, haverá fallback “copiar e marcar como publicado manualmente”? A navegação não inclui esse caminho até decisão.

