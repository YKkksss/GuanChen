import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 单独以 ESM 运行组件测试，兼容渲染依赖，不改变项目其他脚本的模块制式。
const root = new URL('../', import.meta.url);
const output = fileURLToPath(new URL('.next-markdown-test-qa/render.mjs', root));
await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['scripts/test-ai-markdown.tsx'],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  jsx: 'automatic',
});
await import(pathToFileURL(output).href);
