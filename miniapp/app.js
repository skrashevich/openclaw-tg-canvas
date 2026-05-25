// OpenClaw Canvas Mini App
// Vanilla JS client for Telegram WebApp

(() => {
  const tg = window.Telegram?.WebApp;
  const i18n = window.OcI18n;
  const t = i18n.t.bind(i18n);
  const formatRelative = i18n.formatRelative.bind(i18n);
  const formatMessageTime = i18n.formatMessageTime.bind(i18n);

  function wsProto() {
    return location.protocol === 'https:' ? 'wss:' : 'ws:';
  }

  function openTerminalPane() {
    document.getElementById('terminal-pane').style.display = 'flex';
    connectTerminal();
  }

  // Apply Telegram theme (light/dark)
  try {
    const theme = tg?.colorScheme || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {}

  const contentEl = document.querySelector('.content-inner');
  const connDot = document.getElementById('connDot');
  const connText = document.getElementById('connText');
  const lastUpdatedEl = document.getElementById('lastUpdated');
  const openControlBtn = document.getElementById('openControlBtn');
  const openTerminalBtn = document.getElementById('openTerminalBtn');
  const closeTerminalBtn = document.getElementById('closeTerminalBtn');
  const langToggleBtn = document.getElementById('langToggleBtn');
  const appTitleEl = document.querySelector('.title');
  const terminalTitleEl = document.querySelector('.terminal-topbar-title');
  let openingControl = false;

  let jwt = null;
  let ws = null;
  let reconnectTimer = null;
  let lastUpdatedTs = null;
  let relativeTimer = null;
  let lastConnState = 'connecting';
  let currentCanvasPayload = null;
  let mainView = 'connecting'; // connecting | denied | welcome | canvas | center
  let centerView = null; // { messageKey, messageVars, withSpinner, buttonKey, buttonHandler, useCard }

  const openSessionsBtn = document.getElementById('openSessionsBtn');
  const sessionsPane = document.getElementById('sessions-pane');
  const sessionsBackBtn = document.getElementById('sessionsBackBtn');
  const sessionsHeaderTitle = document.getElementById('sessionsHeaderTitle');
  const sessionsRefreshBtn = document.getElementById('sessionsRefreshBtn');
  const sessionsListView = document.getElementById('sessions-list-view');
  const sessionsChatView = document.getElementById('sessions-chat-view');
  const sessionsListEl = document.getElementById('sessionsList');
  const sessionsListScroll = document.getElementById('sessionsListScroll');
  const sessionsPullHint = document.getElementById('sessionsPullHint');
  const sessionsMessagesEl = document.getElementById('sessionsMessages');
  const sessionsComposer = document.getElementById('sessionsComposer');
  const sessionsInput = document.getElementById('sessionsInput');
  const sessionsSendBtn = document.getElementById('sessionsSendBtn');

  // ---------- UI Helpers ----------
  function updateStaticChrome() {
    if (appTitleEl) appTitleEl.textContent = t('appTitle');
    if (openSessionsBtn) openSessionsBtn.textContent = t('btnSessions');
    if (openTerminalBtn) openTerminalBtn.textContent = t('btnTerminal');
    if (openControlBtn && !openingControl) openControlBtn.textContent = t('btnControl');
    if (langToggleBtn) {
      langToggleBtn.textContent = t('langToggle');
      langToggleBtn.setAttribute('aria-label', t('langToggleAria'));
    }
    if (terminalTitleEl) terminalTitleEl.textContent = t('terminalTitle');
    if (closeTerminalBtn) closeTerminalBtn.setAttribute('aria-label', t('terminalCloseAria'));
    if (sessionsInput) sessionsInput.placeholder = t('messagePlaceholder');
    if (sessionsSendBtn && !chatSending) sessionsSendBtn.textContent = t('btnSend');
    if (sessionsPane) sessionsPane.setAttribute('aria-label', t('sessionsTitle'));
    if (sessionsBackBtn) {
      const isList = sessionsView === 'list';
      sessionsBackBtn.setAttribute('aria-label', isList ? t('sessionsBackCloseAria') : t('sessionsBackAria'));
    }
    if (sessionsRefreshBtn) sessionsRefreshBtn.setAttribute('aria-label', t('sessionsRefreshAria'));
    if (sessionsPullHint && pullDistance <= 50) {
      sessionsPullHint.textContent = pullDistance > 50 ? t('releaseToRefresh') : t('pullDownRefresh');
    } else if (sessionsPullHint) {
      sessionsPullHint.textContent = t('pullDownRefresh');
    }
    if (lastUpdatedTs) updateLastUpdated(lastUpdatedTs);
    else if (lastUpdatedEl) lastUpdatedEl.textContent = t('lastUpdatedEmpty');
  }

  function refreshAllUi() {
    updateStaticChrome();
    setStatus(lastConnState);
    if (mainView === 'welcome') showWelcome();
    else if (mainView === 'canvas' && currentCanvasPayload) renderPayload(currentCanvasPayload);
    else if (mainView === 'center' && centerView) {
      showCenter(centerView.messageKey, centerView.messageVars, centerView.withSpinner, centerView.buttonKey, centerView.buttonHandler, centerView.useCard);
    } else if (mainView === 'connecting') showCenter('connecting', null, true, null, null, false);
    else if (mainView === 'denied') showCenter('accessDenied', null, false, 'btnClose', () => tg?.close?.(), true);

    if (sessionsPane?.classList.contains('is-open')) {
      setSessionsViewMode(sessionsView);
      if (sessionsView === 'list') renderSessionsList();
      else {
        updateSendButtonState();
        renderChatMessages();
      }
    }
  }

  function setStatus(state) {
    lastConnState = state;
    connDot.classList.remove('connected', 'connecting');
    if (state === 'connected') {
      connDot.classList.add('connected');
      connText.textContent = t('statusConnected');
    } else if (state === 'connecting' || state === 'reconnecting') {
      connDot.classList.add('connecting');
      connText.textContent = state === 'reconnecting' ? t('statusReconnecting') : t('statusConnecting');
    } else {
      connText.textContent = t('statusOffline');
    }
  }

  function setControlButtonLoading(isLoading) {
    if (!openControlBtn) return;
    if (isLoading) {
      openControlBtn.disabled = true;
      openControlBtn.textContent = t('btnOpening');
      openControlBtn.style.opacity = '0.75';
      openControlBtn.style.cursor = 'wait';
    } else {
      openControlBtn.disabled = false;
      openControlBtn.textContent = t('btnControl');
      openControlBtn.style.opacity = '';
      openControlBtn.style.cursor = '';
    }
  }

  function showCenter(messageKey, messageVars = null, withSpinner = false, buttonKey = null, buttonHandler = null, useCard = true) {
    mainView = 'center';
    centerView = { messageKey, messageVars, withSpinner, buttonKey, buttonHandler, useCard };
    currentCanvasPayload = null;
    contentEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'center fade-in';

    let holder = wrap;
    if (useCard) {
      const card = document.createElement('div');
      card.className = 'empty-card';
      wrap.appendChild(card);
      holder = card;
    }

    if (withSpinner) {
      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      holder.appendChild(spinner);
    }

    const text = document.createElement('div');
    text.textContent = t(messageKey, messageVars);
    holder.appendChild(text);

    if (buttonKey && buttonHandler) {
      const btn = document.createElement('button');
      btn.className = 'button';
      btn.textContent = t(buttonKey);
      btn.addEventListener('click', buttonHandler);
      holder.appendChild(btn);
    }

    contentEl.appendChild(wrap);
  }

  function showWelcome() {
    mainView = 'welcome';
    centerView = null;
    currentCanvasPayload = null;
    contentEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'center fade-in';
    const card = document.createElement('div');
    card.className = 'empty-card';

    const title = document.createElement('div');
    title.className = 'welcome-title';
    title.textContent = t('welcomeTitle');

    const lead = document.createElement('div');
    lead.className = 'welcome-lead';
    lead.textContent = t('welcomeLead');

    const actions = document.createElement('div');
    actions.className = 'welcome-actions';

    const sessionsBtn = document.createElement('button');
    sessionsBtn.type = 'button';
    sessionsBtn.className = 'button';
    sessionsBtn.textContent = t('welcomeOpenSessions');
    sessionsBtn.addEventListener('click', () => openSessions());

    const terminalBtn = document.createElement('button');
    terminalBtn.type = 'button';
    terminalBtn.className = 'button';
    terminalBtn.textContent = t('welcomeOpenTerminal');
    terminalBtn.addEventListener('click', openTerminalPane);

    actions.appendChild(sessionsBtn);
    actions.appendChild(terminalBtn);

    const hint = document.createElement('div');
    hint.className = 'welcome-hint';
    hint.textContent = t('welcomeHint');

    card.appendChild(title);
    card.appendChild(lead);
    card.appendChild(actions);
    card.appendChild(hint);
    wrap.appendChild(card);
    contentEl.appendChild(wrap);
  }

  function hasCanvasContent(payload) {
    if (!payload || payload.type === 'clear') return false;
    const content = payload.content;
    if (content === null || content === undefined) return false;
    if (typeof content === 'string') return content.trim().length > 0;
    if (typeof content === 'object') return Object.keys(content).length > 0;
    return Boolean(content);
  }

  function updateLastUpdated(ts) {
    lastUpdatedTs = ts || Date.now();
    lastUpdatedEl.textContent = t('lastUpdated', { time: formatRelative(lastUpdatedTs) });
    clearInterval(relativeTimer);
    relativeTimer = setInterval(() => {
      lastUpdatedEl.textContent = t('lastUpdated', { time: formatRelative(lastUpdatedTs) });
    }, 30000);
  }

  // ---------- Markdown Renderer (minimal) ----------
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderMarkdown(md) {
    // Simple, safe markdown conversion
    const lines = md.split('\n');
    let html = '';
    let inCodeBlock = false;
    let listType = null; // 'ul' | 'ol'

    const closeList = () => {
      if (listType) {
        html += `</${listType}>`;
        listType = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Code block (```) toggle
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          closeList();
          inCodeBlock = true;
          html += '<pre><code>';
        } else {
          inCodeBlock = false;
          html += '</code></pre>';
        }
        continue;
      }

      if (inCodeBlock) {
        html += `${escapeHtml(line)}\n`;
        continue;
      }

      // Headings
      if (/^###\s+/.test(line)) {
        closeList();
        html += `<h3>${escapeHtml(line.replace(/^###\s+/, ''))}</h3>`;
        continue;
      }
      if (/^##\s+/.test(line)) {
        closeList();
        html += `<h2>${escapeHtml(line.replace(/^##\s+/, ''))}</h2>`;
        continue;
      }
      if (/^#\s+/.test(line)) {
        closeList();
        html += `<h1>${escapeHtml(line.replace(/^#\s+/, ''))}</h1>`;
        continue;
      }

      // Lists
      const ulMatch = /^-\s+/.test(line);
      const olMatch = /^\d+\.\s+/.test(line);
      if (ulMatch || olMatch) {
        const type = ulMatch ? 'ul' : 'ol';
        if (listType && listType !== type) closeList();
        if (!listType) {
          listType = type;
          html += `<${listType}>`;
        }
        const itemText = line.replace(ulMatch ? /^-\s+/ : /^\d+\.\s+/, '');
        html += `<li>${inlineMarkdown(escapeHtml(itemText))}</li>`;
        continue;
      } else {
        closeList();
      }

      // Paragraphs / blank
      if (line.trim() === '') {
        html += '<br />';
      } else {
        html += `<p>${inlineMarkdown(escapeHtml(line))}</p>`;
      }
    }

    closeList();
    return html;
  }

  function inlineMarkdown(text) {
    // bold **text**
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // italic *text*
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // inline code `code`
    text = text.replace(/`(.+?)`/g, '<code>$1</code>');
    return text;
  }

  // ---------- Rendering ----------
  function renderA2UI(container, a2uiPayload) {
    // Optional A2UI runtime hook. If present, use it. Otherwise show JSON.
    const runtime = window.OpenClawA2UI || window.A2UI || null;
    if (runtime && typeof runtime.render === 'function') {
      try {
        runtime.render(container, a2uiPayload);
        return;
      } catch (_) {
        // fall through to JSON
      }
    }
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(a2uiPayload, null, 2);
    container.appendChild(pre);
  }

  // ---------- Terminal ----------
  let termInstance = null;
  let termWs = null;
  let termResizeObserver = null;

  function destroyTerminal() {
    if (termResizeObserver) { try { termResizeObserver.disconnect(); } catch (_) {} termResizeObserver = null; }
    if (termWs) { try { termWs.close(); } catch (_) {} termWs = null; }
    if (termInstance) { try { termInstance.dispose(); } catch (_) {} termInstance = null; }
    const pane = document.getElementById('terminal-pane');
    pane.style.display = 'none';
    // Remove dynamically built toolbar so it's fresh on next open
    pane.querySelector('.term-toolbar')?.remove();
    document.getElementById('terminal-container').innerHTML = '';
    // Canvas content and topbar are unaffected — they stay visible underneath
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function connectTerminal() {
    const pane = document.getElementById('terminal-pane');
    const containerEl = document.getElementById('terminal-container');
    containerEl.innerHTML = '';

    // Lazy-load xterm.js and FitAddon from CDN
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js');
      await loadScript('https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js');
    } catch (e) {
      containerEl.innerHTML = `<div style="color:#ff7b72;padding:16px">${escapeHtml(t('terminalLoadFailed'))}</div>`;
      return;
    }

    // Compute font size: target ~72 cols on the current device.
    // 72 cols fits most terminal output; floor at 10px (20 physical px on retina).
    // charWidthRatio ≈ 0.6 for typical monospace fonts in xterm.js.
    const _paneW = (pane.offsetWidth || window.innerWidth) - 8;
    const _fontSize = Math.max(10, Math.min(14, Math.round(_paneW / 72 / 0.6)));

    // Init xterm
    const term = new Terminal({
      cursorBlink: true,
      fontSize: _fontSize,
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#264f78',
        black: '#000000', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
        blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
        brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
        brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd', brightWhite: '#ffffff',
      },
      allowTransparency: false,
      scrollback: 1000,
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerEl);

    // Fit after paint
    requestAnimationFrame(() => {
      fitAddon.fit();
      term.focus();
    });

    termInstance = term;

    const wsUrl = `${wsProto()}//${location.host}/ws/terminal?token=${encodeURIComponent(jwt)}`;
    const tws = new WebSocket(wsUrl);
    termWs = tws;

    // ---- Sticky modifiers ----
    let ctrlActive = false;
    let altActive = false;

    function setModifier(mod, on) {
      if (mod === 'ctrl') ctrlActive = on;
      if (mod === 'alt') altActive = on;
      const btn = pane.querySelector(`.tbkey[data-mod="${mod}"]`);
      if (btn) btn.classList.toggle('active', on);
    }

    function sendRaw(data) {
      if (tws.readyState === WebSocket.OPEN) {
        tws.send(JSON.stringify({ type: 'data', data }));
      }
    }

    tws.onopen = () => {
      const dims = fitAddon.proposeDimensions();
      if (dims) tws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
    };

    tws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data') term.write(msg.data);
        else if (msg.type === 'exit') {
          term.writeln(`\r\n\x1b[33m${t('terminalProcessExited', { code: msg.code })}\x1b[0m`);
        }
      } catch (_) {}
    };

    tws.onclose = () => {
      if (termInstance) termInstance.writeln(`\r\n\x1b[31m${t('terminalConnClosed')}\x1b[0m`);
    };

    // Keyboard input → WS (apply sticky modifiers)
    term.onData((data) => {
      let out = data;
      if (ctrlActive && data.length === 1) {
        out = String.fromCharCode(data.charCodeAt(0) & 0x1f);
        setModifier('ctrl', false);
      } else if (altActive && data.length === 1) {
        out = '\x1b' + data;
        setModifier('alt', false);
      }
      sendRaw(out);
    });

    // ---- Mobile toolbar ----
    const TOOLBAR_KEYS = [
      { label: 'Ctrl', mod: 'ctrl' },
      { label: 'Alt',  mod: 'alt'  },
      { label: 'Esc',  seq: '\x1b' },
      { label: 'Tab',  seq: '\t'   },
      { label: '↑',    seq: '\x1b[A', arrow: true },
      { label: '↓',    seq: '\x1b[B', arrow: true },
      { label: '←',    seq: '\x1b[D', arrow: true },
      { label: '→',    seq: '\x1b[C', arrow: true },
    ];

    const toolbar = document.createElement('div');
    toolbar.className = 'term-toolbar';

    TOOLBAR_KEYS.forEach(({ label, mod, seq, arrow }) => {
      const btn = document.createElement('button');
      btn.className = 'tbkey' + (arrow ? ' tbkey-arrow' : '') + (mod ? ' tbkey-mod' : '');
      if (mod) btn.dataset.mod = mod;
      btn.textContent = label;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault(); // don't steal focus from xterm
        if (mod) {
          const current = mod === 'ctrl' ? ctrlActive : altActive;
          // toggle off the other modifier
          if (mod === 'ctrl' && altActive) setModifier('alt', false);
          if (mod === 'alt' && ctrlActive) setModifier('ctrl', false);
          setModifier(mod, !current);
        } else {
          sendRaw(seq);
          term.focus();
        }
      });
      toolbar.appendChild(btn);
    });

    pane.appendChild(toolbar);

    // Resize: observe pane, fit, send new dims to server
    termResizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims && tws.readyState === WebSocket.OPEN) {
          tws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
        }
      } catch (_) {}
    });
    termResizeObserver.observe(pane);
  }

  // ---------- Canvas rendering ----------
  function renderPayload(payload) {
    if (!hasCanvasContent(payload)) {
      destroyTerminal();
      showWelcome();
      return;
    }

    mainView = 'canvas';
    centerView = null;
    currentCanvasPayload = payload;
    const { format, content } = payload;
    contentEl.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'fade-in';

    if (format === 'html') {
      // Trusted HTML from server (agent only)
      container.innerHTML = content || '';
      // Execute inline scripts (Telegram WebView doesn't run scripts from innerHTML)
      container.querySelectorAll('script').forEach((oldScript) => {
        const s = document.createElement('script');
        if (oldScript.src) s.src = oldScript.src;
        s.type = oldScript.type || 'text/javascript';
        s.text = oldScript.textContent || '';
        oldScript.replaceWith(s);
      });
    } else if (format === 'markdown') {
      container.innerHTML = renderMarkdown(content || '');
    } else if (format === 'a2ui') {
      renderA2UI(container, content || {});
    } else {
      // text
      const pre = document.createElement('pre');
      pre.textContent = content || '';
      container.appendChild(pre);
    }

    contentEl.appendChild(container);
    updateLastUpdated(Date.now());
  }

  // ---------- Auth + Networking ----------
  async function authenticate() {
    const initData = tg?.initData || '';
    try {
      const res = await fetch('/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });

      if (!res.ok) throw new Error('auth_failed');
      const data = await res.json();
      if (!data?.token) throw new Error('no_token');
      jwt = data.token;
      setupSessionsUiOnce();

      return true;
    } catch (e) {
      return false;
    }
  }

  async function fetchState() {
    try {
      const res = await fetch(`/state?token=${encodeURIComponent(jwt)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  function connectWS() {
    if (!jwt) return;

    const wsUrl = `${wsProto()}//${location.host}/ws?token=${encodeURIComponent(jwt)}`;

    setStatus('connecting');
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ping') return;
        if (msg.type === 'clear') {
          renderPayload({ type: 'clear' });
          return;
        }
        if (msg.type === 'canvas') {
          renderPayload(msg);
        }
      } catch (e) {
        // ignore malformed message
      }
    };

    ws.onerror = () => {
      setStatus('reconnecting');
    };

    ws.onclose = () => {
      setStatus('reconnecting');
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      connectWS();
    }, 3000);
  }

  // ---------- Sessions ----------
  let sessionsView = 'list';
  let sessionsList = [];
  let activeSessionKey = null;
  let chatMessages = [];
  let sessionWs = null;
  let sessionsLoading = false;
  let chatSending = false;
  let pullStartY = 0;
  let pullDistance = 0;
  let chatStickToBottom = true;
  let sessionsUiReady = false;

  function resizeSessionsInput() {
    if (!sessionsInput) return;
    sessionsInput.style.height = 'auto';
    sessionsInput.style.height = `${Math.min(sessionsInput.scrollHeight, 120)}px`;
  }

  function updateSendButtonState() {
    if (!sessionsSendBtn) return;
    sessionsSendBtn.disabled = chatSending;
    sessionsSendBtn.textContent = chatSending ? '…' : t('btnSend');
  }

  function scrollMessagesToBottom(force = false) {
    if (!sessionsMessagesEl) return;
    if (!force && !chatStickToBottom) return;
    requestAnimationFrame(() => {
      sessionsMessagesEl.scrollTop = sessionsMessagesEl.scrollHeight;
    });
  }

  function setupSessionsUiOnce() {
    if (sessionsUiReady) return;
    sessionsUiReady = true;

    sessionsBackBtn?.addEventListener('click', () => {
      if (sessionsView === 'chat') {
        sessionsView = 'list';
        activeSessionKey = null;
        chatMessages = [];
        chatSending = false;
        disconnectSessionWs();
        setSessionsViewMode('list');
        renderSessionsList();
      } else {
        closeSessions();
      }
    });

    sessionsRefreshBtn?.addEventListener('click', () => fetchSessionsList(true));

    sessionsListScroll?.addEventListener('scroll', () => {
      if (sessionsListScroll.scrollTop <= 0) return;
      pullStartY = 0;
      pullDistance = 0;
    }, { passive: true });

    sessionsListScroll?.addEventListener('touchstart', (e) => {
      if (sessionsListScroll.scrollTop <= 0) {
        pullStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    sessionsListScroll?.addEventListener('touchmove', (e) => {
      if (!pullStartY || sessionsListScroll.scrollTop > 0) return;
      pullDistance = Math.max(0, e.touches[0].clientY - pullStartY);
      if (pullDistance > 8) {
        sessionsPullHint.textContent = pullDistance > 50 ? t('releaseToRefresh') : t('pullDownRefresh');
        sessionsPullHint.classList.toggle('is-active', pullDistance > 50);
      }
    }, { passive: true });

    sessionsListScroll?.addEventListener('touchend', () => {
      if (pullDistance > 50) fetchSessionsList(false);
      pullStartY = 0;
      pullDistance = 0;
      sessionsPullHint.textContent = t('pullDownRefresh');
      sessionsPullHint.classList.remove('is-active');
    });

    sessionsMessagesEl?.addEventListener('scroll', () => {
      const el = sessionsMessagesEl;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      chatStickToBottom = nearBottom;
    }, { passive: true });

    sessionsInput?.addEventListener('input', resizeSessionsInput);
    sessionsInput?.addEventListener('focus', () => {
      setTimeout(() => scrollMessagesToBottom(true), 300);
    });

    sessionsComposer?.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = sessionsInput?.value || '';
      if (!val.trim() || chatSending) return;
      sessionsInput.value = '';
      resizeSessionsInput();
      sendChatMessage(val);
    });
  }

  function setSessionsViewMode(mode) {
    sessionsView = mode;
    const isList = mode === 'list';
    sessionsListView.hidden = !isList;
    sessionsChatView.hidden = isList;
    sessionsRefreshBtn.hidden = !isList;
    sessionsBackBtn.textContent = isList ? '✕' : t('btnBack');
    sessionsBackBtn.setAttribute('aria-label', isList ? t('sessionsBackCloseAria') : t('sessionsBackAria'));
    sessionsRefreshBtn.setAttribute('aria-label', t('sessionsRefreshAria'));
    if (isList) {
      sessionsHeaderTitle.textContent = t('sessionsTitle');
    } else {
      const session = sessionsList.find((s) => s.key === activeSessionKey);
      sessionsHeaderTitle.textContent = session ? sessionTitle(session) : t('chatTitle');
    }
  }

  function sessionTitle(session) {
    return session.derivedTitle || session.displayName || session.label || session.key || t('sessionDefault');
  }

  function extractMessageText(msg) {
    if (!msg || typeof msg !== 'object') return '';
    if (typeof msg.text === 'string' && msg.text.trim()) return msg.text;
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content.map((block) => {
        if (!block || typeof block !== 'object') return '';
        if (block.type === 'text' && typeof block.text === 'string') return block.text;
        return '';
      }).filter(Boolean).join('\n');
    }
    return '';
  }

  function messageRole(msg) {
    const role = typeof msg?.role === 'string' ? msg.role.toLowerCase() : '';
    if (role === 'user' || role === 'human') return 'user';
    if (role === 'assistant' || role === 'model') return 'assistant';
    return 'assistant';
  }

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    };
  }

  async function apiFetch(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { ...authHeaders(), ...(opts.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function closeSessions() {
    sessionsPane.classList.remove('is-open');
    sessionsView = 'list';
    activeSessionKey = null;
    chatMessages = [];
    chatSending = false;
    disconnectSessionWs();
    setSessionsViewMode('list');
  }

  function disconnectSessionWs() {
    if (sessionWs) {
      try { sessionWs.close(); } catch (_) {}
      sessionWs = null;
    }
  }

  function connectSessionWs(sessionKey) {
    disconnectSessionWs();
    if (!sessionKey || !jwt) return;
    const wsUrl = `${wsProto()}//${location.host}/ws/sessions?token=${encodeURIComponent(jwt)}&sessionKey=${encodeURIComponent(sessionKey)}`;
    const sws = new WebSocket(wsUrl);
    sessionWs = sws;

    sws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'event') {
          handleSessionEvent(msg.event, msg.payload, sessionKey);
        }
      } catch (_) {}
    };

    sws.onopen = () => {
      if (sws.readyState === WebSocket.OPEN) {
        sws.send(JSON.stringify({ type: 'subscribe', sessionKey }));
      }
    };
  }

  function handleSessionEvent(eventName, payload, sessionKey) {
    if (eventName === 'session.message' && payload?.sessionKey === sessionKey && payload.message) {
      appendChatMessage(payload.message, { replaceOptimistic: true });
      return;
    }
    if (eventName === 'chat' && payload?.sessionKey === sessionKey) {
      const state = payload.state;
      if (state === 'delta' || state === 'final') {
        const text = extractMessageText(payload.message) || (typeof payload.text === 'string' ? payload.text : '');
        if (text) upsertStreamingAssistant(text, state === 'final', payload.runId);
      }
      if (state === 'final' || state === 'error' || state === 'aborted') {
        chatSending = false;
        updateSendButtonState();
      }
      return;
    }
    if (eventName === 'sessions.changed') {
      if (sessionsView === 'list') fetchSessionsList(false);
    }
  }

  function upsertStreamingAssistant(text, isFinal, runId) {
    const id = runId ? `run:${runId}` : `stream:${activeSessionKey}`;
    const existing = chatMessages.find((m) => m.id === id);
    if (existing) {
      existing.text = text;
      existing.pending = !isFinal;
    } else {
      chatMessages.push({
        id,
        role: 'assistant',
        text,
        timestamp: Date.now(),
        pending: !isFinal,
      });
    }
    renderChatMessages();
  }

  function appendChatMessage(msg, opts = {}) {
    const text = extractMessageText(msg);
    if (!text.trim()) return;
    const role = messageRole(msg);
    const ts = typeof msg.timestamp === 'number' ? msg.timestamp : Date.now();
    if (role === 'user') {
      // Replace any optimistic user message (regardless of opts)
      const optimistic = chatMessages.findIndex((m) => m.optimistic && m.role === 'user');
      if (optimistic >= 0) {
        chatMessages[optimistic] = {
          id: msg.id || `msg:${ts}`,
          role: 'user',
          text,
          timestamp: ts,
        };
        renderChatMessages();
        return;
      }
      // Dedupe by text+role for user messages (in case WS sends confirmation)
      const dupe = chatMessages.find((m) => m.role === 'user' && m.text === text && Math.abs(m.timestamp - ts) < 5000);
      if (dupe) return;
    }
    const id = msg.id || `msg:${ts}:${Math.random().toString(36).slice(2, 7)}`;
    if (chatMessages.some((m) => m.id === id)) return;
    chatMessages.push({ id, role, text, timestamp: ts });
    renderChatMessages();
  }

  async function fetchSessionsList(showSpinner = true) {
    if (sessionsLoading) return;
    sessionsLoading = true;
    if (showSpinner) renderSessionsList();
    sessionsRefreshBtn.disabled = true;
    sessionsRefreshBtn.textContent = '…';
    try {
      const data = await apiFetch('/api/sessions?limit=80');
      sessionsList = Array.isArray(data.sessions) ? data.sessions : [];
      sessionsList.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } catch (_) {
      if (sessionsList.length === 0) sessionsList = [];
    } finally {
      sessionsLoading = false;
      sessionsRefreshBtn.disabled = false;
      sessionsRefreshBtn.textContent = t('btnRefresh');
      renderSessionsList();
    }
  }

  function renderSessionsList() {
    if (!sessionsListEl) return;
    sessionsListEl.innerHTML = '';

    if (sessionsLoading && sessionsList.length === 0) {
      const loading = document.createElement('li');
      loading.className = 'sessions-empty';
      loading.textContent = t('loadingSessions');
      sessionsListEl.appendChild(loading);
      return;
    }

    if (sessionsList.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'sessions-empty';
      empty.textContent = t('noSessions');
      sessionsListEl.appendChild(empty);
      return;
    }

    for (const session of sessionsList) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'session-item' + (session.key === activeSessionKey ? ' active' : '');

      const titleEl = document.createElement('div');
      titleEl.className = 'session-item-title';
      titleEl.textContent = sessionTitle(session);
      btn.appendChild(titleEl);

      if (session.lastMessagePreview) {
        const p = document.createElement('div');
        p.className = 'session-item-preview';
        p.textContent = session.lastMessagePreview;
        btn.appendChild(p);
      }

      const meta = document.createElement('div');
      meta.className = 'session-item-meta';
      meta.textContent = session.updatedAt ? formatRelative(session.updatedAt) : '';
      btn.appendChild(meta);

      btn.addEventListener('click', () => openSessionChat(session.key));
      li.appendChild(btn);
      sessionsListEl.appendChild(li);
    }
  }

  async function openSessionChat(sessionKey) {
    activeSessionKey = sessionKey;
    chatMessages = [];
    chatSending = false;
    chatStickToBottom = true;
    setSessionsViewMode('chat');
    updateSendButtonState();
    renderChatMessages();
    if (sessionsInput) {
      sessionsInput.value = '';
      resizeSessionsInput();
    }

    try {
      const data = await apiFetch(`/api/sessions/${encodeURIComponent(sessionKey)}/history?limit=120`);
      const msgs = Array.isArray(data.messages) ? data.messages : [];
      chatMessages = msgs.map((m, i) => ({
        id: m.id || `hist:${i}`,
        role: messageRole(m),
        text: extractMessageText(m),
        timestamp: typeof m.timestamp === 'number' ? m.timestamp : undefined,
      })).filter((m) => m.text.trim());
    } catch (_) {
      chatMessages = [{ id: 'err', role: 'assistant', text: t('failedLoadHistory'), timestamp: Date.now() }];
    }

    renderChatMessages(true);
    connectSessionWs(sessionKey);
    setTimeout(() => sessionsInput?.focus(), 150);
  }

  async function sendChatMessage(text) {
    if (!activeSessionKey || !text.trim() || chatSending) return;
    const trimmed = text.trim();
    const optimisticId = `opt:${Date.now()}`;
    chatMessages.push({
      id: optimisticId,
      role: 'user',
      text: trimmed,
      timestamp: Date.now(),
      optimistic: true,
    });
    chatSending = true;
    chatStickToBottom = true;
    updateSendButtonState();
    renderChatMessages(true);

    try {
      await apiFetch(`/api/sessions/${encodeURIComponent(activeSessionKey)}/send`, {
        method: 'POST',
        body: JSON.stringify({ message: trimmed }),
      });
      const opt = chatMessages.find((m) => m.id === optimisticId);
      if (opt) delete opt.optimistic;
      // Agent reply arrives via WebSocket; reset sending after timeout if no response
      setTimeout(() => {
        if (chatSending) {
          chatSending = false;
          updateSendButtonState();
        }
      }, 120_000);
    } catch (e) {
      chatSending = false;
      updateSendButtonState();
      const opt = chatMessages.find((m) => m.id === optimisticId);
      if (opt) {
        opt.failed = true;
        opt.optimistic = false;
      }
      renderChatMessages();
    }
  }

  function renderChatMessages(forceScroll = false) {
    if (!sessionsMessagesEl) return;
    sessionsMessagesEl.innerHTML = '';

    if (chatMessages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sessions-empty';
      empty.textContent = t('noMessages');
      sessionsMessagesEl.appendChild(empty);
      return;
    }

    for (const msg of chatMessages) {
      if (!msg.text?.trim()) continue;
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble ${msg.role}${msg.failed ? ' failed' : ''}${msg.pending ? ' pending' : ''}`;

      const body = document.createElement('div');
      body.className = 'chat-bubble-body';
      body.textContent = msg.text;
      bubble.appendChild(body);

      if (msg.timestamp) {
        const time = document.createElement('span');
        time.className = 'chat-bubble-time';
        time.textContent = formatMessageTime(msg.timestamp);
        bubble.appendChild(time);
      }

      sessionsMessagesEl.appendChild(bubble);
    }

    scrollMessagesToBottom(forceScroll);
  }

  function openSessions() {
    setupSessionsUiOnce();
    sessionsPane.classList.add('is-open');
    sessionsView = 'list';
    setSessionsViewMode('list');
    renderSessionsList();
    fetchSessionsList(true);
  }

  // ---------- Boot ----------
  async function boot() {
    updateStaticChrome();
    i18n.onLangChange(() => refreshAllUi());
    langToggleBtn?.addEventListener('click', () => i18n.toggleLang());
    openTerminalBtn?.addEventListener('click', openTerminalPane);
    closeTerminalBtn?.addEventListener('click', destroyTerminal);
    openSessionsBtn?.addEventListener('click', openSessions);
    openControlBtn?.addEventListener('click', () => {
      if (openingControl || !jwt) return;
      openingControl = true;
      setControlButtonLoading(true);
      setStatus('connecting');
      connText.textContent = t('statusOpeningControl');
      setTimeout(() => {
        window.location.assign(`/oc/?token=${encodeURIComponent(jwt)}`);
      }, 80);
    });

    mainView = 'connecting';
    setStatus('connecting');
    showCenter('connecting', null, true, null, null, false);

    const authed = await authenticate();
    if (!authed) {
      mainView = 'denied';
      setStatus('disconnected');
      showCenter('accessDenied', null, false, 'btnClose', () => tg?.close?.(), true);
      return;
    }

    // Fetch current state before WS connect
    const state = await fetchState();
    if (state && hasCanvasContent(state)) renderPayload(state);
    else showWelcome();

    connectWS();
  }

  boot();
})();
