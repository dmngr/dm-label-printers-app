/** Build and serve the isolated real-component preview, with synthetic assets only.
 * Usage: node tools/serve-print-image-preview.mjs <output-dir> <fixture-dir>
 */
import { build } from 'esbuild';
import { readConfiguration, performCompilation, formatDiagnostics } from '@angular/compiler-cli';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
const output = resolve(process.argv[2]), fixtures = resolve(process.argv[3]);
await mkdir(output, { recursive: true });
// Signal inputs need the same Angular compiler transform as the production build.
// Plain esbuild/JIT would omit their input metadata and invalidate this UI check.
const configPath = join(output, 'tsconfig.json');
await writeFile(configPath, JSON.stringify({ extends: resolve('tsconfig.json'),
  compilerOptions: { rootDir: resolve('.'), outDir: join(output, 'compiled'), types: [] },
  files: [resolve('tools/print-image-preview.ts')] }));
const configuration = readConfiguration(configPath);
const compilation = performCompilation({ rootNames: configuration.rootNames, options: configuration.options });
const errors = [...configuration.errors, ...compilation.diagnostics].filter(item => item.category === 1);
if (errors.length) throw new Error(formatDiagnostics(errors));
await build({ entryPoints: [join(output, 'compiled/tools/print-image-preview.js')], outfile: join(output, 'preview.js'), bundle: true, format: 'esm',
  nodePaths: [resolve('node_modules')], platform: 'browser', target: 'es2022' });
await writeFile(join(output, 'index.html'), '<!doctype html><html lang="el"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Label Ninja · PNG history isolated preview</title><body style="margin:0;background:#f8fafc"><app-root></app-root><script type="module" src="/preview.js"></script></body></html>');
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    let file, type;
    if (path === '/' || path === '/index.html') { file = join(output, 'index.html'); type = 'text/html; charset=utf-8'; }
    else if (path === '/preview.js') { file = join(output, 'preview.js'); type = 'text/javascript'; }
    else if (/^\/fixtures\/generic-(product|bag)-\d+x\d+-r1-(203|300)\.(json|png)$/.test(path)) {
      file = join(fixtures, basename(path)); type = path.endsWith('.png') ? 'image/png' : 'application/json';
    } else { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); response.end(await readFile(file));
  } catch { response.writeHead(500); response.end('Local fixture unavailable'); }
});
server.listen(0, '127.0.0.1', async () => {
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  await writeFile(join(output, 'server.json'), JSON.stringify({ pid: process.pid, url }));
  console.log(url);
});
