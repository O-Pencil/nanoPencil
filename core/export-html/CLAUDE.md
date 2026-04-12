# core/export-html/

> P2 | Parent: ../CLAUDE.md

Member List
tool-renderer.ts: ToolHtmlRendererDeps interface, ToolHtmlRenderer interface, renderToolToHtml(), renders tool calls and results to HTML, consumes ansi-to-html for output formatting
ansi-to-html.ts: ansiToHtml(), ansiLinesToHtml(), AnsiToHtmlOptions, ANSI to HTML conversion, standard ANSI color palette (0-15), no external dependencies
index.ts: ToolHtmlRenderer interface, exportSessionToHtml(), HTML export functionality, generates self-contained HTML from session entries, key invariant: produces complete standalone HTML document

Rule: Members complete, one item per line, parent links valid, precise terms first

[COVENANT]: Update this file header on changes and verify against parent CLAUDE.md