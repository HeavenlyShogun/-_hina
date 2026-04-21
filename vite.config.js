import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_REPO_NAME = '-_hina';

function resolveRepoName() {
  const explicitRepo = process.env.VITE_GITHUB_PAGES_REPO?.trim().replace(/^\/+|\/+$/g, '');
  if (explicitRepo) {
    return explicitRepo;
  }

  const githubRepo = process.env.GITHUB_REPOSITORY?.split('/')[1]?.trim();
  if (githubRepo) {
    return githubRepo;
  }

  return DEFAULT_REPO_NAME;
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${resolveRepoName()}/` : '/',
  plugins: [react()],
}));
