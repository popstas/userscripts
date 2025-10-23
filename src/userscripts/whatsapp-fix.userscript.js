// ==UserScript==
// @name         Whatsapp fix
// @namespace    http://tampermonkey.net/
// @version      0.1.1
// @description  Hide "New messages" block in chat
// @author       popstas
// @match        https://web.whatsapp.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @updateURL https://raw.githubusercontent.com/popstas/userscripts/refs/heads/master/src/userscripts/whatsapp-fix.userscript.js
// @downloadURL https://raw.githubusercontent.com/popstas/userscripts/refs/heads/master/src/userscripts/whatsapp-fix.userscript.js
// ==/UserScript==

(function() {
    'use strict';
    var u = 'undefined';
    var win = typeof unsafeWindow != u ? unsafeWindow : window;
    var $ = win.$;

    const userStyles = GM_getResourceText("userStyles");
    GM_addStyle(userStyles);

    GM_addStyle(`
#main {}

/* Hide "New messages" block in chat */
html[dir] ._5ML0C {
  display: none;
}
`);
})();