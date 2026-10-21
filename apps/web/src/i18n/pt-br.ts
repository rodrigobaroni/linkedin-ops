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
    fullName: {
      ASSISTED: "Assistido",
      AUTOPILOT_CONTROLLED: "Piloto automático controlado",
      AUTOPILOT_FULL: "Piloto automático completo",
    },
    cancelWindow: (minutes: number) =>
      `Janela de cancelamento: ${minutes} min depois da notificação, antes de publicar.`,
    noCancelWindow: "Sem janela de cancelamento: a publicação segue no horário agendado.",
    mediaRequiresHuman: "Mídia (imagens e cards) sempre exige aprovação humana.",
    settingsLink: "Ver configurações de autonomia",
    source: "Dado de exemplo: a configuração real chega com a API de autonomia.",
  },
  linkedin: {
    label: "LinkedIn",
    openSettings: "Abrir integrações",
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
  auth: {
    login: {
      title: "Entrar",
      description: "Acesse o LinkedIn Ops com o e-mail e a senha cadastrados.",
      email: "E-mail",
      emailHint: "O mesmo e-mail usado na criação da conta.",
      password: "Senha",
      submit: "Entrar",
      submitting: "Entrando…",
      emailRequired: "Informe seu e-mail.",
      emailInvalid: "Informe um e-mail válido.",
      passwordRequired: "Informe sua senha.",
      invalidCredentials: "E-mail ou senha incorretos. Confira os dados e tente novamente.",
      networkError:
        "Não foi possível conectar ao LinkedIn Ops. Verifique sua conexão e tente novamente.",
      unexpectedError: "Não foi possível entrar agora. Tente novamente em instantes.",
      rateLimitedTitle: "Muitas tentativas de entrada",
      rateLimited: (remaining: string) =>
        `Por segurança, a entrada fica bloqueada por alguns minutos. Tente novamente em ${remaining}.`,
      rateLimitReleased: "O bloqueio terminou. Você já pode tentar novamente.",
      noAccount: "Não existe cadastro pela interface: a conta é criada pelo comando de setup.",
    },
    session: {
      checking: "Verificando sua sessão",
      redirecting: "Redirecionando para a página de entrada",
      unavailableTitle: "Não foi possível verificar sua sessão",
      unavailableDescription:
        "O LinkedIn Ops não respondeu. Nada foi perdido: tente novamente em instantes.",
      logout: "Sair",
      loggingOut: "Saindo…",
      logoutFailed: "Não foi possível encerrar a sessão agora. Tente novamente.",
    },
    reauth: {
      title: "Confirme sua senha",
      description:
        "Esta ação é sensível. Digite sua senha para continuar; a confirmação vale por alguns minutos.",
      password: "Senha",
      confirm: "Confirmar",
      confirming: "Confirmando…",
      cancel: "Cancelar",
      invalid: "Senha incorreta. Tente novamente.",
    },
    required: "obrigatório",
  },
  notFound: {
    title: "Página não encontrada",
    description: "O endereço pode ter mudado ou o item não existe mais.",
  },
} as const;

/** Accessible name of the notifications bell, e.g. "Notificações: 2 não lidas". */
export function notificationsLabel(unread: number): string {
  return unread > 0
    ? `${messages.header.notifications}: ${messages.header.unread(unread)}`
    : messages.header.notifications;
}
