// ==UserScript==
// @name         Bladificator
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://web.telegram.org/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=telegram.org
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

  const replaces = [
    { from: 'Коллеги', to: 'Блять' },
    { from: 'Коллег', to: 'Блять' },
    { from: 'Благодарю', to: 'Заебал' },
    { from: 'Спасибо', to: 'Заебал' },
    { from: 'Добрый вечер', to: 'Блять' },
    { from: 'Добрый день', to: 'Блять' },
    { from: 'Здравствуйте', to: 'Блять' },
  ];

  function bladificator() {
    const msgs = document.querySelectorAll('.message:not(.bladified)');
    if (msgs.length > 0) {
     msgs.forEach(msg => {
       fixMsgTelegram(msg);
     });
    }
    //console.log(msgs.length);
  }

    function fixMsgTelegram(msg) {
      const text = msg.innerHTML;
      let fixed = text;
      for (const el of replaces) {
        const reg = new RegExp(el.from, 'g');
        fixed = fixed.replace(reg, el.to);

        const regLow = new RegExp(el.from.toLowerCase(), 'g');
        fixed = fixed.replace(regLow, el.to.toLowerCase());
      }

      if (fixed !== text) {
        //fixed = fixed.replace(/<reactions-element>.*?<\/reactions-element>/, '');

        msg.innerHTML = fixed;
        //const reactions = msg.querySelector('.reactions').remove();
        //console.log('reactions:', reactions.length);
      }
      msg.classList.add('bladified');
    }

  setInterval(bladificator, 1000);

  GM_addStyle(`
.bladified .reactions + .reactions { display: none; }

`);
})();