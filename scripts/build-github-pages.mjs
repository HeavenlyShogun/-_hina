import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCustomDomain, getGitHubRepo, getPagesBasePath } from './github-pages-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const viteCliPath = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const { owner, repo } = getGitHubRepo();
const customDomain = getCustomDomain();
const basePath = getPagesBasePath({ repo, customDomain });

function syncStaticHostingFiles() {
  const redirect404Path = path.join(distRoot, '404.html');

  if (existsSync(redirect404Path)) {
    const redirectHtml = readFileSync(redirect404Path, 'utf8').replace(/__GH_PAGES_BASE_PATH__/g, basePath);
    writeFileSync(redirect404Path, redirectHtml);
  }

  if (customDomain) {
    writeFileSync(path.join(distRoot, 'CNAME'), `${customDomain}\n`);
  }
}

try {
  execFileSync(
    process.execPath,
    [viteCliPath, 'build'],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_GITHUB_PAGES_REPO: repo,
        GITHUB_REPOSITORY: `${owner}/${repo}`,
        VITE_CUSTOM_DOMAIN: customDomain,
      },
    }
  );

  syncStaticHostingFiles();
} catch (error) {
  process.exit(error.status ?? 1);
}
