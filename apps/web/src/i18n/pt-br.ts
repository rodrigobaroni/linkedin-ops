/**
 * Minimal PT-BR message catalogue for the shell (no i18n framework in the MVP).
 * Screen copy lives in `@/config/screens`; this file holds chrome strings only.
 */
export const messages = {
  app: {
    name: "LinkedIn Ops",
    titleTemplate: "%s — LinkedIn Ops",
  },
  skipLink: "Pular para o conteúdo principal",
  nav: {
    primary: "Navegação principal",
    bottom: "Navegação principal (mobile)",
    editorialMemory: "Memória editorial",
    more: "Mais",
    moreDescription: "Outras áreas do LinkedIn Ops.",
    collapse: "Recolher barra lateral",
    expand: "Expandir barra lateral",
    home: "Início",
    back: "Voltar",
  },
  header: {
    notifications: "Notificações",
    unread: (count: number) => (count === 1 ? "1 não lida" : `${count} não lidas`),
    account: "Conta",
    openSettings: "Abrir configurações da conta",
  },
  autonomy: {
    prefix: "Modo",
    learnMore: "Entender o modo",
    source: "Dado de exemplo: a configuração real chega com a API de autonomia.",
  },
  linkedin: {
    label: "LinkedIn",
    status: {
      CONNECTED: "Conectado",
      ATTENTION: "Atenção",
      DISCONNECTED: "Desconectado",
    },
  },
  states: {
    preview: "Pré-visualizar estados",
    empty: "Vazio",
    loading: "Carregando",
    error: "Erro",
    retry: "Tentar novamente",
    loadingLabel: "Carregando",
    genericErrorTitle: (screen: string) => `Não foi possível carregar ${screen}`,
    genericErrorDescription: "Nada foi perdido. Tente novamente em instantes.",
    unexpectedErrorTitle: "Algo deu errado nesta tela",
    unexpectedErrorDescription:
      "O restante do LinkedIn Ops continua disponível. Tente novamente ou volte para Hoje.",
    backToToday: "Voltar para Hoje",
  },
  notFound: {
    title: "Página não encontrada",
    description: "O endereço pode ter mudado ou o item não existe mais.",
  },
} as const;
