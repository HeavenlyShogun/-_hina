import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const viteCliPath = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');

try {
  execFileSync(
    process.execPath,
    [viteCliPath, 'build'],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_PUBLIC_BASE: '/',
      },
    },
  );
} catch (error) {
  process.exit(error.status ?? 1);
}
