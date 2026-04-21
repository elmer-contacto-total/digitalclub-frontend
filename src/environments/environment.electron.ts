// window.__env is injected by electron/preload.ts from app-config.ts at runtime
const _env = (typeof window !== 'undefined' && (window as any).__env) || {};

export const environment = {
  production: true,
  apiUrl: _env.apiUrl ?? '',
  wsUrl: _env.wsUrl ?? '',
  appName: 'Holape',
  version: '1.0.0'
};
