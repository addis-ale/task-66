export const getInitialLoginForm = () => {
  const allowPrefill =
    import.meta?.env?.MODE !== 'production' &&
    String(import.meta?.env?.VITE_ENABLE_DEV_LOGIN_PREFILL || '').toLowerCase() === 'true';

  if (!allowPrefill) {
    return { username: '', password: '' };
  }

  return {
    username: import.meta?.env?.VITE_DEV_LOGIN_USERNAME || 'admin.dev',
    password: import.meta?.env?.VITE_DEV_LOGIN_PASSWORD || 'AdminSecure!2026'
  };
};
