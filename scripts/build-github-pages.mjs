import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getGitHubRepo } from './github-pages-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const viteCliPath = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const { owner, repo } = getGitHubRepo();

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
      },
    }
  );
} catch (error) {
  process.exit(error.status ?? 1);
}
