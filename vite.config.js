import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_FILE = fileURLToPath(import.meta.url);
const ROOT_DIR = dirname(CONFIG_FILE);
const DEFAULT_REPO = '-_hina';

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

function resolveRepositoryName(env) {
  const explicitRepo = env.VITE_GITHUB_PAGES_REPO?.trim();
  if (explicitRepo) {
    return explicitRepo;
  }

  const githubRepository = env.GITHUB_REPOSITORY?.trim();
  if (githubRepository?.includes('/')) {
    return githubRepository.split('/').pop();
  }

  return DEFAULT_REPO;
}

function getPagesBasePath({ repo, customDomain, explicitBase }) {
  if (explicitBase) {
    return explicitBase;
  }
  return customDomain ? '/' : `/${repo}/`;
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ROOT_DIR, '');
  const customDomain = resolveCustomDomain(env);
  const repo = resolveRepositoryName(env);
  const port = resolvePort(env.VITE_DEV_PORT, 5173);
  const usePolling = env.VITE_USE_POLLING === 'true';
  const explicitBase = normalizeBasePath(env.VITE_PUBLIC_BASE);
  const buildBase = getPagesBasePath({ repo, customDomain, explicitBase });

  return {
    root: ROOT_DIR,
    base: command === 'build' ? buildBase : '/',
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(ROOT_DIR, 'src'),
      },
    },
    server: {
      host: env.VITE_DEV_HOST?.trim() || '0.0.0.0',
      port,
      strictPort: true,
      fs: {
        allow: [ROOT_DIR],
      },
      watch: usePolling ? { usePolling: true, interval: 300 } : undefined,
      hmr: {
        clientPort: port,
      },
    },
    preview: {
      host: env.VITE_DEV_HOST?.trim() || '0.0.0.0',
      port,
      strictPort: true,
    },
    build: {
      outDir: resolve(ROOT_DIR, 'dist'),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'firebase-vendor': ['firebase'],
            'tone-vendor': ['@tonejs/midi'],
          },
        },
      },
    },
  };
});
