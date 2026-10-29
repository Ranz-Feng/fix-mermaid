# Changelog

## Unreleased

- `fixMermaid` output now carries the ```markmap code fence: `code` is a complete fenced block, `markdown` is the bare Markdown body. The demo's repaired-source panel shows and copies the fenced block.
- Web citation badges (`[1]`, `[^2]`, `［3］`, `[2](url)`, footnote definition lines) are stripped only when they close a sentence — next to `。`/`，` or at the end of a line. Numeric brackets inside a sentence (e.g. `成绩[90]分`) are preserved. The `fixes` list reports `去除联网角标`.
- Input that is already Markmap Markdown (root `# heading`, or a leftover `markmap` language tag) is auto-detected and normalized instead of failing as an unknown Mermaid diagram type.
- The demo shows the repaired Markmap source (copy included) and its sample uses citation-style input.
- `fixMermaid` now returns Markmap Markdown with explicit `ok`, `format` and `error` fields. This changes the output contract; consumers must use a Markmap renderer.
- Local conversion preserves tree content, graph relations, sequence order and original chart values. No model calls, rendering or internal retry loop.
- Backend callers own retry scheduling. Existing Mermaid rendering helpers remain compatible through `repairMermaidSyntax`.
- Added conversion regressions and a real-browser Markmap output check.

## 0.1.0

- `fixMermaid`: rule-based repair for flowchart, sequence, class, state, ER, pie, xychart (bar/line) and mindmap diagrams.
- `safeRepairMermaid`: validate → repair → re-validate; valid input is never modified.
- Semantic check for mindmap text that parses but loses characters (e.g. `数学(微积分)`).
- `mermaid-render.js`: browser render helper with caching, serialized rendering, fallback UI, reporting and streaming support.
- No regex lookbehind — runs on iOS/Safari 13.4+.
- 24 regression cases, validated in Node (jsdom) and headless Chromium with screenshots.
