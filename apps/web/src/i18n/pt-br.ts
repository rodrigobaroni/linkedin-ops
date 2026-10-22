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
    career: "Carreira",
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
  publish: {
    title: "Publicar",
    description:
      "Escreva um post de texto, confira a prévia e publique no seu perfil do LinkedIn. Nada é publicado sem a sua confirmação.",
    connection: {
      title: "Conexão com o LinkedIn",
      loading: "Verificando a conexão com o LinkedIn",
      loadError: "Não foi possível verificar a conexão com o LinkedIn.",
      retry: "Tentar novamente",
      connectedAs: (name: string) => `Conectado como ${name}`,
      unidentified: "Conectado, mas sem identificação da conta",
      unidentifiedHint:
        "O LinkedIn não informou o nome nem o identificador da conta. Reconecte para confirmar em qual perfil o post será publicado.",
      disconnected: "Não conectado",
      expired: "Conexão expirada",
      reauthRequired: "Reconexão necessária",
      expiresAt: (date: string) => `Acesso válido até ${date}.`,
      expiredAt: (date: string) => `O acesso expirou em ${date}.`,
      expiringSoon: (days: number) =>
        days <= 1
          ? "O acesso expira em menos de 1 dia. Reconecte para continuar publicando."
          : `O acesso expira em ${days} dias. Reconecte antes para não interromper as publicações.`,
      reconnectHint:
        "O LinkedIn não aceita mais o acesso atual. Reconecte a conta para voltar a publicar.",
      disconnectedHint: "Conecte sua conta do LinkedIn para publicar.",
      connect: "Conectar LinkedIn",
      reconnect: "Reconectar LinkedIn",
      disconnect: "Desconectar",
      connecting: "Abrindo o LinkedIn…",
      disconnecting: "Desconectando…",
      connectError: "Não foi possível iniciar a conexão com o LinkedIn. Tente novamente.",
      disconnectError: "Não foi possível desconectar agora. Tente novamente.",
      invalidAuthorizeUrl:
        "A API devolveu um endereço de autorização inesperado. Nada foi aberto; avise o administrador.",
    },
    callback: {
      connected: "LinkedIn conectado. Você já pode publicar.",
      denied: "A autorização foi recusada no LinkedIn. Nada mudou; conecte de novo quando quiser.",
      failed: "Não foi possível conectar ao LinkedIn. Tente novamente.",
      reasons: {
        expired:
          "A tentativa de conexão expirou antes de voltar do LinkedIn. Clique em Conectar e conclua em até 10 minutos.",
        invalid_state:
          "Não foi possível validar o retorno do LinkedIn. Por segurança, nada foi conectado; tente novamente a partir desta página.",
        exchange_failed:
          "O LinkedIn não confirmou a autorização. Nada foi conectado; tente novamente.",
        unavailable:
          "O LinkedIn não está respondendo agora. Tente conectar novamente em instantes.",
        scope_missing:
          "O LinkedIn não concedeu a permissão de publicar; conecte de novo e autorize todas as permissões.",
      },
    },
    composer: {
      label: "Texto do post",
      placeholder: "Escreva aqui o texto que vai para o seu perfil.",
      counter: (count: number, max: number) => `${count} de ${max} caracteres`,
      overLimit: (excess: number, max: number) =>
        `O LinkedIn aceita até ${max} caracteres. Remova ${excess} ${excess === 1 ? "caractere" : "caracteres"}.`,
      nearLimit: (left: number) => `Restam ${left} caracteres.`,
    },
    preview: {
      title: "Prévia",
      description: "Texto simples, como vai aparecer no post. Formatação HTML não é aplicada.",
      empty: "A prévia aparece aqui quando você escrever o texto.",
      author: (name: string) => name,
    },
    action: {
      publishNow: "Publicar agora",
      publishing: "Publicando…",
      needsConnection: "Conecte o LinkedIn para publicar.",
      needsIdentity: "Reconecte o LinkedIn para identificar a conta antes de publicar.",
      needsText: "Escreva o texto do post para publicar.",
    },
    confirm: {
      title: "Publicar agora no LinkedIn?",
      description:
        "Confira a conta e o texto. Depois de confirmar, pediremos sua senha e o post vai ao ar imediatamente.",
      account: "Conta",
      text: "Texto final",
      characters: (count: number) => `${count} caracteres`,
      confirm: "Confirmar e publicar",
      cancel: "Voltar e editar",
    },
    result: {
      published: "Post publicado no LinkedIn.",
      viewPost: "Ver post no LinkedIn",
      opensInNewTab: "(abre em nova aba)",
      ambiguousTitle: "Não conseguimos confirmar a publicação",
      ambiguous:
        "O LinkedIn não respondeu a tempo e não sabemos se o post foi ao ar. Confira seu perfil antes de tentar de novo: não repetimos a publicação automaticamente.",
      unconfirmed:
        "A conexão com o LinkedIn Ops caiu depois do envio e não sabemos se o post foi ao ar. Confira seu perfil no LinkedIn antes de qualquer coisa.",
      resendSameHint:
        "Se o post não estiver lá, reenvie o mesmo pedido: ele é reconhecido e nunca vira um segundo post.",
      resendSame: "Reenviar o mesmo pedido",
      /** `Retry-After` from the API, shown as an absolute time plus minutes left. */
      rateLimitedUntil: (clock: string, minutes: number) =>
        `Muitas publicações em pouco tempo. Nada foi publicado; tente novamente às ${clock} (${minutes <= 1 ? "em menos de 1 minuto" : `em ${minutes} minutos`}).`,
      failedTitle: "O post não foi publicado",
      newPost: "Escrever outro post",
      cancelled: "Publicação cancelada. O texto continua aqui.",
    },
    errors: {
      LINKEDIN_REAUTH_REQUIRED:
        "O LinkedIn recusou o acesso atual. Reconecte a conta e tente publicar de novo.",
      RATE_LIMITED: "Muitas publicações em pouco tempo. Aguarde alguns minutos e tente novamente.",
      VALIDATION_FAILED:
        "O texto não foi aceito. Confira o tamanho e o conteúdo e tente novamente.",
      PUBLICATION_ALREADY_EXISTS: "Este post já foi publicado. Confira as publicações recentes.",
      IDEMPOTENCY_KEY_CONFLICT:
        "O texto mudou durante o envio. Confira o texto e publique novamente.",
      FORBIDDEN: "Sua conta não tem permissão para publicar.",
      linkedinRejected: "O LinkedIn recusou o post. Revise o texto e tente novamente.",
      unexpected: "Não foi possível publicar agora. Tente novamente em instantes.",
    },
    recent: {
      title: "Publicações recentes",
      empty: "Nenhuma publicação ainda. Os posts publicados por aqui aparecem nesta lista.",
      loadError: "Não foi possível carregar as publicações recentes.",
      noText: "(texto indisponível)",
      status: {
        PENDING: "Pendente",
        IN_PROGRESS: "Publicando",
        SUCCEEDED: "Publicado",
        FAILED: "Falhou",
        AMBIGUOUS: "Não confirmado",
      },
      viewPost: "Ver no LinkedIn",
    },
  },
  /** Career module copy: Aurora's spec (~/Developer/.maestri/aurora/career-screens-spec.md §2 and §3). */
  career: {
    breadcrumb: "Carreira",
    jobs: {
      title: "Vagas",
      description: "Cole links de vagas para comparar os requisitos com seu CV base.",
      loading: "Carregando vagas",
      loadError: "Não foi possível carregar suas vagas.",
      retry: "Tentar novamente",
      noCv: {
        title: "Confirme seu CV antes de analisar vagas",
        description: "Precisamos de um CV base revisado para calcular a aderência.",
        action: "Ir para Meu CV",
      },
      form: {
        label: "Links das vagas",
        hint: "Cole de 1 a 20 links, um por linha.",
        placeholder: "https://www.linkedin.com/jobs/view/…\nhttps://empresa.com/vagas/…",
        counter: (n: number) => `${n} de 20 links`,
        empty: "Cole pelo menos um link de vaga.",
        tooMany: "Você pode analisar até 20 links por vez.",
        invalid: "Revise os links destacados.",
        invalidLine: (position: number) => `Link ${position}: não é um link de vaga válido.`,
        submit: "Analisar vagas",
        submitting: "Enviando vagas…",
        success: "Vagas adicionadas. Você pode acompanhar o processamento abaixo.",
        /** Per-item feedback of the batch (Maestro, 3b; Aurora reviews). */
        result: {
          queued: "Na fila para análise",
          blocked: "Não pode ser buscada automaticamente: cole o texto da vaga na lista abaixo.",
          duplicates: (n: number) =>
            n === 1 ? "1 link repetido foi unido." : `${n} links repetidos foram unidos.`,
        },
        errors: {
          rejected: "Um ou mais links não foram aceitos.",
          unavailable:
            "Não foi possível iniciar a análise agora. Seus links foram mantidos; tente de novo.",
          rateLimited: "Muitos envios em pouco tempo. Aguarde alguns minutos.",
          network: "Sem conexão com o LinkedIn Ops. Verifique a internet.",
          unexpected: "O envio falhou por um erro inesperado.",
        },
      },
      list: {
        title: "Suas vagas",
        empty: "Nenhuma vaga ainda. Os links enviados aparecem aqui.",
        columns: { job: "Vaga", status: "Status", updated: "Atualização", actions: "Ações" },
        updated: (when: string) => `Atualizado em ${when}`,
        score: (n: number) => `Aderência ${n} de 100`,
        loadMore: "Carregar mais",
        loadingMore: "Carregando…",
        /** Consolidated `aria-live` announcement when statuses change. */
        announce: {
          ready: (n: number) => (n === 1 ? "1 vaga pronta." : `${n} vagas prontas.`),
          failed: (n: number) => (n === 1 ? "1 vaga falhou." : `${n} vagas falharam.`),
        },
      },
      status: {
        FETCHING: "Buscando vaga",
        ANALYZING: "Analisando aderência",
        READY: "Pronto",
        FAILED: "Falhou",
      },
      source: { LINKEDIN: "LinkedIn", OTHER: "Site da empresa", PASTED: "Texto colado" },
      failure: {
        title: "Não foi possível processar esta vaga.",
        /** `blockedDetail.kind` (issue #112); `at` is São Paulo time, `null` when unknown. Aurora reviews. */
        blocked: {
          DISABLED: (_at: string | null) =>
            "A busca automática no LinkedIn está desligada. Cole o texto da vaga para continuar.",
          QUOTA: (at: string | null) =>
            at
              ? `O limite diário de buscas automáticas neste site foi atingido. Você pode reprocessar a partir de ${at} (horário de Brasília) ou colar o texto da vaga agora.`
              : "O limite diário de buscas automáticas neste site foi atingido. Reprocesse mais tarde ou cole o texto da vaga agora.",
          BREAKER: (at: string | null) =>
            at
              ? `O site bloqueou temporariamente a busca automática. Você pode reprocessar a partir de ${at} (horário de Brasília) ou colar o texto da vaga agora.`
              : "O site bloqueou temporariamente a busca automática. Reprocesse mais tarde ou cole o texto da vaga agora.",
        },
        /** Safe reason by `failureReason` (FETCH_BLOCKED by source); Maestro's copy, Aurora reviews. */
        reasons: {
          FETCH: "A página da vaga não abriu. Tente reprocessar ou cole o texto da vaga.",
          FETCH_BLOCKED_LINKEDIN:
            "Não foi possível buscar esta vaga do LinkedIn agora (limite diário, bloqueio temporário ou busca desligada). Cole o texto da vaga para continuar.",
          FETCH_BLOCKED_OTHER:
            "O site não permitiu a busca automática desta vaga agora. Cole o texto da vaga para continuar.",
          NOT_A_JOB: "A página não parece ser uma vaga. Confira o link ou cole o texto da vaga.",
          AI: "A análise não terminou corretamente. Tente reprocessar.",
          TIMED_OUT:
            "O processamento demorou mais que o esperado e foi interrompido. Tente reprocessar.",
        },
      },
      actions: {
        viewReport: "Ver relatório",
        more: (name: string) => `Mais ações para ${name}`,
        pasteText: "Colar texto da vaga",
        retry: "Reprocessar",
        retrying: "Reprocessando…",
        remove: "Apagar vaga",
        removing: "Apagando…",
        errors: {
          busy: "Esta vaga ainda está sendo processada. Aguarde o fim para reprocessar.",
          needsText: "Este link não pode ser buscado automaticamente. Cole o texto da vaga.",
          notFound: "Esta vaga não existe mais.",
          rateLimited: "Muitos reprocessamentos em pouco tempo. Aguarde alguns minutos.",
          unavailable: "Não foi possível reprocessar agora. Tente de novo.",
          unexpected: "A ação falhou por um erro inesperado.",
        },
        retried: "Reprocessamento iniciado.",
        removed: "Vaga apagada.",
      },
      paste: {
        title: "Colar texto da vaga",
        description: "Cole a descrição completa para tentarmos novamente.",
        label: "Texto da vaga",
        placeholder: "Cole aqui responsabilidades, requisitos e demais informações…",
        counter: (n: number) => `${n.toLocaleString("pt-BR")} de 20.000 caracteres`,
        tooShort: "Cole pelo menos 200 caracteres da vaga.",
        tooLong: "O texto pode ter até 20.000 caracteres.",
        invalidChars:
          "O texto tem caracteres inválidos. Copie a descrição de novo a partir da página da vaga.",
        cancel: "Cancelar",
        submit: "Salvar e reprocessar",
        submitting: "Salvando…",
        done: "Texto salvo. A vaga está sendo reprocessada.",
      },
      /** Delete confirmation (Maestro, 3b; Aurora reviews). */
      remove: {
        title: "Apagar vaga?",
        description:
          "Isso apaga a vaga, o relatório de aderência e o CV adaptado. Esta ação não pode ser desfeita.",
        cancel: "Cancelar",
        confirm: "Apagar vaga",
      },
      detail: {
        metaTitle: "Vaga",
        back: "Voltar para Vagas",
        loading: "Carregando vaga",
        loadError: "Não foi possível carregar esta vaga.",
        notFound: "Vaga não encontrada",
        notFoundDescription: "Ela pode ter sido apagada.",
        untitled: "Vaga sem título",
        processing: {
          FETCHING: "Estamos lendo a página da vaga.",
          ANALYZING: "Estamos comparando os requisitos com seu CV base.",
        },
        previousCv: {
          title: "Gerado com o CV anterior",
          description:
            "Seu CV base mudou depois desta análise. Reprocesse para usar a versão atual.",
          action: "Reprocessar com o CV atual",
        },
        injection: {
          title: "A vaga contém um trecho que tenta dar instruções à IA",
          description:
            "Ele foi tratado apenas como texto da vaga. Confira o relatório com atenção.",
          evidence: "Trecho encontrado:",
        },
        warnings: {
          language_fallback:
            "A vaga está em um idioma que não analisamos; o CV adaptado foi escrito em outro idioma.",
          job_echo: "Parte do CV adaptado repete o texto da vaga. Revise antes de usar.",
        },
        humanizerFlagged:
          "Alguns trechos do CV adaptado ainda soam artificiais. Revise antes de usar.",
        score: {
          title: "Aderência ao CV base",
          value: (n: number) => `${n} de 100`,
          legend:
            "Nota calculada com seu CV base, antes de qualquer conteúdo acrescentado pela IA.",
        },
        met: {
          title: "Requisitos atendidos",
          quote: (quote: string) => `Trecho do seu CV: “${quote}”`,
          partial: "Parcialmente",
          empty: "Nenhum requisito foi identificado como atendido.",
        },
        missing: {
          title: "Requisitos não encontrados no CV base",
          empty: "Nenhum requisito ficou sem cobertura.",
        },
        kind: { mandatory: "Obrigatório", desirable: "Desejável" },
        added: {
          title: "O que a IA acrescentou",
          description: "Confira todo conteúdo novo incluído na versão adaptada.",
          empty: "Nenhum conteúdo foi acrescentado.",
          targets: (list: string) => `Para o requisito: ${list}`,
        },
        tailored: {
          title: "CV adaptado (revisão)",
          description: "As marcações de origem aparecem só nesta revisão; o PDF não as inclui.",
          summary: "Resumo",
          experience: (n: number) => `Experiência ${n}`,
          bullets: "Atividades",
          skills: "Competências da experiência",
          technical: "Competências técnicas",
          behavioral: "Competências comportamentais",
          empty: "Nenhum conteúdo nesta seção.",
        },
        /** "Baixar PDF" (Aurora §3; PR 3c route by Pêndulo). Error texts beyond Aurora's: Maestro, Aurora reviews. */
        pdf: {
          download: "Baixar PDF",
          preparing: "Preparando PDF…",
          error: "Não foi possível gerar o PDF. Tente novamente.",
          stale:
            "Seu CV base mudou e este CV adaptado precisa ser refeito. Reprocesse a vaga para baixar o PDF.",
          rateLimited: (minutes: number) =>
            minutes <= 1
              ? "Muitos downloads em pouco tempo. Tente de novo em 1 minuto."
              : `Muitos downloads em pouco tempo. Tente de novo em ${minutes} minutos.`,
          tooLarge: "O CV adaptado ficou grande demais para o PDF; reprocesse a vaga.",
          sessionExpired: "Sua sessão expirou. Entre de novo para baixar o PDF.",
          notFound: "Esta vaga não existe mais.",
        },
        provenance: {
          original: "Original",
          rewritten: "Reescrito",
          added: "Acrescentado pela IA",
        },
      },
    },
    cv: {
      title: "Meu CV",
      description: "Mantenha um CV base confirmado para analisar vagas e gerar versões adaptadas.",
      loading: "Carregando seu CV",
      loadError: "Não foi possível carregar seu CV.",
      retry: "Tentar novamente",
      empty: {
        title: "Você ainda não tem um CV base",
        description:
          "Envie seu CV em PDF para revisar as informações antes de usá-las nas análises.",
      },
      upload: {
        start: "Enviar CV em PDF",
        label: "Selecionar arquivo PDF",
        hint: "PDF de até 5 MB. O arquivo original será descartado após a leitura.",
        selected: (name: string) => `Arquivo selecionado: ${name}`,
        read: "Ler meu CV",
        chooseAnother: "Escolher outro arquivo",
        invalidFile: "Envie um arquivo PDF de até 5 MB.",
        replaceTitle: "Substituir CV",
        replaceHint: "Um novo envio cria nova versão e só substitui a ativa após confirmação.",
        cancel: "Cancelar",
      },
      reading: {
        title: "Lendo seu CV…",
        description:
          "Estamos identificando contato, resumo, experiências, formação, competências, idiomas e certificações.",
      },
      error: {
        title: "Não foi possível ler seu CV",
        description: "Seu CV anterior não foi alterado. Tente novamente ou escolha outro arquivo.",
        retry: "Tentar novamente",
        /** Safe reason under Aurora's text, by draft `failureReason` or API error code (Maestro, 3c). */
        reasons: {
          EXTRACTION_FAILED: "A leitura automática do conteúdo falhou desta vez.",
          TIMED_OUT: "A leitura demorou mais que o esperado e foi interrompida.",
          CV_PDF_UNREADABLE:
            "O PDF não pôde ser lido: ele pode estar protegido por senha, corrompido, ser uma imagem digitalizada sem texto ou ter mais de 20 páginas.",
          RATE_LIMITED: "Muitos envios em pouco tempo. Aguarde alguns minutos.",
          network: "Sem conexão com o LinkedIn Ops. Verifique a internet.",
          unexpected: "O envio falhou por um erro inesperado.",
        },
      },
      review: {
        title: "Revise seu CV",
        description: "Confira e edite cada seção. Nada será usado nas vagas até você confirmar.",
        confirm: "Confirmar CV base",
        confirming: "Confirmando…",
        replacePdf: "Substituir PDF",
        editSection: "Editar seção",
        saveSection: "Salvar alterações",
        cancelSection: "Cancelar",
        sectionSaved: "Alterações salvas.",
        openSections: (names: string) =>
          `Salve ou cancele as alterações em ${names} antes de confirmar.`,
        /** Draft flagged as possible prompt injection (#92, ADR-0005 §4); Maestro's copy, Aurora reviews. */
        injection: {
          title: "Encontramos um trecho suspeito no seu CV",
          description:
            "Este trecho parece conter instruções para a IA, não informações do seu currículo. A IA trata esse trecho como texto do currículo, não como instrução, mas confira se o seu CV está correto antes de confirmar.",
          evidenceLabel: "Trecho encontrado",
          acknowledge: "Revisei o trecho e quero confirmar este CV mesmo assim.",
          acknowledgeRequired: "Marque a confirmação do trecho suspeito para continuar.",
        },
        errors: {
          CV_DRAFT_NOT_READY:
            "Este rascunho foi substituído por um envio mais recente. Mostramos a versão atual.",
          CV_INJECTION_UNACKNOWLEDGED:
            "Este CV tem um trecho suspeito que precisa da sua confirmação. Revise o aviso e marque a confirmação.",
          VALIDATION_FAILED: (names: string) => `O CV não foi aceito. Revise: ${names}.`,
          network:
            "Sem conexão com o LinkedIn Ops. Suas correções continuam aqui; tente novamente.",
          unexpected:
            "Não foi possível confirmar agora. Suas correções continuam aqui; tente novamente.",
        },
      },
      confirmed: {
        badge: "CV base confirmado",
        description: "Seu CV está pronto para analisar vagas.",
        meta: (version: number, date: string) => `Versão ${version} · Confirmado em ${date}`,
        viewJobs: "Ver vagas",
        replace: "Substituir CV",
        remove: "Apagar CV",
      },
      sections: {
        contact: "Contato",
        summary: "Resumo",
        experiences: "Experiências",
        education: "Formação",
        skills: "Competências",
        languages: "Idiomas",
        certifications: "Certificações",
        other: "Outros",
      },
      fields: {
        name: "Nome",
        email: "E-mail",
        phone: "Telefone",
        location: "Localização",
        links: "Links (um por linha)",
        summary: "Resumo profissional",
        company: "Empresa",
        title: "Cargo",
        startDate: "Início",
        endDate: "Fim",
        dateHint: "Como aparece no CV",
        isCurrent: "Trabalho aqui atualmente",
        bullets: "Realizações (uma por linha)",
        experienceSkills: "Competências usadas (uma por linha)",
        institution: "Instituição",
        degree: "Grau",
        field: "Área",
        technical: "Competências técnicas (uma por linha)",
        behavioral: "Competências comportamentais (uma por linha)",
        technicalHeading: "Técnicas",
        behavioralHeading: "Comportamentais",
        language: "Idioma",
        level: "Nível",
        certification: "Certificação",
        issuer: "Emissor",
        date: "Data",
        heading: "Título da seção",
        otherText: "Conteúdo",
      },
      items: {
        experiences: (index: number) => `Experiência ${index}`,
        education: (index: number) => `Formação ${index}`,
        languages: (index: number) => `Idioma ${index}`,
        certifications: (index: number) => `Certificação ${index}`,
        other: (index: number) => `Seção ${index}`,
        add: {
          experiences: "Adicionar experiência",
          education: "Adicionar formação",
          languages: "Adicionar idioma",
          certifications: "Adicionar certificação",
          other: "Adicionar seção",
        },
        remove: (label: string) => `Remover ${label}`,
        current: "atual",
        none: "Nada informado.",
      },
      validation: {
        required: "Preencha este campo.",
        tooLong: (max: number) => `Use no máximo ${max} caracteres.`,
        tooMany: (max: number) => `Use no máximo ${max} itens.`,
        invalid: "Valor inválido.",
      },
      remove: {
        title: "Apagar CV base?",
        description:
          "Isso apaga o seu CV base e todas as análises de vagas feitas com ele. Esta ação não pode ser desfeita.",
        confirm: "Apagar CV",
        removing: "Apagando…",
        cancel: "Cancelar",
        done: "CV base apagado.",
        cancelled: "Nada foi apagado.",
        error: "Não foi possível apagar agora. Tente novamente.",
      },
    },
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
