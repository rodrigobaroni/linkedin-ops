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
      title: "Entrar no LinkedIn Ops",
      description: "Use o e-mail e a senha configurados para esta instalação.",
      email: "E-mail",
      emailPlaceholder: "voce@empresa.com",
      password: "Senha",
      passwordPlaceholder: "Digite sua senha",
      showPassword: "Mostrar senha",
      hidePassword: "Ocultar senha",
      submit: "Entrar",
      submitting: "Entrando…",
      success: "Sessão iniciada. Abrindo o LinkedIn Ops…",
      emailRequired: "Informe seu e-mail.",
      emailInvalid: "Informe um e-mail válido.",
      passwordRequired: "Informe sua senha.",
      invalidCredentials: "Não foi possível entrar. Verifique suas credenciais e tente novamente.",
      networkError:
        "Não foi possível conectar ao LinkedIn Ops. Verifique sua conexão e tente novamente.",
      unexpectedError: "Não foi possível entrar agora. Tente novamente em instantes.",
      /** `{HH:mm}` is the absolute unlock time; `{MM:SS}` the visual countdown (Aurora spec item 11). */
      locked: (clock: string) => `Muitas tentativas sem sucesso. Tente novamente às ${clock}`,
      lockedAnnouncement: (clock: string, minutes: number) =>
        `Entrada bloqueada até ${clock}. ${minutes <= 1 ? "Falta menos de 1 minuto." : `Faltam ${minutes} minutos.`}`,
      rateLimitReleased: "O bloqueio terminou. Você já pode tentar novamente.",
      recovery:
        "Esqueceu a senha? A recuperação é feita pelo administrador no servidor. Consulte o runbook de acesso.",
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
      title: "Confirme sua identidade",
      /** The duration comes from the server (`elevatedUntil`), so it is only stated after success. */
      description:
        "Digite sua senha para continuar. A confirmação vale por tempo limitado e só para esta sessão.",
      password: "Senha",
      passwordPlaceholder: "Digite sua senha",
      confirm: "Confirmar identidade",
      confirming: "Confirmando…",
      cancel: "Cancelar",
      invalid: "Não foi possível confirmar sua identidade. Verifique a senha e tente novamente.",
      rateLimited: "Muitas tentativas sem sucesso. Aguarde alguns minutos e tente novamente.",
      /** Derived from `elevatedUntil` (ADR-0007 item 3: 15 min today), never a constant. */
      success: (clock: string, minutes: number) =>
        `Identidade confirmada. Você pode continuar por ${minutes === 1 ? "1 minuto" : `${minutes} minutos`} (até ${clock}).`,
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
