/** Mermaid → Markmap Markdown. No DOM, network, evaluation or model calls. */
const TITLES = {
  flowchart: '流程图', graph: '流程图', sequenceDiagram: '时序图', mindmap: '思维导图',
  pie: '饼图', xychart: '数据图表', 'xychart-beta': '数据图表', erDiagram: '实体关系',
  classDiagram: '类图', 'classDiagram-v2': '类图', stateDiagram: '状态图', 'stateDiagram-v2': '状态图',
  gantt: '甘特图', journey: '用户旅程', timeline: '时间线', gitGraph: '提交历史',
  quadrantChart: '象限图', requirementDiagram: '需求关系', C4Context: '系统上下文',
  C4Container: '容器关系', C4Component: '组件关系', C4Dynamic: '动态关系', C4Deployment: '部署关系',
  'sankey-beta': '流量关系', 'block-beta': '模块关系', 'packet-beta': '数据包',
  'architecture-beta': '架构', kanban: '看板',
};
const node = (text, children = []) => ({ text: String(text), children });
const hasType = (name) => Object.prototype.hasOwnProperty.call(TITLES, name);
const unquote = (s) => s.trim().replace(/^"([\s\S]*)"$/, '$1').replace(/^'([\s\S]*)'$/, '$1');
const textOf = (s) => unquote(s).replace(/^`([\s\S]*)`$/, '$1')
  .replace(/<br\s*\/?\s*>/gi, ' / ').replace(/#quot;/g, '"').replace(/#(\d+);/g, (_, n) => {
    const cp = Number(n); return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
  });
// Generated nodes are literal text, never HTML, links, images, math or executable directives.
export function escapeMarkdown(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()#+.!|$~]/g, '\\$&').replace(/[\r\n\u0000-\u001f]/g, ' ');
}

function sourceBody(input) {
  let source = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  const fence = source.match(/```\s*(?:mermaid|mmd)?[^\n]*\n([\s\S]*?)(?:\n\s*```|$)/i);
  if (fence) source = fence[1];
  let title = '';
  if (source.trimStart().startsWith('---')) {
    source = source.trimStart().replace(/^---\n([\s\S]*?)\n---\s*\n?/, (_, meta) => {
      title = textOf(meta.match(/^title:\s*(.+)$/m)?.[1] || ''); return '';
    });
  }
  // Remove complete init directives, including multi-line directives.
  source = source.replace(/%%\{[\s\S]*?\}%%/g, '');
  const lines = source.split('\n').filter((line) => !line.trim().startsWith('%%'));
  const index = lines.findIndex((line) => hasType(line.trim().split(/[\s;]/)[0])
    || /^(?:line|bar|xy)[\s_-]*chart\b/i.test(line.trim()));
  return { lines: index < 0 ? lines : lines.slice(index), title };
}

const SHAPES = [['[[', ']]'], ['[(', ')]'], ['([', '])'], ['((', '))'], ['{{', '}}'],
  ['[/', '/]'], ['[\\', '\\]'], ['[/', '\\]'], ['[\\', '/]'], ['>', ']'],
  ['))', '(('], [')', '('], ['[', ']'], ['(', ')'], ['{', '}']];
function shapeLabel(s) {
  for (const [open, close] of SHAPES) {
    if (s.startsWith(open) && s.endsWith(close)) return textOf(s.slice(open.length, -close.length));
  }
  return null;
}
function graphNode(expr) {
  const cleaned = expr.trim().replace(/:::[\w-]+$/, '');
  const m = cleaned.match(/^([\p{L}\p{N}_-]+)([\s\S]*)$/u);
  if (!m) throw new Error(`无法识别节点：${expr}`);
  const rest = m[2].trim();
  if (!rest) return { id: m[1], label: m[1] };
  let label = shapeLabel(rest);
  if (label === null && rest.startsWith('@{')) label = rest.match(/\blabel\s*:\s*"([^"]*)"/)?.[1] ?? null;
  if (label === null) throw new Error(`节点格式不明确：${expr}`);
  return { id: m[1], label };
}

// Split only outside quoted labels / shapes; punctuation inside text remains intact.
function splitOutside(text, separator) {
  const parts = []; let start = 0, quote = '', depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === quote && text[i - 1] !== '\\') quote = ''; continue; }
    if (ch === '"' || ch === '`') { quote = ch; continue; }
    if ('[({'.includes(ch)) depth++;
    else if ('])}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (!depth && ch === separator) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start)); return parts.filter((s) => s.trim());
}
function edgeParts(statement) {
  const endpoints = [], arrows = []; let start = 0, quote = '', depth = 0;
  for (let i = 0; i < statement.length; i++) {
    const ch = statement[i];
    if (quote) { if (ch === quote && statement[i - 1] !== '\\') quote = ''; continue; }
    if (ch === '"' || ch === '`') { quote = ch; continue; }
    if ('[({'.includes(ch)) depth++;
    else if ('])}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth) continue;
    const match = statement.slice(i).match(/^(?:<[-.=]+>|<[-.=]{2,}|[ox]?[-.=]{2,}[>ox]?)/);
    if (!match) continue;
    endpoints.push(statement.slice(start, i));
    let end = i + match[0].length;
    let label = '';
    const suffix = statement.slice(end).match(/^\s*\|([^|]*)\|/);
    if (suffix) { label = textOf(suffix[1]); end += suffix[0].length; }
    arrows.push({ arrow: match[0], label }); start = end; i = end - 1;
  }
  endpoints.push(statement.slice(start));
  return { endpoints, arrows };
}

function flowTree(lines, title) {
  const nodes = new Map(), edges = [], groups = [], groupStack = [];
  const remember = (expr) => {
    const n = graphNode(expr), old = nodes.get(n.id);
    if (!old || n.label !== n.id) nodes.set(n.id, n);
    if (groupStack.length) groupStack[groupStack.length - 1].members.add(n.id);
    return n.id;
  };
  for (const line of lines) for (const part of splitOutside(line, ';')) {
    const s = part.trim();
    if (!s || /^(?:style|classDef|class|linkStyle|click|direction)\s/.test(s)) continue;
    if (s.startsWith('subgraph ')) {
      const raw = s.slice(9).trim(); let label;
      try { label = graphNode(raw).label; } catch { label = textOf(raw); }
      const group = { label, members: new Set() }; groups.push(group); groupStack.push(group); continue;
    }
    if (s === 'end') { groupStack.pop(); continue; }
    const { endpoints, arrows } = edgeParts(s);
    const ends = endpoints.map((part) => splitOutside(part, '&').map(remember));
    for (let i = 0; i < arrows.length; i++) for (const from of ends[i]) for (const to of ends[i + 1]) {
      edges.push({ from, to, ...arrows[i] });
    }
  }
  if (!nodes.size) throw new Error('流程图没有可识别的节点');
  const outgoing = new Map(), incoming = new Set();
  for (const e of edges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    outgoing.get(e.from).push(e); incoming.add(e.to);
  }
  const visited = new Set();
  function walk(id, ancestors = new Set()) {
    const label = nodes.get(id).label;
    if (visited.has(id)) return node(`${ancestors.has(id) ? '返回' : '关联'}：${label}（${id}）`);
    visited.add(id); const path = new Set(ancestors); path.add(id);
    const children = (outgoing.get(id) || []).map((e) => {
      const child = walk(e.to, path);
      if (e.label) child.text = `${e.label}：${child.text}`;
      if (!/^[.-]+>$/.test(e.arrow)) child.text = `${e.arrow} ${child.text}`;
      return child;
    });
    return node(label, children);
  }
  const roots = [...nodes.keys()].filter((id) => !incoming.has(id));
  const trees = roots.map((id) => walk(id));
  for (const id of nodes.keys()) if (!visited.has(id)) trees.push(walk(id));
  const root = trees.length === 1 && !title ? trees[0] : node(title || '流程图', trees);
  for (const group of groups) root.children.push(node(`分组：${group.label}`, [...group.members].map((id) => node(nodes.get(id).label))));
  return root;
}

function mindTree(lines, title) {
  const roots = [], stack = [];
  for (const line of lines) {
    const s = line.trim(); if (!s || s.startsWith('::')) continue;
    let label = s;
    const match = s.match(/^[A-Za-z0-9_-]*([\s\S]+)$/);
    if (match) label = shapeLabel(match[1]) ?? s;
    const n = node(textOf(label)), indent = line.match(/^\s*/)[0].length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length) stack[stack.length - 1].n.children.push(n); else roots.push(n);
    stack.push({ indent, n });
  }
  if (!roots.length) throw new Error('思维导图内容为空');
  return roots.length === 1 ? roots[0] : node(title || roots[0].text, title ? roots : [...roots[0].children, ...roots.slice(1)]);
}

function sequenceTree(lines, title) {
  const names = new Map(), events = [], blocks = [events]; let step = 0;
  for (const line of lines) {
    const s = line.trim(); if (!s) continue;
    const actor = s.match(/^(?:participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/);
    if (actor) { names.set(actor[1], textOf(actor[2] || actor[1])); continue; }
    const target = blocks[blocks.length - 1];
    const block = s.match(/^(loop|alt|opt|par|critical|break|rect|box)\b\s*(.*)/);
    if (block) {
      const labels = { loop: '循环', alt: '条件分支', opt: '可选', par: '并行', critical: '关键区', break: '中断', rect: '区间', box: '分组' };
      const n = node(`${labels[block[1]]}：${block[2]}`); target.push(n); blocks.push(n.children); continue;
    }
    if (s === 'end') { if (blocks.length > 1) blocks.pop(); continue; }
    if (/^autonumber\b/.test(s)) continue;
    const msg = s.match(/^(\S+?)\s*(<<-->>|<<->>|-->>|->>|-->|->|--x|-x|--\)|-\))\s*[+-]?(\S+?)\s*:\s*(.*)$/);
    if (msg) {
      for (const id of [msg[1], msg[3]]) if (!names.has(id)) names.set(id, id);
      target.push(node(`步骤 ${++step}：${names.get(msg[1])} ${msg[2]} ${names.get(msg[3])}：${textOf(msg[4])}`));
    } else if (/^(?:Note|note|else|and|option|activate|deactivate|create|destroy|title)\b/.test(s)) {
      target.push(node(textOf(s)));
    } else throw new Error(`无法识别时序图语句：${s}`);
  }
  if (!names.size && !events.length) throw new Error('时序图内容为空');
  return node(title || '时序图', [node('参与者', [...names].map(([id, name]) => node(name === id ? name : `${name}（${id}）`))), ...events]);
}

// Data values come from the ORIGINAL source: never discard units, percentages or “待定”.
function dataTree(original, type, title) {
  const rows = sourceBody(original).lines;
  const children = []; let chartTitle = title, categories = [], series = 0;
  for (const raw of rows) {
    const s = raw.trim(); if (!s || /^(?:pie(?:\s+chart)?|xychart(?:-beta)?|lineChart|barChart)\b/i.test(s)) continue;
    const heading = s.match(/^title\s*[:：]?\s*(.+)$/i);
    if (heading) { chartTitle = textOf(heading[1]); continue; }
    if (type === 'pie') {
      const row = s.match(/^(.+?)\s*[:：]\s*(.+)$/);
      if (!row) throw new Error(`无法识别饼图数据：${s}`);
      children.push(node(`${textOf(row[1])}：${row[2]}`)); continue;
    }
    const axis = s.match(/^(x-axis|y-axis)\s*:?\s*(.*)$/i);
    if (axis) {
      const values = axis[2].match(/[\[［【]([\s\S]*)[\]］】]/);
      if (axis[1] === 'x-axis' && values) categories = values[1].split(/[,，]/).map(textOf);
      children.push(node(`${axis[1] === 'x-axis' ? '横轴' : '纵轴'}：${axis[2]}`)); continue;
    }
    const values = s.match(/^(bar|line)\s*:?\s*(.*?)\s*[\[［【]([\s\S]*)[\]］】]\s*$/i);
    if (!values) throw new Error(`无法识别图表数据：${s}`);
    const entries = values[3].split(/[,，]/).map((v) => v.trim());
    const label = textOf(values[2]) || `${values[1] === 'bar' ? '柱状' : '折线'}系列 ${++series}`;
    children.push(node(label, entries.map((value, i) => node(`${categories[i] || `第 ${i + 1} 项`}：${value}`))));
  }
  if (!children.length) throw new Error('图表数据为空');
  return node(chartTitle || TITLES[type], children);
}

/** Other Mermaid families retain ALL non-style statements, in source order and nested blocks.
 * Relationship operators/cardinalities remain literal text, so conversion does not invent semantics.
 */
function statementTree(lines, title) {
  const root = node(title), stack = [root];
  let section = null;
  for (const line of lines) {
    let s = line.trim(); if (!s || /^(?:style|classDef|linkStyle|click)\s/.test(s)) continue;
    if (s === '}' || s === 'end') { if (stack.length > 1) stack.pop(); continue; }
    const sec = s.match(/^(?:section|state|class)\s+(.+?)(?:\s*\{)?$/);
    if (sec && !s.endsWith('{')) {
      section = node(textOf(sec[1])); root.children.push(section); continue;
    }
    if (/^title\s+/.test(s)) { root.text = textOf(s.replace(/^title\s+/, '')); continue; }
    const open = s.endsWith('{');
    if (open) s = s.slice(0, -1).trim();
    const n = node(textOf(s)); (stack.length > 1 ? stack[stack.length - 1] : section || root).children.push(n);
    if (open) stack.push(n);
  }
  if (!root.children.length) throw new Error('图表没有可转换的内容');
  return root;
}

function serialize(root) {
  if (!root.text.trim()) throw new Error('图表标题为空');
  const out = [`# ${escapeMarkdown(root.text)}`]; let count = 0;
  const todo = root.children.slice().reverse().map((n) => ({ n, depth: 0 }));
  while (todo.length) {
    const { n, depth } = todo.pop();
    if (++count > 5000 || depth > 100) throw new Error('图表节点或层级超过本地转换上限');
    out.push(`${'  '.repeat(depth)}- ${escapeMarkdown(n.text)}`);
    for (let i = n.children.length - 1; i >= 0; i--) todo.push({ n: n.children[i], depth: depth + 1 });
  }
  return `${out.join('\n')}\n`;
}

export function mermaidToMarkmap(repaired, original = repaired) {
  if (repaired.length > 250000) throw new Error('图表内容超过本地转换上限');
  const { lines, title } = sourceBody(repaired);
  const header = lines.shift()?.trim() || '';
  const type = header.split(/[\s;]/)[0];
  if (!hasType(type)) throw new Error('无法识别 Mermaid 图表类型');
  const inline = header.match(/^(?:flowchart|graph)\s+(?:TD|TB|BT|LR|RL)\s*;\s*(.+)$/)?.[1];
  if (inline) lines.unshift(inline);
  let tree;
  if (type === 'flowchart' || type === 'graph') tree = flowTree(lines, title);
  else if (type === 'mindmap') tree = mindTree(lines, title);
  else if (type === 'sequenceDiagram') tree = sequenceTree(lines, title);
  else if (type === 'pie' || type.startsWith('xychart')) tree = dataTree(original, type, title);
  else tree = statementTree(lines, title || TITLES[type]);
  return { code: serialize(tree), type };
}

export function normalizeMarkmap(input) {
  const code = input.trim().replace(/^```(?:markmap|markdown|md)?\s*\n/i, '').replace(/\n```\s*$/, '');
  const lines = code.replace(/\r\n?/g, '\n').split('\n');
  if (!/^#\s+\S/.test(lines[0])) throw new Error('Markmap 缺少根标题');
  if (lines.slice(1).some((s) => s.trim() && !/^\s*-\s+\S/.test(s))) throw new Error('Markmap 包含非树状内容');
  // Decode our literal serialization once, then escape again; repeated calls are idempotent.
  const literal = (s) => s.replace(/\\([\\`*_{}\[\]()#+.!|$~])/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return `${lines.filter((s) => s.trim()).map((s, i) => {
    const m = s.match(i ? /^(\s*-\s+)(.*)$/ : /^(#\s+)(.*)$/);
    return m[1] + escapeMarkdown(literal(m[2].trim()));
  }).join('\n')}\n`;
}
