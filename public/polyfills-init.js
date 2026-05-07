// Runtime config: el title se setea desde window.__env (cargado por env.js antes que este script)
if (window.__env && window.__env.title) document.title = window.__env.title;

// Polyfill for Node.js globals required by SockJS/STOMP
var global = global || window;
var process = process || { env: { DEBUG: undefined } };
var Buffer = Buffer || { isBuffer: function() { return false; } };
