// app.js — Anaya frontend. No API keys live here; everything AI-related
// goes through our own backend at /api/*.

(() => {
  'use strict';

  // ---------------------------------------------------------------------
  // Storage keys & helpers
  // ---------------------------------------------------------------------
  const LS_MESSAGES = 'anaya.messages.v1';
  const LS_MEMORIES = 'anaya.memories.v1';
  const LS_SETTINGS = 'anaya.settings.v1';
  const LS_SUMMARY = 'anaya.oldSummary.v1';

  const MAX_STORED_MESSAGES = 400;   // hard cap so localStorage can't grow forever
  const CONTEXT_WINDOW = 20;         // how many recent messages we send to the AI
  const SUMMARIZE_TRIGGER = 60;      // once local history passes this, fold the oldest chunk into a summary

  const load = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full/unavailable — degrade silently */ }
  };

  let state = {
    messages: load(LS_MESSAGES, []),      // {id, role: 'user'|'anaya', text, ts, status}
    memories: load(LS_MEMORIES, []),      // {id, text, ts}
    oldSummary: load(LS_SUMMARY, ''),
    settings: load(LS_SETTINGS, { theme: 'system', playfulness: 1 }),
  };

  // ---------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  const messagesEl = $('messages');
  const typingRow = $('typingRow');
  const composerForm = $('composerForm');
  const messageInput = $('messageInput');
  const sendBtn = $('sendBtn');
  const statusDot = $('statusDot');
  const statusText = $('statusText');

  const menuBtn = $('menuBtn');
  const menuSheet = $('menuSheet');
  const menuBackdrop = $('menuBackdrop');
  const closeSheetBtn = $('closeSheetBtn');
  const openMemoryBtn = $('openMemoryBtn');
  const openSettingsBtn = $('openSettingsBtn');
  const clearChatBtn = $('clearChatBtn');

  const settingsScreen = $('settingsScreen');
  const settingsBackBtn = $('settingsBackBtn');
  const themeSegmented = $('themeSegmented');
  const warmthRange = $('warmthRange');
  const settingsOpenMemory = $('settingsOpenMemory');
  const settingsClearChat = $('settingsClearChat');

  const memoryScreen = $('memoryScreen');
  const memoryBackBtn = $('memoryBackBtn');
  const memoryList = $('memoryList');
  const memoryEmptyState = $('memoryEmptyState');
  const addMemoryForm = $('addMemoryForm');
  const addMemoryInput = $('addMemoryInput');

  const confirmBackdrop = $('confirmBackdrop');
  const confirmModal = $('confirmModal');
  const confirmMessage = $('confirmMessage');
  const confirmCancelBtn = $('confirmCancelBtn');
  const confirmOkBtn = $('confirmOkBtn');

  const emojiBtn = $('emojiBtn');
  const emojiPanel = $('emojiPanel');

  // ---------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.settings.theme);
    [...themeSegmented.children].forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === state.settings.theme);
    });
  }

  themeSegmented.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    state.settings.theme = btn.dataset.theme;
    save(LS_SETTINGS, state.settings);
    applyTheme();
  });

  warmthRange.value = state.settings.playfulness ?? 1;
  warmthRange.addEventListener('input', () => {
    state.settings.playfulness = Number(warmthRange.value);
    save(LS_SETTINGS, state.settings);
  });

  // ---------------------------------------------------------------------
  // Date / time helpers
  // ---------------------------------------------------------------------
  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  function dayLabel(ts) {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    if (sameDay(d, today)) return 'TODAY';
    if (sameDay(d, yesterday)) return 'YESTERDAY';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function renderAll() {
    messagesEl.innerHTML = '';
    let lastDay = null;

    state.messages.forEach((m) => {
      const day = dayLabel(m.ts);
      if (day !== lastDay) {
        const sep = document.createElement('div');
        sep.className = 'date-sep';
        sep.textContent = day;
        messagesEl.appendChild(sep);
        lastDay = day;
      }
      messagesEl.appendChild(renderMessage(m));
    });
    scrollToBottom();
  }

  function renderMessage(m) {
    const row = document.createElement('div');
    row.className = `msg-row ${m.role === 'user' ? 'mine' : 'theirs'}${m.error ? ' msg-error' : ''}`;
    row.dataset.id = m.id;

    if (m.role !== 'user') {
      const av = document.createElement('div');
      av.className = 'avatar avatar-sm';
      av.innerHTML = '<img src="icons/anaya-avatar.svg" alt="" />';
      row.appendChild(av);
    }

    const col = document.createElement('div');
    col.className = 'bubble-col';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = m.text;
    col.appendChild(bubble);

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    let metaText = formatTime(m.ts);
    if (m.role === 'user') {
      metaText += m.status === 'sending' ? ' · Sending' : m.status === 'delivered' ? ' · Delivered' : ' · Read';
    }
    meta.textContent = metaText;
    col.appendChild(meta);

    row.appendChild(col);
    return row;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function appendMessage(m) {
    state.messages.push(m);
    if (state.messages.length > MAX_STORED_MESSAGES) {
      state.messages.splice(0, state.messages.length - MAX_STORED_MESSAGES);
    }
    persistMessages();
    const day = state.messages.length > 1 ? dayLabel(state.messages[state.messages.length - 2].ts) : null;
    if (dayLabel(m.ts) !== day) {
      const sep = document.createElement('div');
      sep.className = 'date-sep';
      sep.textContent = dayLabel(m.ts);
      messagesEl.appendChild(sep);
    }
    messagesEl.appendChild(renderMessage(m));
    scrollToBottom();
  }

  function persistMessages() {
    save(LS_MESSAGES, state.messages);
  }

  function updateMessageStatus(id, status) {
    const m = state.messages.find((x) => x.id === id);
    if (!m) return;
    m.status = status;
    persistMessages();
    const row = messagesEl.querySelector(`[data-id="${id}"]`);
    if (row) {
      const meta = row.querySelector('.msg-meta');
      if (meta) meta.textContent = `${formatTime(m.ts)} · ${status === 'delivered' ? 'Delivered' : 'Read'}`;
    }
  }

  // ---------------------------------------------------------------------
  // Empty state / greeting
  // ---------------------------------------------------------------------
  function maybeGreet() {
    if (state.messages.length === 0) {
      appendMessage({
        id: crypto.randomUUID(),
        role: 'anaya',
        text: "heyy 👋 I'm Anaya. what's up?",
        ts: Date.now(),
      });
    }
  }

  // ---------------------------------------------------------------------
  // Composer
  // ---------------------------------------------------------------------
  function autoResize() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  }
  messageInput.addEventListener('input', () => {
    autoResize();
    sendBtn.disabled = messageInput.value.trim().length === 0;
  });
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      composerForm.requestSubmit();
    }
  });

  composerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;
    messageInput.value = '';
    autoResize();
    sendBtn.disabled = true;
    hideEmojiPanel();
    sendUserMessage(text);
  });

  // ---------------------------------------------------------------------
  // Chat flow
  // ---------------------------------------------------------------------
  let isWaitingForReply = false;

  window.addEventListener('online', () => setOnlineStatus('online'));
  window.addEventListener('offline', () => setOnlineStatus('offline'));

  async function sendUserMessage(text) {
    const userMsg = { id: crypto.randomUUID(), role: 'user', text, ts: Date.now(), status: 'sending' };
    appendMessage(userMsg);

    setTimeout(() => updateMessageStatus(userMsg.id, 'delivered'), 350);

    if (isWaitingForReply) return; // simple guard against overlap
    isWaitingForReply = true;
    setOnlineStatus('typing');

    // small natural delay before the typing indicator even shows up
    await wait(300 + Math.random() * 400);
    typingRow.hidden = false;
    scrollToBottom();

    try {
      const history = buildHistoryForContext();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          memories: state.memories.map((m) => m.text),
          oldSummary: state.oldSummary,
          playfulness: state.settings.playfulness,
        }),
      });

      const data = await res.json().catch(() => ({}));

      // realistic-but-not-excessive reply delay, scaled a bit by reply length
      const replyText = res.ok ? data.reply : (data.friendly || "hmm, something went wrong on my end 😕");
      const delay = Math.min(2600, 500 + replyText.length * 12);
      await wait(delay);

      typingRow.hidden = true;

      appendMessage({
        id: crypto.randomUUID(),
        role: 'anaya',
        text: replyText,
        ts: Date.now(),
        error: !res.ok,
      });

      updateMessageStatus(userMsg.id, 'read');

      if (res.ok && Array.isArray(data.newMemories) && data.newMemories.length > 0) {
        data.newMemories.forEach((fact) => addMemory(fact, false));
        renderMemoryList();
      }

      maybeSummarizeOldHistory();
    } catch (err) {
      typingRow.hidden = true;
      appendMessage({
        id: crypto.randomUUID(),
        role: 'anaya',
        text: "can't reach the server right now — check your connection (or make sure the backend is running) 😬",
        ts: Date.now(),
        error: true,
      });
    } finally {
      isWaitingForReply = false;
      setOnlineStatus(navigator.onLine ? 'online' : 'offline');
    }
  }

  function buildHistoryForContext() {
    return state.messages
      .slice(-CONTEXT_WINDOW)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  }

  async function maybeSummarizeOldHistory() {
    if (state.messages.length < SUMMARIZE_TRIGGER) return;
    const overflowCount = state.messages.length - CONTEXT_WINDOW;
    if (overflowCount <= 0) return;

    const chunk = state.messages.slice(0, Math.min(overflowCount, 30))
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));

    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chunk, previousSummary: state.oldSummary }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.summary) {
        state.oldSummary = data.summary;
        save(LS_SUMMARY, state.oldSummary);
      }
    } catch { /* non-critical — just skip this round */ }
  }

  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function setOnlineStatus(mode) {
    if (mode === 'typing') {
      statusText.textContent = 'typing...';
      statusDot.classList.remove('offline');
    } else if (mode === 'offline' || !navigator.onLine) {
      statusText.textContent = 'offline';
      statusDot.classList.add('offline');
    } else {
      statusText.textContent = 'online';
      statusDot.classList.remove('offline');
    }
  }

  // ---------------------------------------------------------------------
  // Memory
  // ---------------------------------------------------------------------
  function addMemory(text, persistImmediately = true) {
    const clean = text.trim();
    if (!clean) return;
    const exists = state.memories.some((m) => m.text.toLowerCase() === clean.toLowerCase());
    if (exists) return;
    state.memories.push({ id: crypto.randomUUID(), text: clean, ts: Date.now() });
    if (persistImmediately) save(LS_MEMORIES, state.memories);
    else save(LS_MEMORIES, state.memories);
  }

  function removeMemory(id) {
    state.memories = state.memories.filter((m) => m.id !== id);
    save(LS_MEMORIES, state.memories);
    renderMemoryList();
  }

  function renderMemoryList() {
    memoryList.innerHTML = '';
    memoryEmptyState.hidden = state.memories.length > 0;
    state.memories
      .slice()
      .reverse()
      .forEach((m) => {
        const li = document.createElement('li');
        li.className = 'memory-item';
        const span = document.createElement('span');
        span.textContent = m.text;
        const btn = document.createElement('button');
        btn.textContent = '✕';
        btn.setAttribute('aria-label', 'Delete memory');
        btn.addEventListener('click', () => removeMemory(m.id));
        li.appendChild(span);
        li.appendChild(btn);
        memoryList.appendChild(li);
      });
  }

  addMemoryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = addMemoryInput.value.trim();
    if (!val) return;
    addMemory(val);
    addMemoryInput.value = '';
    renderMemoryList();
  });

  // ---------------------------------------------------------------------
  // Menu sheet
  // ---------------------------------------------------------------------
  function openSheet() {
    menuSheet.hidden = false;
    menuBackdrop.hidden = false;
  }
  function closeSheet() {
    menuSheet.hidden = true;
    menuBackdrop.hidden = true;
  }
  menuBtn.addEventListener('click', openSheet);
  menuBackdrop.addEventListener('click', closeSheet);
  closeSheetBtn.addEventListener('click', closeSheet);

  openMemoryBtn.addEventListener('click', () => { closeSheet(); openMemoryScreen(); });
  openSettingsBtn.addEventListener('click', () => { closeSheet(); openSettingsScreen(); });
  clearChatBtn.addEventListener('click', () => { closeSheet(); askClearConversation(); });
  settingsOpenMemory.addEventListener('click', openMemoryScreen);
  settingsClearChat.addEventListener('click', askClearConversation);

  // ---------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------
  function openSettingsScreen() { settingsScreen.hidden = false; }
  function closeSettingsScreen() { settingsScreen.hidden = true; }
  settingsBackBtn.addEventListener('click', closeSettingsScreen);

  function openMemoryScreen() {
    renderMemoryList();
    memoryScreen.hidden = false;
  }
  function closeMemoryScreen() { memoryScreen.hidden = true; }
  memoryBackBtn.addEventListener('click', closeMemoryScreen);

  $('backBtn').addEventListener('click', () => {
    // In a standalone chat app there's nowhere "back" to go — treat as a no-op
    // affordance, matching a real messaging app's chat detail screen.
  });

  // ---------------------------------------------------------------------
  // Confirm modal (used for clearing the conversation)
  // ---------------------------------------------------------------------
  let pendingConfirmAction = null;

  function askClearConversation() {
    confirmMessage.textContent = 'Clear this whole conversation? This can\u2019t be undone.';
    pendingConfirmAction = clearConversation;
    confirmBackdrop.hidden = false;
    confirmModal.hidden = false;
  }
  function closeConfirm() {
    confirmBackdrop.hidden = true;
    confirmModal.hidden = true;
    pendingConfirmAction = null;
  }
  confirmCancelBtn.addEventListener('click', closeConfirm);
  confirmBackdrop.addEventListener('click', closeConfirm);
  confirmOkBtn.addEventListener('click', () => {
    if (pendingConfirmAction) pendingConfirmAction();
    closeConfirm();
  });

  function clearConversation() {
    state.messages = [];
    state.oldSummary = '';
    save(LS_MESSAGES, state.messages);
    save(LS_SUMMARY, state.oldSummary);
    messagesEl.innerHTML = '';
    maybeGreet();
  }

  // ---------------------------------------------------------------------
  // Emoji panel (lightweight, no external deps)
  // ---------------------------------------------------------------------
  const EMOJIS = ['😀','😂','🥹','😍','😅','😭','😊','🙃','😉','😴','🤔','😳','🙄','😤','😱','🥳','😎','🤗','👀','👍','👎','🙏','🔥','✨','💀','❤️','💔','🎉','😢','😡'];

  function buildEmojiPanel() {
    emojiPanel.innerHTML = '';
    EMOJIS.forEach((em) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = em;
      btn.addEventListener('click', () => {
        messageInput.value += em;
        messageInput.focus();
        sendBtn.disabled = messageInput.value.trim().length === 0;
      });
      emojiPanel.appendChild(btn);
    });
  }
  function hideEmojiPanel() { emojiPanel.hidden = true; }
  emojiBtn.addEventListener('click', () => {
    emojiPanel.hidden = !emojiPanel.hidden;
  });

  $('attachBtn').addEventListener('click', () => {
    appendMessage({
      id: crypto.randomUUID(),
      role: 'anaya',
      text: "attachments aren't wired up yet in this build \u2014 but I'm listening 👀",
      ts: Date.now(),
    });
  });

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  function init() {
    applyTheme();
    buildEmojiPanel();
    renderAll();
    maybeGreet();
    setOnlineStatus('online');

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(() => { /* PWA is a nice-to-have, not required */ });
      });
    }
  }

  init();
})();
