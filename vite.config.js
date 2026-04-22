import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_REPO_NAME = '-_hina';

function resolveRepoName(env) {
  const explicitRepo = env.VITE_GITHUB_PAGES_REPO?.trim().replace(/^\/+|\/+$/g, '');
  if (explicitRepo) {
    return explicitRepo;
  }

  const githubRepo = env.GITHUB_REPOSITORY?.split('/')[1]?.trim();
  if (githubRepo) {
    return githubRepo;
  }

  return DEFAULT_REPO_NAME;
}

function resolveCustomDomain(env) {
  return env.VITE_CUSTOM_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || '';
}

function resolvePort(value, fallback) {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 ? port : fallback;
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const customDomain = resolveCustomDomain(env);
  const repoName = resolveRepoName(env);
  const port = resolvePort(env.VITE_DEV_PORT, 5173);
  const usePolling = env.VITE_USE_POLLING === 'true';

  return {
    base: command === 'build' ? (customDomain ? '/' : `/${repoName}/`) : '/',
    plugins: [react()],
    server: {
      host: env.VITE_DEV_HOST?.trim() || '0.0.0.0',
      port,
      strictPort: true,
      watch: usePolling ? { usePolling: true, interval: 300 } : undefined,
      hmr: env.VITE_HMR_HOST
        ? {
            host: env.VITE_HMR_HOST,
            clientPort: resolvePort(env.VITE_HMR_CLIENT_PORT, port),
          }
        : undefined,
    },
  };
});
