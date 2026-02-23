/**
 * Environment configuration for Electron app
 * Uses absolute URLs since Electron may load from file:// or remote URL
 */
export const environment = {
  production: true,
  apiUrl: 'https://cobranza.innovag.com.pe',  // Backend absoluto para Electron
  wsUrl: 'wss://cobranza.innovag.com.pe/websocket',
  appName: 'Holape',
  version: '1.0.0'
};
