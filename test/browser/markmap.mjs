/** Real browser check of tool OUTPUT only; does not change the application's renderer. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cases } from '../cases.mjs';
import { fixMermaid } from '../../src/fixMermaid.js';

const reference = `mindmap
  root((郑钦文2026年10月动态))
    中网夺冠高光
      10月11日决赛2-0击败安德列娃
      生涯首座WTA1000冠军
      中网20届首位本土女单冠军
      排名从第54位升至第23位
      锁定2027澳网种子席位
    连续退赛与赛季收官
      10月12日退出武汉网球公开赛
      10月15日退出大阪站
      10月18日退出香港站
      10月19日确认赛季提前结束
      右肩旧伤复发叠加身体疲劳
    伤病背景与教训
      2025年7月右肘关节手术
      2026年6月排名跌至第160位
      吸取仓促复出导致伤情反复教训
      从硬撑到主动止损的策略转变
    冬训与2027赛季展望
      赴西班牙巴塞罗那开启冬训
      系统康复右肩与体能储备
      双教练团队打磨发球与反手
      父亲喊话明年大满贯必须拿下
      以健康状态冲击澳网与大满贯`;
const compiled = await build({
  stdin: { contents: `import { Transformer } from 'markmap-lib';
    import { Markmap } from 'markmap-view';
    window.draw = async (code) => {
      const { root } = new Transformer([]).transform(code);
      window.view?.destroy();
      window.view = Markmap.create(document.querySelector('svg'), {
        duration: 0, initialExpandLevel: -1, maxWidth: 650, spacingHorizontal: 80, spacingVertical: 10,
      });
      await window.view.setData(root); await window.view.fit();
      return { nodes: document.querySelectorAll('foreignObject').length,
        text: [...document.querySelectorAll('foreignObject')].map(n => n.textContent).join('\\n') };
    };`, resolveDir: resolve(import.meta.dirname, '../..') },
  bundle: true, write: false, platform: 'browser', format: 'iife', logLevel: 'warning',
});
const html = '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:white}svg{width:1576px;height:1116px;font:24px "Microsoft YaHei",sans-serif}</style><svg xmlns="http://www.w3.org/2000/svg"></svg><script src="/bundle.js"></script>';
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : 'text/html; charset=utf-8');
  res.end(req.url === '/bundle.js' ? compiled.outputFiles[0].contents : html);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1576, height: 1116 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => typeof window.draw === 'function');
  const results = [];
  for (const c of cases.filter((c) => c.expectFixable !== false)) {
    const output = fixMermaid(c.src); assert.ok(output.ok, output.error);
    const result = await page.evaluate((code) => window.draw(code), output.code);
    assert.ok(result.nodes > 0, `${c.id}: empty SVG`);
    if (c.type === 'mindmap') assert.equal(result.nodes, c.expect.nodes, `${c.id}: lost node`);
    if (c.id === 'P02') for (const term of ['¥1,200万', '待定', '800 万元']) assert.ok(result.text.includes(term), term);
    if (c.id === 'M03') assert.ok(result.text.includes('数学(微积分)'));
    if (c.id === 'F01') for (const term of ['返回', '调用接口(v2)', '否(重试)']) assert.ok(result.text.includes(term), term);
    results.push({ id: c.id, ...result });
  }
  const attack = fixMermaid('mindmap\n root((安全))\n  <img src=x onerror=alert(1)>\n  [link](javascript:alert(1))');
  await page.evaluate((code) => window.draw(code), attack.code);
  assert.equal(await page.locator('foreignObject img, foreignObject a, foreignObject script').count(), 0);
  const output = fixMermaid(reference);
  const ref = await page.evaluate((code) => window.draw(code), output.code);
  assert.equal(ref.nodes, 24);
  await mkdir(resolve(import.meta.dirname, 'shots'), { recursive: true });
  await page.screenshot({ path: resolve(import.meta.dirname, 'shots/markmap-preview.png') });
  await writeFile(resolve(import.meta.dirname, 'results-markmap.json'), JSON.stringify(results, null, 2));
  await writeFile(resolve(import.meta.dirname, 'shots/markmap-preview.md'), output.code);
  assert.deepEqual(errors, []);
  console.log(`${results.length} diagram fixtures + literal-text security + 24-node reference rendered in a real browser.`);
} finally { await browser?.close(); await new Promise((done) => server.close(done)); }
