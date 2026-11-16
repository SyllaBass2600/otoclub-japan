import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * 接続先の設定は Flutter 版と同じ ../env/<mode>.json を使う
 * （`vite --mode dev` なら env/dev.json、`vite build --mode prod` なら env/prod.json）。
 * ここの値はビルド結果に埋め込まれ、誰でも見られる。秘密情報は入れないこと。
 */
const rootDir = fileURLToPath(new URL('.', import.meta.url));

function loadAppEnv(mode: string): Record<string, unknown> {
  const file = resolve(rootDir, '..', 'env', `${mode}.json`);
  if (!existsSync(file)) {
    console.warn(`[vite] ${file} がありません。env/example.json をコピーして作ってください`);
    return {};
  }
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __APP_ENV__: JSON.stringify(loadAppEnv(mode)),
  },
  server: { port: 5173 },
  build: { outDir: 'dist', sourcemap: false },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
}));
