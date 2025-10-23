// ==UserScript==
// @name         ChatGPT Question Buttons
// @namespace    https://greasyfork.org/en/users/you
// @version      1.3.0
// @description  Finds the last paragraph with a question in assistant messages and adds Yes buttons (Yes N when there is "or"); processes existing and new messages. Watches task status buttons, emits events and logs when statuses update or complete.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// @updateURL https://raw.githubusercontent.com/popstas/userscripts/refs/heads/master/src/userscripts/chatgpt-question-buttons.user.js
// @downloadURL https://raw.githubusercontent.com/popstas/userscripts/refs/heads/master/src/userscripts/chatgpt-question-buttons.user.js
// ==/UserScript==

(function () {
  "use strict";

  const SELECTORS = {
    assistantMsg: '[data-message-author-role="assistant"]',
    markdown: '.markdown',
    markdownPara: '.markdown p',
    // важно: сам #prompt-textarea является contenteditable
    promptEditable: '#prompt-textarea[contenteditable="true"]',
  };

  const BTN_CLASS = 'cgpt-yes-btn';
  const STATUS_EVENT_NAME = 'cgpt-task-status';
  const STATUS_SELECTORS = {
    statusText: '.line-clamp-1.font-medium',
    statusButton: 'button.text-token-text-secondary.text-sm.select-none',
    taskName: 'div.flex.min-w-0.flex-col.text-sm span.truncate.font-medium',
  };

  const statusState = {
    activeTexts: new Set(),
    seenCompleting: false,
    lastTaskName: '',
    lastStatusText: '',
    lastCompletingText: '',
  };

  const runMicrotask = typeof queueMicrotask === 'function'
    ? queueMicrotask.bind(window)
    : (cb) => Promise.resolve().then(cb);

  function toArray(iterable) {
    return Array.from(iterable || []);
  }

  function dispatchStatusEvent(detail) {
    const payload = {
      statuses: detail.statuses || toArray(statusState.activeTexts),
      taskName: detail.taskName || statusState.lastTaskName || '',
      timestamp: Date.now(),
      ...detail,
    };

    if (typeof console !== 'undefined' && console.info) {
      const prefix = '[cgpt-status]';
      if (payload.type === 'status') {
        console.info(`${prefix} ${payload.taskName ? `[${payload.taskName}] ` : ''}${payload.status}`);
      } else if (payload.type === 'completed') {
        const lastInfo = payload.lastKnownStatus ? ` (last: ${payload.lastKnownStatus})` : '';
        console.info(`${prefix} ${payload.taskName ? `[${payload.taskName}] ` : ''}Task completed${lastInfo}`);
      } else if (payload.type === 'task') {
        console.info(`${prefix} Task selected: ${payload.taskName}`);
      }
    }

    try {
      const evt = typeof window.CustomEvent === 'function'
        ? new CustomEvent(STATUS_EVENT_NAME, { detail: payload })
        : (function () {
            const custom = document.createEvent('CustomEvent');
            custom.initCustomEvent(STATUS_EVENT_NAME, false, false, payload);
            return custom;
          })();
      window.dispatchEvent(evt);
    } catch (error) {
      // noop
    }

    window.__cgptTaskStatus = {
      taskName: statusState.lastTaskName,
      statuses: payload.statuses,
      lastEvent: payload,
      seenCompleting: statusState.seenCompleting,
    };
  }

  function extractTaskName() {
    const backBtn = document.querySelector('button[aria-label="Go back to tasks"]');
    if (backBtn) {
      const header = backBtn.closest('.border-b-token-border-default');
      const nameEl = header?.querySelector('span.truncate.font-medium');
      const name = (nameEl?.textContent || '').trim();
      if (name) return name;
    }
    const nameEl = document.querySelector(STATUS_SELECTORS.taskName);
    const text = (nameEl?.textContent || '').trim();
    return text;
  }

  function findStatusButtons() {
    const candidates = document.querySelectorAll(STATUS_SELECTORS.statusText);
    const buttons = new Set();
    candidates.forEach((span) => {
      const btn = span.closest('button');
      if (!btn) return;
      if (!btn.classList.contains('select-none')) return;
      if (!btn.classList.contains('text-sm')) return;
      if (!btn.classList.contains('text-token-text-secondary')) return;
      if (!btn.matches(STATUS_SELECTORS.statusButton)) return;
      buttons.add(btn);
    });
    return toArray(buttons);
  }

  function collectStatusTexts() {
    const texts = [];
    const buttons = findStatusButtons();
    buttons.forEach((btn) => {
      const span = btn.querySelector(STATUS_SELECTORS.statusText);
      const text = (span?.textContent || '').trim();
      if (text) texts.push(text);
    });
    return texts;
  }

  function updateStatusState() {
    const currentTaskName = extractTaskName();
    if (currentTaskName && currentTaskName !== statusState.lastTaskName) {
      statusState.lastTaskName = currentTaskName;
      statusState.activeTexts.clear();
      statusState.seenCompleting = false;
      statusState.lastStatusText = '';
      statusState.lastCompletingText = '';
      dispatchStatusEvent({ type: 'task', status: '', statuses: [], taskName: currentTaskName });
    }

    const statuses = collectStatusTexts();
    const unique = Array.from(new Set(statuses));
    const uniqueSet = new Set(unique);
    const prevSet = statusState.activeTexts;
    const hadStatuses = prevSet.size > 0;

    const newStatuses = unique.filter((text) => !prevSet.has(text));
    newStatuses.forEach((text) => {
      dispatchStatusEvent({ type: 'status', status: text, statuses: unique });
      if (/completing/i.test(text)) {
        statusState.seenCompleting = true;
        statusState.lastCompletingText = text;
      }
      statusState.lastStatusText = text;
    });

    if (!newStatuses.length && unique.length) {
      const last = unique[unique.length - 1];
      if (last !== statusState.lastStatusText) {
        statusState.lastStatusText = last;
      }
      if (/completing/i.test(last)) {
        statusState.seenCompleting = true;
        statusState.lastCompletingText = last;
      }
    }

    statusState.activeTexts = uniqueSet;

    if (!unique.length) {
      if (hadStatuses && statusState.seenCompleting) {
        dispatchStatusEvent({
          type: 'completed',
          status: 'Task completed',
          statuses: [],
          lastKnownStatus: statusState.lastCompletingText || statusState.lastStatusText || '',
        });
      }
      statusState.seenCompleting = false;
      statusState.lastCompletingText = '';
      statusState.lastStatusText = '';
    }

    window.__cgptTaskStatus = {
      taskName: statusState.lastTaskName,
      statuses: unique,
      lastStatus: statusState.lastStatusText,
      seenCompleting: statusState.seenCompleting,
    };
  }

  let statusCheckScheduled = false;
  function scheduleStatusCheck() {
    if (statusCheckScheduled) return;
    statusCheckScheduled = true;
    runMicrotask(() => {
      statusCheckScheduled = false;
      updateStatusState();
    });
  }

  function getPromptEditable() {
    return document.querySelector(SELECTORS.promptEditable);
  }

  function placeCaretToEnd(el) {
    try {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) { /* noop */ }
  }

  function safeInsertText(el, text) {
    if (!el) return;
    const needsNL = el.textContent && el.textContent.trim().length > 0 ? '\n' : '';
    const toInsert = needsNL + text;

    placeCaretToEnd(el);
    const ok = document.execCommand && document.execCommand('insertText', false, toInsert);
    if (ok) return;

    // Фолбэк: вручную вставляем текстовый узел в конец
    const node = document.createTextNode(toInsert);
    el.appendChild(node);
    placeCaretToEnd(el);
  }

  // Создаём кнопки (в т.ч. Yes 1/Yes 2 при наличии «или»)
  function ensureButtonForParagraph(pEl) {
    if (!pEl) return;

    // очищаем ранее добавленные кнопки, чтобы не дублировать
    pEl.querySelectorAll('.' + BTN_CLASS).forEach((b) => b.remove());

    const rawText = (pEl.innerText || '').trim();

    // берём вопрос только до первого "?" (чтобы не схватить хвосты "Yes ...")
    const qm = rawText.indexOf('?');
    const baseWithQ = qm >= 0 ? rawText.slice(0, qm + 1) : rawText;
    const questionClean = baseWithQ.replace(/\s+/g, ' ').trim();

    // убираем финальный "?" для разбиения по "или"
    const noQ = questionClean.replace(/\?$/, '');
    const parts = noQ.split(/\s+или\s+/i).map(s => s.trim()).filter(Boolean);

    const makeBtn = (label, value) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.className = BTN_CLASS;
      // нейтральные стили: без border/background (как просили)
      Object.assign(btn.style, {
        marginLeft: '0.5rem',
        padding: '2px 8px',
        fontSize: '12px',
        lineHeight: '18px',
        borderRadius: '6px',
        cursor: 'pointer',
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const editable = getPromptEditable();
        safeInsertText(editable, value);
      });
      pEl.appendChild(btn);
    };

    if (parts.length > 1) {
      // Несколько вариантов -> Yes 1, Yes 2, ...
      parts.forEach((opt, i) => makeBtn('Yes ' + (i + 1), opt));
    } else {
      // Один вариант -> одна кнопка Yes, вставляет весь вопрос (до "?")
      makeBtn('Yes', questionClean);
    }

    pEl.dataset.yesBtnAdded = '1';
  }

  function processAssistantMessage(msgEl) {
    if (!msgEl) return;
    const md = msgEl.querySelector(SELECTORS.markdown);
    if (!md) return;
    const paras = md.querySelectorAll('p');
    if (!paras.length) return;

    let lastQuestionP = null;
    for (let i = paras.length - 1; i >= 0; i--) {
      const t = paras[i].innerText || '';
      if (t.includes('?')) { lastQuestionP = paras[i]; break; }
    }
    if (lastQuestionP) ensureButtonForParagraph(lastQuestionP);
  }

  function scanAll() {
    document.querySelectorAll(SELECTORS.assistantMsg).forEach(processAssistantMessage);
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations && mutations.length) {
      scheduleStatusCheck();
    }
    for (const m of mutations) {
      if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches?.(SELECTORS.assistantMsg)) {
            processAssistantMessage(node);
          } else {
            node.querySelectorAll?.(SELECTORS.assistantMsg).forEach(processAssistantMessage);
          }
        });
      }
      if (m.type === 'attributes' && m.target instanceof HTMLElement) {
        if (m.target.matches(SELECTORS.assistantMsg)) {
          processAssistantMessage(m.target);
        }
      }
    }
  });

  function startObservers() {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: ['data-message-author-role', 'class'],
    });
  }

  let statusIntervalId = null;
  let visibilityListenerAdded = false;
  function startStatusWatcher() {
    updateStatusState();
    if (!statusIntervalId) {
      statusIntervalId = setInterval(updateStatusState, 1000);
    }
    if (!visibilityListenerAdded && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) scheduleStatusCheck();
      });
      visibilityListenerAdded = true;
    }
  }

  function start() {
    // Первичный проход
    scanAll();

    // Повторные попытки — на случай отложенного рендера SPA
    setTimeout(scanAll, 300);
    setTimeout(scanAll, 1000);

    let retries = 3;
    const iv = setInterval(() => {
      scanAll();
      if (--retries <= 0) clearInterval(iv);
    }, 1000);

    startObservers();
    startStatusWatcher();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Лёгкий hover и поддержка тёмной темы
  const style = document.createElement('style');
  style.textContent = `
    .${BTN_CLASS}:hover { filter: brightness(0.95); }
    html.dark .${BTN_CLASS} {
      background: #2a2a2a;
      border-color: #3a3a3a;
      color: #eaeaea;
    }
  `;
  document.head.appendChild(style);
})();
