const _env = (typeof window !== 'undefined' && (window as any).__env) || {};

export const environment = {
  production: true,
  apiUrl: _env.apiUrl ?? '',
  wsUrl: _env.wsUrl ?? '',
  logoPath: (_env.logoPath as string) || null,
  appName: 'Holape',
  version: '1.0.0'
};
