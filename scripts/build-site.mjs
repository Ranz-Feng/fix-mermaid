/** Build the demo and all runtime dependencies for GitHub Pages. */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const template = await readFile(resolve(root, 'examples/demo.html'), 'utf8');
const script = template.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!script) throw new Error('Missing demo module script');
const entry = script[1]
  .replace('const { Transformer, Markmap } = window.markmap;',
    "import { Transformer } from 'markmap-lib';\nimport { Markmap } from 'markmap-view';")
  .replace(/\nawait preview\(\);\s*$/, '\npreview();');
const result = await build({
  absWorkingDir: root,
  stdin: { contents: entry, resolveDir: resolve(root, 'examples'), sourcefile: 'site-entry.js' },
  bundle: true, splitting: false, write: false, minify: true, platform: 'browser',
  format: 'iife', target: ['es2020'], legalComments: 'inline', metafile: true,
  logLevel: 'warning',
});
const javascript = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
let html = template
  .replace(/<!-- 所有依赖[\s\S]*?-->/, '<!-- GitHub Pages build. All runtime dependencies are embedded. -->')
  .replace(/<script\s+src="[^"]+"\s*>\s*<\/script>\s*/g, '')
  .replace(script[0], () => `<script>\n${javascript}\n</script>`)
  .replaceAll('fixMermaid 本地工具', 'fixMermaid 图表修复体验版');
if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=/i.test(html)) {
  throw new Error('An external script or stylesheet remains in the built page');
}

// Carry the distributed code's license notices inside the single file as inert JSON.
const notices = [{ name: 'fix-mermaid', text: await readFile(resolve(root, 'LICENSE'), 'utf8') }];
const packages = new Set(Object.keys(result.metafile.inputs).map((path) =>
  path.replaceAll('\\', '/').match(/^node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1]).filter(Boolean));
for (const name of [...packages].sort()) {
  const directory = resolve(root, 'node_modules', name);
  for (const file of await readdir(directory, { withFileTypes: true })) {
    if (file.isFile() && /^(?:licen[sc]e|copying|notice)(?:[._-]|$)/i.test(file.name)) {
      notices.push({ name: `${name}/${file.name}`, text: await readFile(resolve(directory, file.name), 'utf8') });
    }
  }
}
const noticeJson = JSON.stringify(notices).replace(/</g, '\\u003c');
// The bundled Mermaid code contains literal </body> strings; only insert at the document's end.
const bodyEnd = html.lastIndexOf('</body>');
if (bodyEnd < 0) throw new Error('Missing closing body tag');
html = html.slice(0, bodyEnd) + `<script type="application/json" id="third-party-licenses">${noticeJson}</script>\n` + html.slice(bodyEnd);
await mkdir(resolve(root, 'dist'), { recursive: true });
const output = resolve(root, 'dist/index.html');
await writeFile(output, html, 'utf8');
await writeFile(resolve(root, 'dist/.nojekyll'), '', 'utf8');
console.log(`Created ${output} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB)`);
