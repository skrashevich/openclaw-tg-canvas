// Lightweight i18n for OpenClaw Canvas Mini App
(() => {
  const STORAGE_KEY = 'oc-canvas-lang';

  const LANG = {
    en: {
      appTitle: 'OpenClaw Canvas',
      lastUpdated: 'Last updated {time}',
      lastUpdatedEmpty: 'Last updated —',
      statusConnected: 'Connected',
      statusConnecting: 'Connecting…',
      statusReconnecting: 'Reconnecting…',
      statusOffline: 'Offline',
      statusOpeningControl: 'Opening control…',
      btnSessions: 'Sessions',
      btnTerminal: 'Terminal',
      btnControl: 'Control',
      btnOpening: 'Opening…',
      btnSend: 'Send',
      btnClose: 'Close',
      btnBack: '← Back',
      btnRefresh: '↻',
      langToggle: 'RU',
      langToggleAria: 'Switch language to Russian',
      welcomeTitle: 'OpenClaw Canvas',
      welcomeLead: 'Your agent dashboard in Telegram. Canvas content from OpenClaw appears here when pushed.',
      welcomeOpenSessions: 'Open Sessions',
      welcomeOpenTerminal: 'Open Terminal',
      welcomeHint: 'Tip: use Sessions to read and reply to OpenClaw chats. Canvas updates arrive live when your agent pushes content.',
      connecting: 'Connecting…',
      accessDenied: 'Access denied',
      terminalTitle: 'Terminal',
      terminalCloseAria: 'Close terminal',
      terminalLoadFailed: 'Failed to load terminal library.',
      terminalConnClosed: '[Connection closed]',
      terminalProcessExited: '[Process exited with code {code}]',
      sessionsTitle: 'Sessions',
      chatTitle: 'Chat',
      sessionDefault: 'Session',
      pullDownRefresh: 'Pull down to refresh',
      releaseToRefresh: 'Release to refresh',
      loadingSessions: 'Loading sessions…',
      noSessions: 'No sessions found.',
      noMessages: 'No messages yet. Say hello!',
      messagePlaceholder: 'Message…',
      failedLoadHistory: 'Failed to load history.',
      sessionsBackCloseAria: 'Close sessions',
      sessionsBackAria: 'Back to sessions list',
      sessionsRefreshAria: 'Refresh sessions list',
      timeJustNow: 'just now',
      timeSecondsAgo: '{n}s ago',
      timeMinutesAgo: '{n}m ago',
      timeHoursAgo: '{n}h ago',
      timeDaysAgo: '{n}d ago',
      timeDash: '—',
    },
    ru: {
      appTitle: 'OpenClaw Canvas',
      lastUpdated: 'Обновлено {time}',
      lastUpdatedEmpty: 'Обновлено —',
      statusConnected: 'Подключено',
      statusConnecting: 'Подключение…',
      statusReconnecting: 'Переподключение…',
      statusOffline: 'Офлайн',
      statusOpeningControl: 'Открываем Control…',
      btnSessions: 'Сессии',
      btnTerminal: 'Терминал',
      btnControl: 'Control',
      btnOpening: 'Открытие…',
      btnSend: 'Отправить',
      btnClose: 'Закрыть',
      btnBack: '← Назад',
      btnRefresh: '↻',
      langToggle: 'EN',
      langToggleAria: 'Переключить язык на английский',
      welcomeTitle: 'OpenClaw Canvas',
      welcomeLead: 'Панель агента в Telegram. Контент Canvas от OpenClaw появляется здесь, когда его отправляют.',
      welcomeOpenSessions: 'Открыть сессии',
      welcomeOpenTerminal: 'Открыть терминал',
      welcomeHint: 'Подсказка: в «Сессиях» можно читать и отвечать в чатах OpenClaw. Обновления Canvas приходят в реальном времени.',
      connecting: 'Подключение…',
      accessDenied: 'Доступ запрещён',
      terminalTitle: 'Терминал',
      terminalCloseAria: 'Закрыть терминал',
      terminalLoadFailed: 'Не удалось загрузить библиотеку терминала.',
      terminalConnClosed: '[Соединение закрыто]',
      terminalProcessExited: '[Процесс завершился с кодом {code}]',
      sessionsTitle: 'Сессии',
      chatTitle: 'Чат',
      sessionDefault: 'Сессия',
      pullDownRefresh: 'Потяните вниз для обновления',
      releaseToRefresh: 'Отпустите для обновления',
      loadingSessions: 'Загрузка сессий…',
      noSessions: 'Сессии не найдены.',
      noMessages: 'Сообщений пока нет. Напишите что-нибудь!',
      messagePlaceholder: 'Сообщение…',
      failedLoadHistory: 'Не удалось загрузить историю.',
      sessionsBackCloseAria: 'Закрыть сессии',
      sessionsBackAria: 'Назад к списку сессий',
      sessionsRefreshAria: 'Обновить список сессий',
      timeJustNow: 'только что',
      timeSecondsAgo: '{n} сек. назад',
      timeMinutesAgoOne: '{n} минуту назад',
      timeMinutesAgoFew: '{n} минуты назад',
      timeMinutesAgoMany: '{n} минут назад',
      timeHoursAgoOne: '{n} час назад',
      timeHoursAgoFew: '{n} часа назад',
      timeHoursAgoMany: '{n} часов назад',
      timeDaysAgoOne: '{n} день назад',
      timeDaysAgoFew: '{n} дня назад',
      timeDaysAgoMany: '{n} дней назад',
      timeDash: '—',
    },
  };

  function detectLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'ru') return saved;
    } catch (_) {}
    const code = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || '';
    return String(code).toLowerCase().startsWith('ru') ? 'ru' : 'en';
  }

  let currentLang = detectLang();
  const listeners = new Set();

  function interpolate(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (_, key) => (vars[key] !== undefined ? String(vars[key]) : `{${key}}`));
  }

  function ruPlural(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  function t(key, vars) {
    const pack = LANG[currentLang] || LANG.en;
    const fallback = LANG.en[key];
    const raw = pack[key] ?? fallback ?? key;
    return interpolate(raw, vars);
  }

  function getLang() {
    return currentLang;
  }

  function setLang(lang) {
    if (lang !== 'en' && lang !== 'ru') return;
    if (lang === currentLang) return;
    currentLang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (_) {}
    document.documentElement.lang = lang;
    for (const fn of listeners) {
      try { fn(currentLang); } catch (_) {}
    }
  }

  function toggleLang() {
    setLang(currentLang === 'en' ? 'ru' : 'en');
  }

  function onLangChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function formatRelative(ts) {
    if (!ts) return t('timeDash');
    const delta = Math.max(0, Date.now() - ts);
    const sec = Math.floor(delta / 1000);
    if (sec < 5) return t('timeJustNow');
    if (sec < 60) return t('timeSecondsAgo', { n: sec });

    const min = Math.floor(sec / 60);
    if (min < 60) {
      if (currentLang === 'ru') {
        const form = ruPlural(min, t('timeMinutesAgoOne', { n: min }), t('timeMinutesAgoFew', { n: min }), t('timeMinutesAgoMany', { n: min }));
        return form;
      }
      return t('timeMinutesAgo', { n: min });
    }

    const hr = Math.floor(min / 60);
    if (hr < 24) {
      if (currentLang === 'ru') {
        return ruPlural(hr, t('timeHoursAgoOne', { n: hr }), t('timeHoursAgoFew', { n: hr }), t('timeHoursAgoMany', { n: hr }));
      }
      return t('timeHoursAgo', { n: hr });
    }

    const days = Math.floor(hr / 24);
    if (currentLang === 'ru') {
      return ruPlural(days, t('timeDaysAgoOne', { n: days }), t('timeDaysAgoFew', { n: days }), t('timeDaysAgoMany', { n: days }));
    }
    return t('timeDaysAgo', { n: days });
  }

  function formatMessageTime(ts) {
    if (!ts || !Number.isFinite(ts)) return '';
    const locale = currentLang === 'ru' ? 'ru-RU' : 'en-US';
    return new Date(ts).toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  document.documentElement.lang = currentLang;

  window.OcI18n = {
    t,
    getLang,
    setLang,
    toggleLang,
    onLangChange,
    formatRelative,
    formatMessageTime,
  };
})();
