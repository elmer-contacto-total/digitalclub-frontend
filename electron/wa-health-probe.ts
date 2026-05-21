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
