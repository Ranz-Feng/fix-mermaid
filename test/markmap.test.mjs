import assert from 'node:assert/strict';
import test from 'node:test';
import { Transformer } from 'markmap-lib';
import { fixMermaid } from '../src/fixMermaid.js';
import { cases } from './cases.mjs';

function bare(code) {
  return String(code).replace(/^\s*```(?:markmap|markdown|md)?\s*\n([\s\S]*?)\n\s*```\s*$/, '$1');
}
function labels(code) {
  const { root } = new Transformer([]).transform(bare(code));
  const result = [], todo = [root];
  while (todo.length) { const n = todo.pop(); result.push(n.content); todo.push(...(n.children || [])); }
  return result.join('\n').replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)));
}
for (const c of cases) test(`Markmap conversion: ${c.id} ${c.title}`, () => {
  const r = fixMermaid(c.src);
  assert.equal(r.ok, c.expectFixable !== false, r.error);
  assert.equal(r.format, 'markmap');
  if (r.ok) { assert.match(r.markdown, /^# /); assert.ok(labels(r.code).trim()); }
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
test('web citation markers are stripped from mindmap and flowchart output', () => {
  const mind = fixMermaid('mindmap\n  root((郑钦文))\n    排名: 世界第7位[2]\n    代言[30]\n    退出[1][5]');
  assert.ok(mind.ok, mind.error);
  const text = labels(mind.code);
  assert.doesNotMatch(text, /[\[［]\s*\d{1,3}\s*[\]］]/);
  assert.match(text, /世界第7位/);
  assert.ok(mind.fixes.some((note) => note.includes('联网角标')));
  const again = fixMermaid(mind.code, { inputFormat: 'markmap' });
  assert.equal(again.code, mind.code);
  const flow = fixMermaid('flowchart TD\nA[看新闻[1]] --> B[完成]');
  assert.ok(flow.ok, flow.error);
  assert.doesNotMatch(labels(flow.code), /[\[［]\s*\d{1,3}\s*[\]］]/);
});
test('markmap input with residual language tag or bare citation items converts cleanly', () => {
  const md = 'markmap\n# 郑钦文近期动态\n- 赛事：中网夺冠 [3][9]\n- [1]\n- [1]: https://example.com\n- 区间[0,1]';
  const r = fixMermaid(md);
  assert.ok(r.ok, r.error);
  assert.doesNotMatch(r.code, /\\?\[[0-9]{1,3}\]/);
  const text = labels(r.code);
  assert.match(text, /中网夺冠/);
  assert.match(text, /区间\[0,1\]/);
  assert.equal(fixMermaid(r.code, { inputFormat: 'markmap' }).code, r.code);
});
test('citation removal is punctuation/boundary aware, not blanket', async () => {
  const { stripCitations } = await import('../src/markmap-convert.js');
  assert.equal(stripCitations('世界第7位[2]。'), '世界第7位。');
  assert.equal(stripCitations('。[2]接下来'), '。接下来');
  assert.equal(stripCitations('世界第7位[2]'), '世界第7位'); // 行尾 = 句末
  assert.equal(stripCitations('退出[1][5]'), '退出');
  assert.equal(stripCitations('见[1]附录'), '见[1]附录'); // 句中出现，保留
  assert.equal(stripCitations('成绩[90]分'), '成绩[90]分'); // 后面还有字，保留
  assert.equal(stripCitations('区间[0,1]'), '区间[0,1]');
  const kept = fixMermaid('mindmap\n  root((测试))\n    见[1]附录\n    成绩[90]分\n    排名第7位[2]');
  assert.ok(kept.ok, kept.error);
  const text = labels(kept.code);
  assert.match(text, /见\[1\]附录/);
  assert.match(text, /成绩\[90\]分/);
  assert.doesNotMatch(text, /第7位\[2\]/);
});

test('flowchart, gantt, sequence, pie and xychart examples become readable outlines', () => {
  const flow = fixMermaid('graph TD\n    A["开始"] --> B{"是否下雨?"}\n    B -->|"是"| C["带雨伞"]\n    B -->|"否"| D["不用带伞"]\n    C --> E["出门"]\n    D --> E["出门"]');
  assert.ok(flow.ok, flow.error);
  const ft = labels(flow.code);
  for (const term of ['开始', '是否下雨', '带雨伞', '不用带伞', '出门']) assert.ok(ft.includes(term), term);

  const gantt = fixMermaid('gantt\n    title "项目开发计划"\n    dateFormat  YYYY-MM-DD\n    section "设计阶段"\n    "需求分析"        :a1, 2024-01-01, 5d\n    "UI设计"          :a2, after a1, 7d\n    section "开发阶段"\n    "前端开发"        :b1, after a2, 10d\n    "后端开发"        :b2, after a2, 12d\n    section "测试阶段"\n    "集成测试"        :c1, after b2, 5d');
  assert.ok(gantt.ok, gantt.error);
  const gt = labels(gantt.code);
  for (const term of ['项目开发计划', '设计阶段', '需求分析', '开始：2024-01-01', '在「需求分析」之后', '前端开发', '集成测试']) assert.ok(gt.includes(term), term);
  assert.doesNotMatch(gt, /dateFormat|after a1/);

  const seq = fixMermaid('sequenceDiagram\n    participant 用户\n    participant 前端\n    participant 服务器\n    用户->>前端: "提交登录请求"\n    前端->>服务器: "发送账号密码"\n    服务器-->>前端: "返回验证结果"\n    前端-->>用户: "显示登录成功"');
  assert.ok(seq.ok, seq.error);
  const st = labels(seq.code);
  for (const term of ['参与者', '用户', '步骤 1', '提交登录请求', '返回验证结果']) assert.ok(st.includes(term), term);

  const pie = fixMermaid('pie title "各部门人数占比"\n    "研发部" : 45\n    "市场部" : 20\n    "销售部" : 25\n    "行政部" : 10');
  assert.ok(pie.ok, pie.error);
  assert.match(labels(pie.code), /研发部：45/);

  const chart = fixMermaid('xychart-beta\n    title "月度销售额"\n    x-axis ["一月", "二月", "三月", "四月", "五月"]\n    y-axis "销售额(万元)" 0 --> 100\n    bar [30, 45, 60, 50, 80]\n    line [30, 45, 60, 50, 80]');
  assert.ok(chart.ok, chart.error);
  const xt = labels(chart.code);
  for (const term of ['月度销售额', '横轴：一月、二月、三月、四月、五月', '柱状系列 1', '五月：80', '折线系列 2']) assert.ok(xt.includes(term), term);
});
