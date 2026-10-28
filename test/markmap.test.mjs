import assert from 'node:assert/strict';
import test from 'node:test';
import { Transformer } from 'markmap-lib';
import { fixMermaid } from '../src/fixMermaid.js';
import { cases } from './cases.mjs';

function labels(code) {
  const { root } = new Transformer([]).transform(code);
  const result = [], todo = [root];
  while (todo.length) { const n = todo.pop(); result.push(n.content); todo.push(...(n.children || [])); }
  return result.join('\n').replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)));
}
for (const c of cases) test(`Markmap conversion: ${c.id} ${c.title}`, () => {
  const r = fixMermaid(c.src);
  assert.equal(r.ok, c.expectFixable !== false, r.error);
  assert.equal(r.format, 'markmap');
  if (r.ok) { assert.match(r.code, /^# /); assert.ok(labels(r.code).trim()); }
});

test('all requested diagram families can enter the Markmap chain', () => {
  const examples = [
    'gantt\n title 交付\n section 开发\n实现 :a, 2026-10-01, 3d',
    'timeline\n title 历程\n2026 : 发布',
    'journey\n title 体验\nsection 购物\n付款: 5: 用户',
    'gitGraph\ncommit id: "start"\nbranch feature\ncheckout feature\ncommit',
    'quadrantChart\ntitle 优先级\nA: [0.5, 0.8]',
    'requirementDiagram\nrequirement test {\nid: 1\ntext: 保留需求\n}',
    ...['C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'].map((t) => `${t}\nPerson(user, "用户")`),
    'sankey-beta\n来源,目标,100', 'block-beta\ncolumns 2\na["服务A"] b["服务B"]',
    'packet-beta\n0-15: "端口"', 'architecture-beta\nservice api(server)[API]',
    'kanban\ntodo[待办]\n  task[实现转换]',
  ];
  for (const source of examples) { const r = fixMermaid(source); assert.ok(r.ok, `${source}: ${r.error}`); assert.ok(labels(r.code)); }
});
test('cycles, shared descendants, disconnected nodes and edge labels survive', () => {
  const r = fixMermaid('flowchart LR\nA[开始] -->|提交| B[处理]\nB --> A\nC[其他入口] --> B\nD[独立节点]\nE[第二入口] --> B');
  assert.ok(r.ok, r.error);
  const text = labels(r.code);
  for (const term of ['开始', '提交', '处理', '返回', '其他入口', '关联', '独立节点']) assert.ok(text.includes(term), term);
});
test('data values, units, unknown values and negative values are retained', () => {
  const r = fixMermaid('pie\ntitle 预算\n"研发" : ¥1,200万\n"其他": 待定\n"调整": -3');
  for (const term of ['¥1,200万', '待定', '-3']) assert.ok(labels(r.code).includes(term), term);
  const chart = fixMermaid(cases.find((c) => c.id === 'B02').src);
  assert.ok(labels(chart.code).includes('37.5%'));
});
test('punctuation and HTML-like node text cannot become active markup', () => {
  const r = fixMermaid('mindmap\n root((安全))\n  <img src=x onerror=alert(1)>\n  [点击](javascript:alert(1))\n  **原文**');
  assert.ok(r.ok, r.error);
  const text = labels(r.code);
  assert.doesNotMatch(text, /<img|<a\b|<script|<strong/);
  assert.match(text, /&lt;img/);
  assert.match(text, /原文/);
});
test('invalid, empty or ambiguous input fails without producing fake content', () => {
  for (const input of ['', null, 'this is not a diagram', 'flowchart TD', 'mindmap']) assert.equal(fixMermaid(input).ok, false);
});
test('an already converted Markmap can be passed back explicitly without double escaping', () => {
  const first = fixMermaid(cases.find((c) => c.id === 'M02').src);
  const second = fixMermaid(first.code, { inputFormat: 'markmap' });
  assert.ok(second.ok); assert.equal(second.code, first.code); assert.equal(second.changed, false);
  const html = fixMermaid('# root\n- <img src=x onerror=alert(1)>', { inputFormat: 'markmap' });
  assert.doesNotMatch(labels(html.code), /<img/);
});
test('one call is deterministic and has no internal retries', () => {
  const first = fixMermaid(cases[0].src);
  assert.deepEqual(fixMermaid(cases[0].src), first);
  assert.equal('attempts' in first, false); assert.equal('history' in first, false);
});
test('sequence message order and punctuation are preserved', () => {
  const r = fixMermaid(cases.find((c) => c.id === 'S01').src);
  assert.ok(r.ok); assert.match(r.code, /请求数据; 带分页参数/);
  assert.ok(r.code.indexOf('步骤 1') < r.code.indexOf('步骤 2'));
  assert.ok(r.code.indexOf('步骤 4') < r.code.indexOf('步骤 5'));
});
