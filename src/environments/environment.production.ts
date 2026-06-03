const _env = (typeof window !== 'undefined' && (window as any).__env) || {};

export const environment = {
  production: true,
  apiUrl: _env.apiUrl ?? '',
  wsUrl: _env.wsUrl ?? '',
  logoPath: (_env.logoPath as string) || null,
  appName: (_env.appName as string) || 'App',
  title: (_env.title as string) || 'App',
  version: '1.0.6',
  simplifiedRoles: Boolean(_env.simplifiedRoles ?? false),
  smsOtpEnabled: (_env.smsOtpEnabled !== false)
};
