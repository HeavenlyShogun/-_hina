import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { getPagesBasePath, getGitHubRepo } from './scripts/github-pages-utils.mjs';

function resolveCustomDomain(env) {
  return env.VITE_CUSTOM_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || '';
}

function resolvePort(value, fallback) {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 ? port : fallback;
}

function normalizeBasePath(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed === '/') {
    return '/';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const customDomain = resolveCustomDomain(env);
  const repo = env.VITE_GITHUB_PAGES_REPO?.trim() || getGitHubRepo().repo;
  const port = resolvePort(env.VITE_DEV_PORT, 5173);
  const usePolling = env.VITE_USE_POLLING === 'true';
  const explicitBase = normalizeBasePath(env.VITE_PUBLIC_BASE);
  const buildBase = explicitBase || getPagesBasePath({ repo, customDomain });

  return {
    base: command === 'build' ? buildBase : '/',
    plugins: [react()],
    server: {
      host: env.VITE_DEV_HOST?.trim() || '0.0.0.0',
      port,
      strictPort: true,
      watch: usePolling ? { usePolling: true, interval: 300 } : undefined,
      hmr: {
        clientPort: 5173,
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'firebase-vendor': ['firebase'],
            'tone-vendor': ['@tonejs/midi'],
          }
        }
      }
    }
  };
});
