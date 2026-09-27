# RemoteHand Editor

RemoteHand Editor is a lightweight programmer-focused text and code editor for RemoteHand.

Version **0.1.0** establishes the first usable Editor baseline: real local files, recovery-safe scratch documents, tabbed editing, syntax highlighting, search, keyboard editing shortcuts, and RemoteHand-native appearance integration without trying to become a full IDE.

## Requirements

RemoteHand Editor v0.1.0 requires the RemoteHand Plugin API v1 host capabilities used by the Editor release:

- plugin-scoped storage
- host-owned native file open/save dialogs
- RemoteHand appearance data for UI and terminal fonts/colors

The intended minimum RemoteHand baseline for the v0.1.0 release is **v1.2.17**.

## v0.1.0 features

### Documents and files

- create multiple untitled scratch documents
- open real local UTF-8 text/code files
- Save and Save As
- 8 MiB per-file safety limit
- reject binary-looking files
- preserve LF/CRLF status
- remember open documents between RemoteHand sessions

Named files are **not silently autosaved to disk** in v0.1.0. Explicit Save writes the real file. While editing, Editor maintains a full recovery snapshot so unsaved work can survive RemoteHand being closed.

### Recovery

- untitled buffers survive a full RemoteHand restart
- unsaved edits to named files survive a full RemoteHand restart
- recovered named files are clearly marked as not yet written to disk
- recovered changes can be saved to disk or discarded in favor of the disk copy
- closing RemoteHand or the Editor panel does not trigger a chain of save prompts
- explicitly closing an unsaved tab uses Save / Save As, Discard, or Cancel as appropriate

Recovery currently stores full document contents rather than incremental patches.

### Tabs

- multiple document tabs
- drag-and-drop tab reordering
- persisted tab order
- active tab is automatically kept visible
- compact previous/next controls when the tab strip overflows
- `Ctrl+Tab` — next tab
- `Ctrl+Shift+Tab` — previous tab
- `Ctrl+W` — close current tab

Tab navigation wraps from the last tab to the first and vice versa.

### Editing

- line-number gutter
- current line and column status
- `Tab` inserts four spaces
- `Shift+Tab` outdents
- multi-line indent/outdent
- Enter preserves the current line's leading indentation
- standard textarea undo/redo and selection behavior

### Find

- `Ctrl+F` opens Find
- Enter selects the next match
- `Shift+Enter` selects the previous match
- Previous / Next buttons
- current-match counter such as `2 of 7`
- active match is visibly highlighted
- off-screen matches are brought into view
- Esc, close button, or clicking outside dismisses Find

### Syntax highlighting

v0.1.0 includes lightweight syntax highlighting for common programmer file types, including:

- JavaScript / TypeScript
- Python
- Rust
- C / C++ / C#
- Java
- Go
- PowerShell / shell
- JSON
- Markdown
- HTML / XML
- CSS
- YAML / TOML / INI

Language mode is inferred from the filename extension. Plain text remains unhighlighted.

The v0.1.0 highlighter is intentionally lightweight; it is not a full parser or language server.

### RemoteHand appearance integration

Editor follows RemoteHand rather than maintaining a separate application theme:

- toolbar, tabs, buttons, and status surfaces use RemoteHand UI appearance
- code and line numbers use the user's RemoteHand terminal font family and size
- the editing canvas uses the user's RemoteHand terminal background and foreground
- syntax colors derive from RemoteHand appearance variables with safe fallbacks

Changes to RemoteHand appearance are delivered through the generic plugin appearance bridge.

## Supported file behavior

Editor v0.1.0 is designed for UTF-8 text/code files. Common extensions include:

`.txt`, `.md`, `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.xml`, `.html`, `.htm`, `.css`, `.js`, `.jsx`, `.ts`, `.tsx`, `.py`, `.rs`, `.go`, `.c`, `.h`, `.cpp`, `.hpp`, `.cs`, `.java`, `.sh`, `.ps1`, and `.log`.

## Architecture

RemoteHand core owns generic infrastructure:

- Plugin API v1 runtime
- plugin-scoped storage
- host-owned native file dialogs
- plugin appearance propagation
- panels, navigation, and contribution plumbing

RemoteHand Editor owns:

- document/session semantics
- recovery behavior
- named-file editing
- syntax and language presentation
- Find behavior
- tab management
- programmer-oriented editing interactions

Editor-specific behavior should remain in the plugin. Core changes should remain generic and justified by reusable plugin needs.

## Build on Windows

Requirements:

- Rust toolchain compatible with Rust 1.85 or later
- PowerShell

Run:

```powershell
cargo test
powershell -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1
```

The build script creates:

```text
dist\remotehand-editor-windows-x86_64\
dist\remotehand-editor-v0.1.0-windows-x86_64.zip
dist\SHA256SUMS.txt
```

The installable directory contains the plugin manifest, UI, sidebar asset, and Windows x86_64 runtime executable.

## Current limitations

The first release deliberately keeps scope small:

- UTF-8 only
- no external-file-change/conflict detection yet
- no Replace / Replace All yet
- no go-to-line UI yet
- no word-wrap control yet
- no bracket matching or code folding
- no LSP, debugger, build system, project indexing, Git client, or embedded terminal
- recovery snapshots store full document contents
- syntax highlighting is lexical/lightweight rather than parser-based

## Future directions

Possible later additions include Replace / Replace All, go to line, configurable indentation, word wrap, visible whitespace, bracket matching, recently closed tabs, split views, Markdown preview, JSON formatting, compare/diff, and richer syntax support.

## License

MIT.
