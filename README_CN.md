<p align="center">
  <img src="docs/images/fmlogo.png" alt="fix-mermaid.js">
</p>

# fix-mermaid.js

**本地修复 Mermaid，并固定输出 Markmap Markdown 的 JavaScript 工具。**

本分支的 `fixMermaid` 每次调用只执行一次转换，不调用模型、不渲染图表、不管理重试。后端负责在原图渲染失败后调用工具，并根据后续渲染结果决定是否再次调用（业务上限 3 次）以及最终失败展示。

成功结果为 `{ ok: true, format: 'markmap', code, markdown, changed, fixes, error: null }`。`code` 是带 ```markmap 围栏的完整代码块（可直接展示、复制、贴给 Markmap 渲染器），`markdown` 是不带围栏的 Markdown 正文（渲染器可直接用 `markdown`）。`ok` 表示转换成功，实际显示是否成功仍需调用方验证。

为兼容原有使用方，`repairMermaidSyntax`、`safeRepairMermaid` 和 `fix-mermaid/render` 保留 Mermaid 语法修复行为。本地 `examples/demo.html` 已接入新的 Markmap 输出；在线体验页由下方 GitHub Pages 工作流发布。

<p align="center">
  <a href="https://le9070124-dot.github.io/fix-mermaid/"><strong>在线示例</strong></a>
</p>

LLM 大多数时候能写出正确的 Mermaid，但总有一部分图渲染失败。常见原因有：全角标点、标签里有括号却没加引号、用 `end` 当节点 ID、漏写 `end`、饼图数值带 `%`、脑图写成了 Markdown 列表。`fix-mermaid` 是一个零依赖的 JavaScript 小模块，在渲染前把这些错误修好，让用户看到的是图，而不是 `Syntax error in text`。

[English](./README.md)

![修复前后对比：流程图中的全角符号](docs/images/F02.png)

## 亮点

- **本地可用**：工具只处理字符串，不操作 DOM，无运行时依赖；`src/fixMermaid.js` 和 `src/markmap-convert.js` 两个 ES Module 可运行于浏览器、Web Worker 和 Node。
- **能修复大部分 LLM 输出的 Mermaid 语法错误**：覆盖流程图、时序图、类图、状态图、ER 图、饼图、柱状图/折线图（`xychart`）和脑图。在真实浏览器测试中，20 个可修复的错误图全部修复后正确渲染。
- **不会改坏正确的图**：`safeRepairMermaid` 会先用你渲染时用的同一个 `mermaid.parse` 做校验。能通过的原样返回；修复后的代码也会再校验一次，通过了才使用。
- **能发现"能解析但画错"的图**：比如脑图节点 `数学(微积分)` 能通过解析，但括号外的文字会丢掉。语义检查能识别这种写法并修复。
- **修不好也不会白屏**：配套的渲染封装会降级为展示源码，并附上复制按钮，不会出现空白或报错堆栈。
- **支持流式输出**：LLM 还在生成时，半截代码不会闪出报错，画面保留上一次成功的图，生成结束后再做最终渲染。
- **可观测**：每次修复都会列出命中了哪些规则（`fixes`），可以用来持续改进 prompt 和规则。
- **联网角标自动去除**：AI 联网回答里的 `[1]`、`[^2]`、`［3］` 会在句末（句号/逗号旁或行尾）被判定为引用并删除；句中出现、后面还有字的数字方括号（如 `成绩[90]分`）按正文保留。
- **兼容性好**：没有使用正则后行断言，支持 iOS/Safari 13.4+、Chrome 80+、Firefox 78+。



## 快速开始



### 1. 安装

可以任选下面一种方式：

```bash
# 方式 A：从 GitHub 安装
npm install github:le9070124-dot/fix-mermaid

# 方式 B：同时复制两个源码文件到同一目录（没有运行时依赖）
curl -O https://raw.githubusercontent.com/le9070124-dot/fix-mermaid/main/src/fixMermaid.js
curl -O https://raw.githubusercontent.com/le9070124-dot/fix-mermaid/main/src/markmap-convert.js
```

```html
<!-- 方式 C：通过 CDN 引入，不需要构建 -->
<script type="module">
  import { fixMermaid } from 'https://cdn.jsdelivr.net/gh/le9070124-dot/fix-mermaid@main/src/fixMermaid.js';
</script>
```

渲染和校验还需要 `mermaid` 本身（`npm install mermaid`），已在 Mermaid 11 上测试。

### 2. 30 秒上手：修复一段字符串

```js
import { fixMermaid } from 'fix-mermaid';

const llmOutput = 'flowchart LR\nA【用户】——>B（登录服务）\nB --> C[调用接口(v2)]';
const { ok, format, code, changed, fixes, error } = fixMermaid(llmOutput);

console.log(code);
// # 用户
// - 登录服务
//   - 调用接口\(v2\)
console.log(format); // markmap
console.log(fixes); // 命中的修复规则
```



### 3. 兼容 API：保留 Mermaid 的校验 → 修复 → 再校验

下例是原有 Mermaid 链路。新的后端工具接入请直接调用 `fixMermaid` 并使用返回的 `format` 和 `code`：

```js
import mermaid from 'mermaid';
import { safeRepairMermaid, createMermaidParser } from 'fix-mermaid';

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
const parse = createMermaidParser(mermaid);

const r = await safeRepairMermaid(llmOutput, parse);
if (r.ok) {
  const { svg } = await mermaid.render('diagram-1', r.code);
  container.innerHTML = svg;
} else {
  container.textContent = llmOutput; // 降级：展示源码
}
```



### 4. 使用渲染封装（可选）

`src/mermaid-render.js` 把整条流程都封装好了：校验、修复、渲染、缓存、降级、上报和流式处理。

```js
import { setupMermaid, renderMermaidSafe, hydrateMermaid } from 'fix-mermaid/render';

setupMermaid({
  theme: 'auto',                        // 'light' | 'dark' | 'auto'
  onReport: (r) => sendMetrics(r),      // { ok, code, fixes, originalError, error, source }
});

await renderMermaidSafe(element, llmOutput);  // 渲染单张图
await hydrateMermaid(messageElement);         // Markdown 渲染完成后，把所有 ```mermaid 代码块换成图
```

> `mermaid-render.js` 用的是裸模块名 `'mermaid'`。在 Vite、webpack 中可以直接使用；不用打包工具时需要自行配置 import map。本地演示页直接加载 `node_modules` 内的浏览器依赖。



### 5. 流式输出

```js
import { createStreamingMermaid } from 'fix-mermaid/render';

const stream = createStreamingMermaid(element);
onToken((textSoFar) => stream.update(textSoFar));   // 生成过程中不会闪出报错
onDone((fullText) => stream.update(fullText, { done: true }));
```



### 6. React

```jsx
import MermaidBlock, { MarkdownCode } from './examples/MermaidBlock.jsx';

<MermaidBlock code={text} streaming={!messageDone} />

// 配合 react-markdown
<ReactMarkdown components={{ code: MarkdownCode }}>{markdown}</ReactMarkdown>
```



### 7. 运行示例

```bash
git clone https://github.com/le9070124-dot/fix-mermaid.git
cd fix-mermaid
npm install                      # 首次使用时安装依赖
npm run demo
# 打开 http://127.0.0.1:8765/examples/demo.html
```

左侧粘贴 Mermaid 或加载脑图示例，点击“修复并生成脑图”。右侧显示原始 Mermaid 和转换后的 Markmap，支持缩放、拖动、折叠、全屏；“展示修复后源码”会展开完整的 ```markmap 代码块（含围栏）并可一键复制。每次点击只调用一次工具。开发演示页从本地加载依赖，通过上述 HTTP 地址打开。

### 8. 发布 GitHub Pages

```bash
npm run build:site
```

生成网站入口 `dist/index.html`，运行时所需依赖均包含在构建产物中。`npm run test:site` 使用 Chrome 验证构建后的脑图交互和源码展示。

在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。`.github/workflows/pages.yml` 会在推送到 `main` 或手动运行时测试、打包并发布。体验地址为 https://le9070124-dot.github.io/fix-mermaid/ 。

![前端调用示例：修复前后对比](docs/images/demo.png)

## 能修复哪些错误


| 图类型                  | 能修复的常见 LLM 错误                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 通用                   | 图前后的说明文字和 ````mermaid `围栏（包括流式输出中还没闭合的围栏）；零宽字符和全角空格；缺少图类型声明；类型名大小写错误或写成别名（`pie chart`、`lineChart`、`mindMap`）；流程图缺少方向                                                                        |
| 流程图                  | 标签含 `() [] {} / : ; "` 却没加引号；`/api/users` 被误识别成梯形；全角 `【】（）` 被当作形状；`——>`、`→`、`->`、`=>` 等箭头写法；`-- 文本 -->` 形式的边文本；用 `end` 当节点 ID；subgraph 标题含空格；`subgraph` 和 `end` 数量不匹配；`click` 指令（出于安全考虑会删除） |
| 时序图                  | 全角冒号；消息缺冒号（`A->>B 消息`）；消息里有分号；非法箭头（`=>`）；`loop/alt/opt/par` 等块没闭合；孤立的 `deactivate` 和 `-` 标记                                                                                                 |
| 类图 / 状态图 / ER 图      | `{ }` 不平衡，并按缩进推断右括号应补在哪里；全角冒号；ER 关系标签没加引号或缺失                                                                                                                                                |
| 饼图                   | 标签没加引号、用了单引号或中文引号；全角冒号；数值写成 `45%`、`¥1,200万`、`800 万元`；`title:` 后面多了冒号；没有数值的行会被删除（会记录在 `fixes` 中）；负数行会被删除                                                                                     |
| 柱状图 / 折线图（`xychart`） | 中文标题、坐标轴标题、类别和系列名没加引号；全角方括号和逗号；范围写成 `0 ~ 100` 或 `0 - 100`；`bar:`、`x-axis:` 后面多了冒号；数值带 `%` 或单位                                                                                               |
| 脑图                   | Markdown 标题（`#`、`##`）和列表符号（`-`、`*`、`1.`）转成缩进；出现多个根节点时挂到第一个根节点下；含括号的文本加引号；`数学(微积分)` 这类能解析但会丢字的写法；句末的联网角标（`[1]`、`[^2]`）直接删除                                                                                             |



| 饼图                         | 脑图                         |
| -------------------------- | -------------------------- |
| ![饼图](docs/images/P01.png) | ![脑图](docs/images/M02.png) |


![语义检查：脑图丢字](docs/images/M03.png)

## API



### `fixMermaid(input, options?) → { ok, format, code, changed, fixes, error, sourceType? }`

同步执行一次本地修复与转换，不会抛出异常，`format` 固定为 `markmap`。无法可靠转换时返回 `ok: false, code: '', error: '具体原因'`，不把 Mermaid 源码伪装成成功的 Markmap。

- 思维导图保留层级；流程图保留节点、分支及关系，循环和共享节点使用“返回 / 关联”文字表达。
- 时序图保留参与者、消息顺序和条件块；数据图表保留原始数值、单位、百分号和“待定”等内容。
- 类图、ER 图、状态图以及其他已识别类型，按原语句和块层级组织成树，关系符号保留为文字。不会恢复原图的几何布局。
- 相同输入与参数得到相同输出；重试策略和次数由后端决定。若后端回传上一次的 Markmap，显式设置 `inputFormat: 'markmap'`，进行标题/列表规范化。


| 选项            | 默认值     | 说明                       |
| ------------- | ------- | ------------------------ |
| `quoteAll`    | `false` | 给流程图的所有标签都加引号，而不只是有风险的标签 |
| `removeClick` | `true`  | 删除 `click` 指令            |
| `inputFormat` | `'mermaid'` | 传入上次返回值时可设为 `'markmap'` |


`fixes` 是一个数组，里面是命中规则的中文说明。

### `repairMermaidSyntax(input, options?) → { code, changed, fixes }`

原 `fixMermaid` 的 Mermaid 语法修复功能，供兼容链路使用。`safeRepairMermaid` 内部调用此函数，因此原有渲染封装行为保持不变。

新工具验证：`npm test`；实际 Markmap 渲染验证：`npm run test:markmap-browser`（默认使用本机 Edge，可通过 `BROWSER_CHANNEL=chrome` 切换）。测试截图输出到 `test/browser/shots/markmap-preview.png`。

### `safeRepairMermaid(input, parse, options?) → Promise<{ ok, code, fixes, originalError, error }>`

1. 先解析原文。如果能通过、也没有发现可疑写法，就原样返回。
2. 否则执行 `repairMermaidSyntax`，然后再解析一次。
3. `ok: false` 表示修不好。这时可以降级展示源码，或者交给 LLM 修复。



### `createMermaidParser(mermaid) → (code) => Promise<string | null>`

把 Mermaid 实例包装成一个校验函数：代码合法时返回 `null`，不合法时返回错误信息。

### 渲染封装（`fix-mermaid/render`）


| 函数                                                 | 说明                                                            |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `setupMermaid({ theme, onReport, mermaidConfig })` | 初始化 Mermaid，只需调用一次；默认开启 `securityLevel: 'strict'`，并配置了清晰的图表色板 |
| `renderMermaidSafe(el, source)`                    | 校验、修复、渲染；失败时降级为源码加复制按钮                                        |
| `compileMermaid(source)`                           | 执行同样的流程，但不操作 DOM；返回 `{ ok, svg, code, fixes, ... }`（带缓存）      |
| `hydrateMermaid(root)`                             | 把 `<pre><code class="language-mermaid">` 代码块替换成图              |
| `createStreamingMermaid(el, { delay })`            | 用于流式输出，返回 `{ update(source, { done }), cancel() }`            |
| `renderMermaidRaw(el, source)`                     | 不做任何修复、直接渲染原文，用于调试和对比                                         |


多次渲染会排队依次执行，避免 `mermaid.render` 并发冲突。结果按源码缓存（最多 200 条），同一段源码只上报一次。

## 原有 Mermaid 兼容链路的工作原理

```
LLM 输出
   │
   ▼
mermaid.parse ── 通过 ──► 语义检查 ── 没问题 ──► 原样渲染
   │ 失败                   │ 可疑
   ▼                        ▼
repairMermaidSyntax ───► mermaid.parse ── 通过 ──► 渲染修复后的代码
                             │ 失败
                             ▼
                   展示源码 + 复制按钮（或交给 LLM 修复）
```

原有规则是确定性的。原有浏览器测试统计 Mermaid SVG 中的节点、边、消息、扇区和柱子；新增的 `test:markmap-browser` 则验证新工具输出的 Markmap 节点与文本。

## 测试

```bash
npm install
npm test                      # 24 个用例，用真实的 mermaid.parse 校验（通过 jsdom 提供 DOM）
```

浏览器测试会在无头 Chromium 中分别渲染每个用例的修复前和修复后，并保存截图：

```bash
pip install playwright && playwright install chromium
python3 -m http.server 8765 &
python3 test/browser/run.py   # 截图保存在 test/browser/shots/
```

在 Mermaid 11.17.2 上的当前结果：


|                   | 数量          |
| ----------------- | ----------- |
| 测试用例              | 24          |
| 语法错误且可修复 → 修复成功   | **20 / 20** |
| 能解析但画错 → 语义检查修复   | 1           |
| 原文正确 → 未改动        | 2           |
| 已知边界 → 按预期降级为展示源码 | 1           |


测试时通过看图发现了一个只靠 parse 校验发现不了的 bug：类图缺 `}` 时，右括号被补在文件末尾，导致 `Animal <|-- Dog` 被画成了类的成员。修复方法是按缩进推断块在哪里结束：

![类图修复前后](docs/images/C01.png)

## 局限

- **有时无法判断作者意图**：时序图缺 `end` 时只能补在最后，末尾的消息可能会被包进 `loop` 里。
- **节点 ID 带空格**（`用户 登录 --> 校验 密码`）无法修复，渲染封装会降级为展示源码。
- **饼图中没有数值的行会被删除**，属于有损修复。这会记录在 `fixes` 中，建议在界面上提示用户"部分数据未显示"。
- **依赖缩进的脑图只覆盖了常见情况**，严重错乱的脑图更适合交给 LLM 修复。
- **Mermaid 版本**：已在 Mermaid 11 上测试。因为校验始终使用你自己的 Mermaid 实例，即使某条规则不适合你的版本，也不会把正确的图改坏。

规则修不好的情况，建议再接一层 LLM 修复：把源码和报错信息交给一个便宜的模型，最多重试 2～3 次。

## 使用建议

- **图表配色**：Mermaid 默认主题下，`xychart` 的第一个系列颜色非常浅。`setupMermaid` 已经帮你配置了 `themeVariables.xyChart.plotColorPalette`；如果你自己初始化 Mermaid，也建议这样配置。
![色板](docs/images/palette.png)
- **Prompt**：要求模型所有标签都加引号（`A["..."]`）、不要用 `end` 当 ID、所有块都要闭合。模型出错越少，需要修复的就越少。
- **安全**：保持 `securityLevel: 'strict'`，不要用 `innerHTML` 把未修复的源码插入页面。



## 参与贡献

如果你发现 LLM 常犯、但本库还修不了的 Mermaid 错误，欢迎在 `test/cases.mjs` 中补充用例，写上错误的源码，最好也写上预期的元素数量：

```js
{
  id: 'F10', title: '简短描述', type: 'flowchart',
  problem: '错在哪里',
  src: 'flowchart TD\n...',
  expect: { nodes: 3, edges: 2 },
}
```

提交 PR 前，请运行 `npm test` 和浏览器测试，并看一遍截图。新增规则不能把正确的图改坏，也不能使用正则后行断言。

## 许可证

[MIT](./LICENSE)
