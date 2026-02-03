/**
 * Environment configuration for Electron app
 * Uses absolute URLs since Electron may load from file:// or remote URL
 */
export const environment = {
  production: true,
  apiUrl: 'http://digitalclub.contactototal.com.pe',  // Backend absoluto para Electron
  wsUrl: 'ws://digitalclub.contactototal.com.pe/ws',
  appName: 'Holape',
  version: '1.0.0'
};
