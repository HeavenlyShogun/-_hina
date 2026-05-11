import { build } from 'vite';
import viteConfig from '../vite.config.js';

function resolveConfig(mode = 'production') {
  const config = typeof viteConfig === 'function'
    ? viteConfig({ command: 'build', mode })
    : viteConfig;

  return {
    configFile: false,
    ...config,
    mode,
  };
}

try {
  const mode = process.env.NODE_ENV?.trim() || 'production';
  const config = resolveConfig(mode);
  await build(config);
} catch (error) {
  console.error(error);
  process.exit(1);
}
