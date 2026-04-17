// Build client bundle with a build-time version stamp (git short SHA + date).
// Replaces the hardcoded version string in the main menu.
import { execSync } from 'node:child_process';
import { build } from 'esbuild';

let sha = 'dev';
try {
  sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().trim();
} catch {
  // no git available — fall back to 'dev'
}
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const date = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
const version = `v${date}-${sha}`;

await build({
  entryPoints: ['client/main.ts'],
  bundle: true,
  outfile: 'dist/client/bundle.js',
  format: 'esm',
  platform: 'browser',
  tsconfig: 'tsconfig.client.json',
  define: {
    __VERSION__: JSON.stringify(version),
  },
});
// eslint-disable-next-line no-console
console.log(`Built ${version}`);
