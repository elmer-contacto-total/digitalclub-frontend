import { app } from 'electron';
import { WA_SELECTORS as S } from './wa-selectors';

// Embeds selector values into the IIFE string at build time.
// WA's JS context sees hardcoded strings, not TypeScript imports.
export function getHealthProbeScript(): string {
  const appVersion = app.getVersion();
  return `
(function() {
  'use strict';
  var APP_VERSION = ${JSON.stringify(appVersion)};
  var INTERVAL_MS = 5 * 60 * 1000;

  function runHealthProbe() {
    try {
      var report = {
        timestamp: Date.now(),
        appVersion: APP_VERSION,
        waLoaded: false,
        features: {}
      };

      var sessionPane = document.querySelector(${JSON.stringify(S.SESSION_PANE)});
      if (!sessionPane) {
        console.log('[HABLAPE_HEALTH]' + JSON.stringify(report));
        return report;
      }
      report.waLoaded = true;

      function probe(key, primary, fallback, root) {
        var r = root || document;
        if (r.querySelector(primary)) {
          report.features[key] = { ok: true };
          return;
        }
        if (fallback) {
          if (r.querySelector(fallback)) {
            report.features[key] = { ok: true, usedFallback: true };
            return;
          }
        }
        report.features[key] = { ok: false, note: 'selector_missing' };
      }

      var main = document.querySelector(${JSON.stringify(S.SESSION_MAIN)});
      report.features['session_main'] = { ok: !!main };

      var hasQR = !!document.querySelector(${JSON.stringify(S.QR_CODE)}) ||
                  !!document.querySelector(${JSON.stringify(S.QR_CANVAS)});
      report.features['login_state'] = { ok: !hasQR };

      probe('chat_header', ${JSON.stringify(S.CHAT_HEADER)}, ${JSON.stringify(S.CHAT_HEADER_ALT)});
      probe('chat_title',  ${JSON.stringify(S.CHAT_TITLE)},  ${JSON.stringify(S.CHAT_TITLE_ALT)});

      if (main && document.querySelector(${JSON.stringify(S.CHAT_HEADER)})) {
        probe('compose_box', ${JSON.stringify(S.COMPOSE_BOX)}, ${JSON.stringify(S.COMPOSE_ALT2)});
      } else {
        report.features['compose_box'] = { ok: true, note: 'no_chat_open' };
      }

      probe('search_input', ${JSON.stringify(S.SEARCH_INPUT)}, ${JSON.stringify(S.SEARCH_ALT1)});

      var panel = document.querySelector(${JSON.stringify(S.MSG_PANEL)});
      report.features['msg_panel'] = { ok: !!panel };
      if (panel) {
        var items = panel.querySelectorAll(${JSON.stringify(S.MSG_ITEMS)});
        if (items.length > 0) {
          report.features['msg_items'] = { ok: true };
          var first = items[0];
          report.features['msg_direction'] = {
            ok: !!first.querySelector(${JSON.stringify(S.MSG_TAIL_OUT)}) ||
                !!first.querySelector(${JSON.stringify(S.MSG_TAIL_IN)})
          };
          probe('msg_text', ${JSON.stringify(S.MSG_TEXT)}, ${JSON.stringify(S.MSG_TEXT_ALT)}, panel);
        } else {
          report.features['msg_items']     = { ok: true, note: 'no_messages_visible' };
          report.features['msg_direction'] = { ok: true, note: 'no_messages_visible' };
          report.features['msg_text']      = { ok: true, note: 'no_messages_visible' };
        }
        report.features['msg_audio'] = {
          ok: true,
          note: panel.querySelector('audio') ? undefined : 'no_audio_visible'
        };
        report.features['msg_image'] = {
          ok: true,
          note: panel.querySelector('img[src*="blob:"]') ? undefined : 'no_image_visible'
        };
      } else {
        ['msg_items', 'msg_direction', 'msg_text', 'msg_audio', 'msg_image'].forEach(function(k) {
          report.features[k] = { ok: false, note: 'no_msg_panel' };
        });
      }

      var drawer = document.querySelector(${JSON.stringify(S.CONTACT_DRAWER)}) ||
                   document.querySelector(${JSON.stringify(S.CONTACT_ALT1)}) ||
                   document.querySelector(${JSON.stringify(S.CONTACT_ALT2)});
      report.features['contact_drawer'] = drawer
        ? { ok: true }
        : { ok: true, note: 'requires_interaction' };

      // === Inyecciones de seguridad ===
      report.features['inject_security']    = { ok: window.__hablapeSecurityInjected === true, category: 'inject' };
      report.features['inject_media_queue'] = { ok: Array.isArray(window.__hablapeMediaQueue), category: 'inject' };
      report.features['inject_chat_blocker']= { ok: typeof window.__hablapeShowChatBlocker === 'function', category: 'inject' };
      report.features['inject_audit_queue'] = { ok: Array.isArray(window.__hablapeAuditQueue), category: 'inject' };

      // === Formato de mensajes ===
      if (panel && items.length > 0) {
        var firstItem = items[0];
        var timestampEl = firstItem.querySelector(${JSON.stringify(S.MSG_TIMESTAMP)});
        var timestampValid = timestampEl
          ? /\\[\\d{1,2}:\\d{2}/.test(timestampEl.getAttribute('data-pre-plain-text') || '')
          : false;
        report.features['msg_timestamp'] = {
          ok: !!timestampEl && timestampValid,
          note: !timestampEl ? 'attr_missing' : !timestampValid ? 'format_changed' : undefined,
          category: 'messages'
        };
        var hasIdOut = !!panel.querySelector(${JSON.stringify(S.MSG_ID_OUT)});
        var hasIdIn  = !!panel.querySelector(${JSON.stringify(S.MSG_ID_IN)});
        report.features['msg_id_format'] = {
          ok: hasIdOut || hasIdIn,
          note: (!hasIdOut && !hasIdIn) ? 'format_changed' : undefined,
          category: 'messages'
        };
      } else {
        report.features['msg_timestamp'] = { ok: true, note: 'no_messages_visible', category: 'messages' };
        report.features['msg_id_format']  = { ok: true, note: 'no_messages_visible', category: 'messages' };
      }

      // === Bloqueo de descargas (CSS) ===
      var attachBtn = document.querySelector('[data-testid="clip"]') ||
                      document.querySelector('[data-testid="plus-rounded"]');
      if (attachBtn) {
        var btnStyle = window.getComputedStyle(attachBtn);
        report.features['download_block_css'] = {
          ok: btnStyle.display === 'none' || btnStyle.visibility === 'hidden',
          note: (btnStyle.display !== 'none' && btnStyle.visibility !== 'hidden') ? 'css_not_applied' : undefined,
          category: 'security'
        };
      } else {
        report.features['download_block_css'] = { ok: true, note: 'btn_not_in_dom', category: 'security' };
      }

      // === Contexto de chat activo (IPC health) ===
      report.features['chat_context_phone'] = {
        ok: true,
        note: (window.__hablapeCurrentChatPhone && window.__hablapeCurrentChatPhone.length > 0)
          ? undefined : 'no_active_chat',
        category: 'context'
      };

      // === Lista de chats (navegación / bulk send) ===
      var chatRows = document.querySelectorAll('[data-testid="cell-frame-container"]');
      report.features['chat_list_items'] = {
        ok: chatRows.length > 0,
        note: chatRows.length === 0 ? 'no_chats_in_list' : undefined,
        category: 'navigation'
      };

      console.log('[HABLAPE_HEALTH]' + JSON.stringify(report));
      return report;
    } catch (e) {
      var err = {
        timestamp: Date.now(),
        appVersion: APP_VERSION,
        waLoaded: false,
        features: {},
        error: 'probe_exception: ' + (e && e.message ? e.message : String(e))
      };
      console.log('[HABLAPE_HEALTH]' + JSON.stringify(err));
      return err;
    }
  }

  window.__hablapeRunHealthProbe = runHealthProbe;

  runHealthProbe();

  setInterval(function() {
    if (document.querySelector(${JSON.stringify(S.SESSION_PANE)})) {
      runHealthProbe();
    }
  }, INTERVAL_MS);

  window.addEventListener('popstate', runHealthProbe);
  window.addEventListener('hashchange', runHealthProbe);
})();
  `.trim();
}
