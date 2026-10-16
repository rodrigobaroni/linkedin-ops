import type { Route } from "next";

/**
 * Placeholder copy per screen, taken from docs/product/design/screen-states.md.
 * Only navigational actions are offered here: functional actions arrive with each epic.
 */
export type ScreenAction = { label: string; href: Route };

export type ScreenDefinition = {
  /** Document title and `h1`. */
  title: string;
  /** Short description under the title. */
  description: string;
  /** Parent breadcrumb entry, when the screen is nested. */
  parent?: { label: string; href: Route };
  empty: {
    title: string;
    description: string;
    action?: ScreenAction;
  };
};

export const screens = {
  hoje: {
    title: "Hoje",
    description: "O que precisa de você agora: pendências, lote atual e próximas publicações.",
    empty: {
      title: "Tudo em dia",
      description:
        "A curadoria roda às segundas, quartas e sextas, às 09:00 (America/Sao_Paulo). Quando houver oportunidades ou pendências, elas aparecem aqui.",
      action: { label: "Ver Curadoria", href: "/curadoria" },
    },
  },
  curadoria: {
    title: "Curadoria",
    description: "Compare as cinco oportunidades do lote e escolha o que vira rascunho.",
    empty: {
      title: "A curadoria ainda não rodou",
      description:
        "O próximo lote chega na próxima segunda, quarta ou sexta, às 09:00 (America/Sao_Paulo). Nenhum card é inventado antes disso.",
    },
  },
  estudio: {
    title: "Estúdio",
    description: "Rascunhos e itens em andamento, ordenados pela ação necessária.",
    empty: {
      title: "Nenhum item em andamento",
      description: "Selecione uma oportunidade na Curadoria para gerar o primeiro rascunho.",
      action: { label: "Ir para Curadoria", href: "/curadoria" },
    },
  },
  estudioItem: {
    title: "Item do Estúdio",
    description: "Editar, provar, versionar, aprovar e encaminhar um conteúdo.",
    parent: { label: "Estúdio", href: "/estudio" },
    empty: {
      title: "Nenhuma versão disponível",
      description:
        "O editor, a prévia, os hooks, as fontes e as versões deste item chegam em breve. Nada foi gerado para este item ainda.",
      action: { label: "Voltar para o Estúdio", href: "/estudio" },
    },
  },
  calendario: {
    title: "Calendário",
    description: "Visualize, agende e reagende publicações em America/Sao_Paulo.",
    empty: {
      title: "Nenhuma publicação agendada nesta semana",
      description: "Aprove uma versão no Estúdio para escolher um horário.",
      action: { label: "Ir para Curadoria", href: "/curadoria" },
    },
  },
  historico: {
    title: "Histórico",
    description: "Localize conteúdos anteriores e o que aconteceu com cada um.",
    empty: {
      title: "O histórico ainda está vazio",
      description: "Ele aparece depois que você selecionar a primeira oportunidade.",
      action: { label: "Ir para Curadoria", href: "/curadoria" },
    },
  },
  storyBank: {
    title: "Story Bank",
    description: "Fatos e histórias autorizados que a geração pode usar.",
    empty: {
      title: "Seu Story Bank está vazio",
      description:
        "Entradas registram experiências reais, com origem e visibilidade. Nada é inventado em seu nome: só o que você autorizar entra nos rascunhos.",
    },
  },
  voiceProfile: {
    title: "Voice Profile",
    description: "Tom, estrutura e limites da sua voz editorial.",
    empty: {
      title: "Voice Profile ainda não configurado",
      description:
        "Você poderá editar depois. Sem perfil, os rascunhos perdem qualidade, mas o restante do produto continua disponível.",
    },
  },
  fontes: {
    title: "Fontes",
    description: "Feeds, domínios permitidos e watchlists que alimentam a curadoria.",
    empty: {
      title: "Adicione fontes para a primeira curadoria",
      description: "Sem fontes ativas, a curadoria não tem matéria-prima para montar um lote.",
    },
  },
  analytics: {
    title: "Analytics",
    description: "Cadência e sinais realmente disponíveis pela API do LinkedIn.",
    empty: {
      title: "Ainda não há dados suficientes",
      description:
        "Os primeiros sinais aparecem depois das primeiras publicações. Nenhum gráfico é mostrado zerado.",
    },
  },
  notificacoes: {
    title: "Notificações",
    description: "Alertas internos e falhas que precisam de ação.",
    empty: {
      title: "Você não tem notificações",
      description:
        "Quando a curadoria ficar pronta ou uma publicação precisar de você, avisamos aqui.",
      action: { label: "Preferências de notificação", href: "/configuracoes" },
    },
  },
  configuracoes: {
    title: "Configurações",
    description:
      "Autonomia, integrações (LinkedIn e Telegram), preferências editoriais e publicação.",
    empty: {
      title: "Configurações em breve",
      description:
        "Autonomia, LinkedIn OAuth, Telegram, preferências editoriais e publicação chegam nas próximas entregas. A instalação começa no modo Assistido.",
    },
  },
} as const satisfies Record<string, ScreenDefinition>;

export type ScreenKey = keyof typeof screens;
