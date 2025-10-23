// ==UserScript==
// @name         ChatGPT Question Buttons
// @namespace    https://greasyfork.org/en/users/you
// @version      1.2.0
// @description  Finds the last paragraph with a question in assistant messages and adds Yes buttons (Yes N when there is "or"); processes existing and new messages
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// @updateURL https://raw.githubusercontent.com/popstas/userscripts/refs/heads/master/src/userscripts/chatgpt-question-buttons.userscript.js
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
      attributeFilter: ['data-message-author-role', 'class'],
    });
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
