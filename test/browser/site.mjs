/** Verify the Pages build without sibling dependencies or runtime CDN access. */
import assert from 'node:assert/strict';
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { fixMermaid } from '../../src/fixMermaid.js';

const root = resolve(import.meta.dirname, '../..');
const isolated = resolve(import.meta.dirname, 'shots/site-isolated');
await mkdir(isolated, { recursive: true });
const file = resolve(isolated, 'index.html');
await copyFile(resolve(root, 'dist/index.html'), file);
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
try {
  const context = await browser.newContext({ offline: true, viewport: { width: 1580, height: 1150 } });
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (request) => requests.push(request.url()));
  const url = pathToFileURL(file).href;
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#out')?.dataset.state === 'ok');
  assert.equal(await page.locator('#out foreignObject').count(), 24);
  assert.equal(await page.locator('script[src], link[href]').count(), 0);
  await page.locator('#toggleFixedSrc').click();
  assert.match(await page.locator('#fixedSrc').textContent(), /^```markmap\n# 郑钦文/);

  const custom = 'mindmap\n# 离线体验\n## 测试分支\n- 带括号(内容)\n- <img src=https://example.invalid/test.png onerror=alert(1)>';
  await page.locator('#src').fill(custom);
  await page.locator('#render').click();
  await page.waitForFunction(() => document.querySelector('#out').dataset.state === 'ok');
  assert.equal(await page.locator('#fixedSrc').textContent(), fixMermaid(custom).code);
  assert.equal(await page.locator('#out img, #out script').count(), 0);
  assert.match(await page.locator('#out').textContent(), /带括号\(内容\)/);

  // Validate the original Mermaid renderer's bundled dynamic diagram modules too.
  await page.locator('#src').fill('flowchart LR\nA[开始] --> B[完成]');
  await page.locator('#render').click();
  await page.waitForFunction(() => document.querySelector('#out').dataset.state === 'ok');
  assert.equal(await page.locator('#stateBefore').textContent(), '原文可渲染');
  assert.match(await page.locator('#out').textContent(), /完成/);

  await page.locator('#src').fill('无法识别的输入');
  await page.locator('#render').click();
  await page.waitForFunction(() => document.querySelector('#out').dataset.state === 'error');
  assert.equal(await page.locator('#out').textContent(), '语法错误');

  await page.locator('#sample').click();
  await page.waitForFunction(() => document.querySelector('#out').dataset.state === 'ok');

  // Other diagram families keep their native Mermaid source and render with Mermaid.
  await page.selectOption('#example', 'gantt');
  await page.waitForFunction(() => document.querySelector('#out').dataset.state === 'ok');
  await page.locator('#toggleFixedSrc').click();
  const ganttSrc = await page.locator('#fixedSrc').textContent();
  assert.match(ganttSrc, /^```mermaid\ngantt\n/);
  assert.match(ganttSrc, /"需求分析"/);
  assert.equal(await page.locator('#afterTitle').textContent(), '修复后 · 图表');
  await page.locator('#toggleFixedSrc').click();
  await page.selectOption('#example', 'xychart');
  await page.waitForFunction(() => document.querySelector('#out').dataset.state === 'ok');
  await page.locator('#toggleFixedSrc').click();
  assert.match(await page.locator('#fixedSrc').textContent(), /^```mermaid\nxychart-beta\n/);
  await page.locator('#toggleFixedSrc').click();
  await page.locator('#fit').click();
  await page.locator('#toggleFixedSrc').click();
  await page.locator('#copyFixedSrc').click();
  await page.waitForFunction(() => ['已复制', '请手动选择下方源码复制'].includes(document.querySelector('#copyFixedSrc').textContent));
  const copyStatus = await page.locator('#copyFixedSrc').textContent();
  assert.ok(copyStatus === '已复制' || copyStatus === '请手动选择下方源码复制');
  await page.locator('#toggleFixedSrc').click();
  await page.locator('#fullscreen').click();
  await page.waitForFunction(() => document.fullscreenElement?.id === 'markmapPanel');
  await page.locator('#fullscreen').click();
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.screenshot({ path: resolve(import.meta.dirname, 'shots/site-demo.png'), fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, [url]);
  console.log(`PASS: Pages build, no dependency/network requests, tool output parity, original rendering, error display, example, fullscreen and copy (${copyStatus}).`);
} finally { await browser.close(); }
