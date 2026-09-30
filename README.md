# RemoteHand Editor

RemoteHand Editor is a lightweight programmer-focused text and code editor for RemoteHand.

Version **0.3.1** builds on the v0.2.x foundation with native Windows Explorer drag/drop integration, F5 timestamp insertion, more accurate dirty-state behavior, improved caret/rendering behavior, and silent recovery of unsaved edits.

## Requirements

RemoteHand Editor uses RemoteHand Plugin API v1 host capabilities for:

- plugin-scoped storage
- host-owned native file open/save dialogs
- RemoteHand appearance data for UI and terminal fonts/colors
- native Explorer file-path delivery for drag/drop

The Editor's standalone file/editing capabilities require **RemoteHand v1.2.17 or later**.

Cross-plugin file opening, including File Manager's **Open in Editor** action, requires **RemoteHand v1.2.20 or later**.

Native Windows Explorer file drops require a RemoteHand build with the generic native file-drop bridge.

## v0.3.1 features

### Documents and files

- create multiple untitled scratch documents
- open real local UTF-8 text/code files
- Save and Save As
- 8 MiB per-file safety limit
- reject binary-looking files
- preserve LF/CRLF status
- remember open documents between RemoteHand sessions
- open Windows Explorer files by dropping them on the tab strip
- insert full native file paths at the current caret/selection by dropping Explorer files into the Editor body
- multiple dropped file paths are inserted one per line

Named files are **not silently autosaved to disk**. Explicit Save writes the real file. While editing, Editor maintains a recovery snapshot so unsaved work can survive RemoteHand being closed.

### Recovery

- untitled buffers survive a full RemoteHand restart
- unsaved edits to named files survive a full RemoteHand restart
- recovery is restored silently without a persistent recovery banner
- closing RemoteHand or the Editor panel does not trigger unnecessary save prompts
- explicitly closing unsaved content uses Save / Save As / Discard / Cancel as appropriate
- recovery content that returns exactly to the disk state naturally clears the dirty/recovery condition

Recovery currently stores full document contents rather than incremental patches.

### Tabs

- multiple document tabs
- drag-and-drop tab reordering
- persisted tab order
- active tab is automatically kept visible
- compact previous/next controls when the tab strip overflows
- untouched `Untitled` tabs close without a save prompt
- modified untitled tabs retain normal save/discard protection
- `Ctrl+Tab` — next tab
- `Ctrl+Shift+Tab` — previous tab
- `Ctrl+W` — close current tab

Tab navigation wraps from the last tab to the first and vice versa.

### Editing

- line-number gutter
- current line and column status
- caret tracking follows typing beyond the visible viewport
- corrected trailing-newline visual alignment
- dirty state is derived from current content versus saved content
- undoing exactly back to the saved state clears **Modified**
- redo restores **Modified** when content diverges again
- `F5` inserts a timestamp at the current editing position
- `Tab` inserts four spaces
- `Shift+Tab` outdents
- multi-line indent/outdent
- Enter preserves the current line's leading indentation

### Find and Replace

- `Ctrl+F` opens Find
- `Ctrl+H` opens Find/Replace
- Enter selects the next match
- `Shift+Enter` selects the previous match
- Replace and Replace All
- keyboard replacement shortcuts
- Previous / Next buttons
- current-match counter such as `2 of 7`
- active match is visibly highlighted
- off-screen matches are brought into view
- document-focused undo/redo preserves expected ordering between replacement edits and subsequent typing
- Esc, close button, or clicking outside dismisses Find/Replace

### Syntax highlighting

Editor includes lightweight syntax highlighting for common programmer file types, including:

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

The highlighter is intentionally lightweight; it is not a full parser or language server.

### Cross-plugin file opening

Editor can receive a generic panel context containing a local file path. When another plugin requests that file:

- Editor waits for session restoration before applying an incoming startup request
- an already-open path activates its existing tab
- a new supported text file opens in a normal Editor tab
- normal Editor file-size, UTF-8, and binary-content safety checks still apply

### Native Explorer drag/drop

Windows Explorer integration uses RemoteHand's generic native file-drop bridge:

- dropping files on the tab strip opens the real native files
- dropping files inside the Editor body inserts native paths at the existing caret/selection
- multiple paths are inserted one per line
- the Editor keeps ownership of file-opening and text-insertion semantics while RemoteHand supplies generic native paths

### RemoteHand appearance integration

Editor follows RemoteHand rather than maintaining a separate application theme:

- toolbar, tabs, buttons, and status surfaces use RemoteHand UI appearance
- code and line numbers use the user's RemoteHand terminal font family and size
- the editing canvas uses the user's RemoteHand terminal background and foreground
- syntax colors derive from RemoteHand appearance variables with safe fallbacks

Changes to RemoteHand appearance are delivered through the generic plugin appearance bridge.

## Supported file behavior

Editor v0.3.1 is designed for UTF-8 text/code files. Common extensions include:

`.txt`, `.md`, `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.xml`, `.html`, `.htm`, `.css`, `.js`, `.jsx`, `.ts`, `.tsx`, `.py`, `.rs`, `.go`, `.c`, `.h`, `.cpp`, `.hpp`, `.cs`, `.java`, `.sh`, `.ps1`, and `.log`.

## Architecture

RemoteHand core owns generic infrastructure:

- Plugin API v1 runtime
- plugin-scoped storage
- host-owned native file dialogs
- native file-path delivery
- plugin appearance propagation
- panels, navigation, and contribution plumbing

RemoteHand Editor owns:

- document/session semantics
- recovery behavior
- named-file editing
- native-drop open/insert behavior
- syntax and language presentation
- Find/Replace behavior
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
dist\remotehand-editor-v0.3.1-windows-x86_64.zip
dist\SHA256SUMS.txt
```

The installable directory contains the plugin manifest, UI, sidebar asset, and Windows x86_64 runtime executable.

## Current limitations

- UTF-8 only
- no external-file-change/conflict detection yet
- no go-to-line UI yet
- no word-wrap control yet
- no bracket matching or code folding
- no LSP, debugger, build system, project indexing, Git client, or embedded terminal
- recovery snapshots store full document contents
- syntax highlighting is lexical/lightweight rather than parser-based

## Future directions

Possible later additions include go to line, configurable indentation, word wrap, visible whitespace, bracket matching, recently closed tabs, split views, Markdown preview, JSON formatting, compare/diff, and richer syntax support.

## License

MIT.
