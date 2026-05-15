import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

try {
  process.chdir(projectRoot);
  process.env.DEPLOY_TARGET = 'firebase';
  process.env.VITE_PUBLIC_BASE = '/';
  await import('./run-vite-build.mjs');
} catch (error) {
  process.exit(error.status ?? 1);
}
