// ==UserScript==
// @name         codex-helper
// @namespace    https://chatgpt.com/codex
// @version      1.6.0
// @description  Следит за появлением/исчезновением .loading-shimmer-pure-text ИЛИ svg>circle в .task-row-container. Пишет статусы на холсте и (опционально) озвучивает. Игнорирует задачи без имени ("Unnamed task"). Не объявляет "Task complete", если ранее было "Completing the task". Считает "Completing" также по прогрессу в .text-token-text-tertiary вида N/N (2/2, 3/3 и т.п.).
// @match        https://chatgpt.com/codex*
// @run-at       document-idle
// @grant        none
// @noframes
// @updateURL https://raw.githubusercontent.com/popstas/userscripts/refs/heads/master/src/userscripts/codex-helper.userscript.js
// ==/UserScript==

(function () {
  'use strict';

  /** ==========================
   *  Настройки
   *  ========================== */
  const CONFIG = {
    ENABLE_TTS: true, // Вкл/выкл голос
    LANG: 'en-US', // Язык TTS
    HUD_MS: 3200, // Время показа сообщения на холсте (мс)
    HUD_WIDTH: 440, // CSS-ширина холста (px)
    HUD_HEIGHT: 110, // CSS-высота холста (px)
    DEBUG: true,
  };

  const log = (...a) => CONFIG.DEBUG && console.log('[codex-helper]', ...a);

  /** ==========================
   *  HUD (холст) поверх страницы
   *  ========================== */
  const HUD = (() => {
    const canvas = document.createElement('canvas');
    canvas.id = 'codex-helper-hud';
    Object.assign(canvas.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      width: CONFIG.HUD_WIDTH + 'px',
      height: CONFIG.HUD_HEIGHT + 'px',
      pointerEvents: 'none',
      zIndex: 2147483647,
      opacity: '0',
      transition: 'opacity 160ms ease-out',
    });

    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    canvas.width = CONFIG.HUD_WIDTH * dpr;
    canvas.height = CONFIG.HUD_HEIGHT * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    function roundRect(x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    function draw(msg, type = 'info') {
      // Очистка
      ctx.clearRect(0, 0, CONFIG.HUD_WIDTH, CONFIG.HUD_HEIGHT);

      // Палитра
      const bg = type === 'ok' ? 'rgba(32, 120, 64, 0.85)'
                : type === 'warn' ? 'rgba(160, 96, 16, 0.88)'
                : 'rgba(20, 20, 20, 0.88)';

      // Подложка
      const pad = 12;
      roundRect(0, 0, CONFIG.HUD_WIDTH, CONFIG.HUD_HEIGHT, 16);
      ctx.fillStyle = bg;
      ctx.fill();

      // Текст
      ctx.fillStyle = '#fff';
      ctx.font = '600 18px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textBaseline = 'top';

      // Разбивка по строкам
      const maxWidth = CONFIG.HUD_WIDTH - pad * 2;
      const lines = [];
      let rest = String(msg);
      while (rest.length) {
        let lo = 0, hi = rest.length, best = 0;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const test = rest.slice(0, mid);
          if (ctx.measureText(test).width <= maxWidth) {
            best = mid; lo = mid + 1;
          } else hi = mid - 1;
        }
        if (!best) break;
        let cut = rest.slice(0, best);
        const lastSpace = cut.lastIndexOf(' ');
        if (lastSpace > 0 && best < rest.length) cut = cut.slice(0, lastSpace);
        lines.push(cut);
        rest = rest.slice(cut.length).trimStart();
      }
      if (!lines.length) lines.push(rest);

      let y = pad;
      for (const line of lines) {
        ctx.fillText(line, pad, y);
        y += 24;
      }
    }

    let hideTimer = null;
    function show(msg, type = 'info') {
      if (!canvas.isConnected) document.documentElement.appendChild(canvas);
      draw(msg, type);
      canvas.style.opacity = '1';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { canvas.style.opacity = '0'; }, CONFIG.HUD_MS);
    }

    return { show };
  })();

  /** ==========================
   *  Речь (опционально)
   *  ========================== */
  function speak(text) {
    if (!CONFIG.ENABLE_TTS) return;
    if (!('speechSynthesis' in window)) {
      log('speechSynthesis недоступен');
      return;
    }
    window.speechSynthesis.cancel();
    text = text.replace(/_/g, ' ');
    const u = new SpeechSynthesisUtterance(text);
    u.lang = CONFIG.LANG || 'en-US';
    window.speechSynthesis.speak(u);
  }

  /** ==========================
   *  Логика слежения
   *  ========================== */
  // container -> { active, completed, announcedCompleting, lastName }
  const state = new WeakMap();
  const tracked = new Set();

  const qContainers = () => Array.from(document.querySelectorAll('.task-row-container'));

  function getTaskName(container) {
    const nameEl = container.querySelector('.text-token-text-primary');
    const raw = (nameEl?.textContent || '').trim();
    // Игнорируем пустое имя и 'Unnamed task'
    if (!raw || /^unnamed task$/i.test(raw)) return '';
    return raw;
  }

  function hasShimmer(container) {
    // Наличие любого элемента с классом .loading-shimmer-pure-text внутри контейнера
    return !!container.querySelector('.loading-shimmer-pure-text');
  }

  function hasSpinner(container) {
    // Наличие индикатора в виде svg>circle (или вложенных кругов внутри svg)
    return !!(container.querySelector('svg > circle') || container.querySelector('svg circle'));
  }

  function hasCompletingText(container) {
    // Узкое условие для статуса «Completing the task» (если используется текст)
    const nodes = container.querySelectorAll('.loading-shimmer-pure-text');
    for (const el of nodes) {
      const t = (el.textContent || '').toLowerCase();
      if (t.includes('completing') && t.includes('task')) return true;
    }
    return false;
  }

  function hasFinalFraction(container) {
    // «Completing» также считаем, если есть прогресс вида N/N (где N>=2) в .text-token-text-terтиary
    // Пример: 2/2, 3/3, 10/10
    const nodes = container.querySelectorAll('.text-token-text-tertiary');
    for (const el of nodes) {
      const t = String(el.textContent || '');
      const parts = t.split('/');
      if (parts.length >= 2) {
        const a = parseInt(parts[0], 10);
        const b = parseInt(parts[1], 10);
        if (Number.isFinite(a) && Number.isFinite(b) && b >= 2 && a === b) return true;
      }
    }
    return false;
  }

  function ensureObserved(container) {
    if (state.has(container)) return;

    state.set(container, {
      active: false,
      completed: false,
      announcedCompleting: false,
      lastName: null,
    });
    tracked.add(container);

    const update = () => {
      const st = state.get(container);
      if (!st) return;

      const name = getTaskName(container);
      const shimmer = hasShimmer(container);
      const spinner = hasSpinner(container);
      const activeNow = shimmer || spinner;
      const completingNow = hasCompletingText(container) || hasFinalFraction(container);

      // Смена имени — считаем новый цикл
      if (st.lastName !== name) {
        st.active = false;
        st.completed = false;
        st.announcedCompleting = false;
        st.lastName = name;
      }

      if (activeNow) {
        // Активное состояние
        if (!st.active) {
          st.active = true;
          st.completed = false;
          st.announcedCompleting = false; // новый старт — позволяем объявить ещё раз
          log('Task active:', name);
        }
        // Сообщение «Completing…» только один раз за цикл
        if (completingNow && !st.announcedCompleting) {
          if (name) { const msg = `Completing the task: ${name}`; HUD.show(msg, 'warn'); speak(msg); } st.announcedCompleting = true;
        }
      } else {
        // Ни shimmer, ни svg>circle — считаем завершением
        if (st.active && !st.completed) {
          if (!st.announcedCompleting && name) { const msg = `Task complete: ${name}`; HUD.show(msg, 'ok'); speak(msg); } st.completed = true;
          st.active = false;
          st.announcedCompleting = false;
          log('Task completed:', name);
        }
      }
    };

    // Важно: слушаем и текст/атрибуты — React может менять классы/контент без добавления узлов
    const mo = new MutationObserver(update);
    mo.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-hidden', 'aria-live']
    });

    update();
  }

  // Наблюдаем документ: подключаем новые контейнеры, обрабатываем удаление
  const rootObserver = new MutationObserver(() => {
    qContainers().forEach(ensureObserved);

    for (const el of Array.from(tracked)) {
      const st = state.get(el);
      if (!st) { tracked.delete(el); continue; }
      if (!el.isConnected) {
        // Контейнер удалён: если был активен, считаем завершением
        if (st.active && !st.completed) {
          if (!st.announcedCompleting && st.lastName) { const msg = `Task complete: ${st.lastName}`; HUD.show(msg, 'ok'); speak(msg); }
        }
        tracked.delete(el);
        state.delete(el);
      }
    }
  });
  rootObserver.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Первичное сканирование (SPA может отрисовать позже)
  let tries = 0;
  const scanTimer = setInterval(() => {
    qContainers().forEach(ensureObserved);
    if (++tries > 20) clearInterval(scanTimer);
  }, 1000);
})();
