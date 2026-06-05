import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_FILE = fileURLToPath(import.meta.url);
const ROOT_DIR = dirname(CONFIG_FILE);
const PACKAGE_VERSION = JSON.parse(readFileSync(resolve(ROOT_DIR, 'package.json'), 'utf8')).version ?? '0.0.0';
const DEFAULT_REPO = '-_hina';
const DEPLOY_TARGETS = {
  FIREBASE: 'firebase',
  GITHUB_PAGES: 'github-pages',
};

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

function resolveDeployTarget(env) {
  return (process.env.DEPLOY_TARGET || env.DEPLOY_TARGET || '').trim().toLowerCase();
}

function resolveBuildBasePath({ deployTarget, repo, customDomain, explicitBase }) {
  if (deployTarget === DEPLOY_TARGETS.FIREBASE) {
    return '/';
  }

  if (deployTarget === DEPLOY_TARGETS.GITHUB_PAGES) {
    return getPagesBasePath({ repo, customDomain, explicitBase });
  }

  return getPagesBasePath({ repo, customDomain, explicitBase });
}

function resolveBuildOutDir(deployTarget) {
  if (deployTarget === DEPLOY_TARGETS.FIREBASE) {
    return resolve(ROOT_DIR, 'dist-fb');
  }

  if (deployTarget === DEPLOY_TARGETS.GITHUB_PAGES) {
    return resolve(ROOT_DIR, 'dist-gh');
  }

  return resolve(ROOT_DIR, 'dist');
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ROOT_DIR, '');
  const deployTarget = resolveDeployTarget(env);
  const customDomain = resolveCustomDomain(env);
  const repo = resolveRepositoryName(env);
  const port = resolvePort(env.VITE_DEV_PORT, 5173);
  const usePolling = env.VITE_USE_POLLING === 'true';
  const explicitBase = normalizeBasePath(env.VITE_PUBLIC_BASE);
  const buildBase = resolveBuildBasePath({
    deployTarget,
    repo,
    customDomain,
    explicitBase,
  });
  const buildOutDir = resolveBuildOutDir(deployTarget);

  return {
    root: ROOT_DIR,
    base: command === 'build' ? buildBase : '/',
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(PACKAGE_VERSION),
    },
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
      outDir: buildOutDir,
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
