const _env = (typeof window !== 'undefined' && (window as any).__env) || {};

export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080',
  wsUrl: 'ws://localhost:8080/websocket',
  logoPath: null as string | null,
  appName: (_env.appName as string) || 'App',
  title: (_env.title as string) || 'App',
  version: '1.0.18',
  simplifiedRoles: false,
  smsOtpEnabled: (_env.smsOtpEnabled !== false)
};
