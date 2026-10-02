# RemoteHand Editor

RemoteHand Editor is a lightweight programmer-focused text, code, and binary editor for RemoteHand.

Version **0.4.1** keeps the CodeMirror 6 editing core and v0.4.0 file/binary workflows unchanged while refreshing the compact RemoteHand sidebar icon.

## Requirements

RemoteHand Editor uses RemoteHand Plugin API v1 host capabilities for plugin-scoped storage, host-owned native file dialogs, RemoteHand appearance data, and native Explorer file-path delivery.

The Editor's standalone file/editing capabilities require **RemoteHand v1.2.17 or later**. Cross-plugin file opening, including File Manager's **Open in Editor** action, requires **RemoteHand v1.2.20 or later**. Native Windows Explorer file drops require a RemoteHand build with the generic native file-drop bridge.

## Editor features

### CodeMirror 6 editing core

CodeMirror 6 now owns caret and selection behavior, line rendering and numbers, scrolling, wrapping, undo/redo, syntax-aware language support, and completion data. RemoteHand Editor continues to own tabs, file I/O, recovery, dirty state, drag/drop integration, status surfaces, and RemoteHand-specific UI behavior.

### Documents and files

- multiple untitled scratch documents
- open UTF-8 text files regardless of filename extension
- Save and Save As
- 8 MiB per-file safety limit
- LF/CRLF status
- UTF-8 BOM preservation without exposing the BOM as editable text
- restored open documents and unsaved recovery state across RemoteHand sessions
- Explorer drag/drop to open files on the tab strip
- Explorer drag/drop into normal text documents to insert full native paths

Named text files are **not silently autosaved to disk**. Explicit Save writes the real file.

### Binary preview and Hex Editor

When a selected file appears to be binary, Editor asks before opening it as a read-only binary preview.

- dedicated **Hex editor** toggle shown only for binary files
- controlled editing of hexadecimal nibbles
- editable printable ASCII column with mirrored hex updates
- Tab switches between matching Hex and ASCII byte positions
- Find works across visual row boundaries and highlights matching ASCII characters plus corresponding hex bytes
- Replace / Replace All synchronize both representations and currently require equal-length printable ASCII replacements
- constrained caret navigation keeps editing inside valid Hex/ASCII byte cells
- editable Hex status shows byte offset plus High nibble, Low nibble, or ASCII
- Save writes edited bytes back to the original file
- Save As works for read-only previews and edited binary content

Editable Hex mode is limited to binaries of **512 KiB or smaller**. Larger binary files can still use read-only preview, subject to the general 8 MiB file limit. Read-only preview displays at most 128 KiB and reports when truncated.

### Tabs and shortcuts

- draggable tab reordering with persisted order
- active-tab auto reveal and overflow controls
- Ctrl+Tab / Ctrl+Shift+Tab tab navigation
- Ctrl+W closes the current tab
- Ctrl+S, Ctrl+Shift+S, Ctrl+O, Ctrl+N, Ctrl+F, and Ctrl+H work while CodeMirror has focus

### Editing and display controls

- persistent **Wrap text** toggle
- persistent **Line numbers** toggle
- contextual **Autocomplete** toggle shown only when the active language provides completion data
- line/column status for normal text
- binary byte-offset/nibble status only while Hex Editor mode is enabled
- F5 timestamp insertion
- four-space Tab indentation for normal text
- dirty state derived from current versus saved content

### Find and Replace

- Ctrl+F opens Find
- Ctrl+H opens Find/Replace
- Enter / Shift+Enter move next / previous
- Replace and Replace All
- Previous / Next buttons
- match counter and visible active match
- off-screen matches are brought into view
- binary Find/Replace stays synchronized with Hex and ASCII representations

### Syntax highlighting and language support

Language support is provided through CodeMirror 6 language metadata instead of the old hand-written lexical highlighter. Editor opens text based on content rather than a fixed extension whitelist. When CodeMirror recognizes the filename/language, the matching language support and status label are loaded; unrecognized UTF-8 text remains editable as plain text.

This covers common programmer and configuration formats including JavaScript/TypeScript, Python, PHP, Rust, C/C++, C#, Java, Go, shell/PowerShell, JSON, Markdown, HTML/XML, CSS, YAML, TOML, INI, and many others exposed by CodeMirror language-data.

## Architecture

RemoteHand core owns generic plugin/runtime, storage, file-dialog, native-drop, appearance, panel, and navigation infrastructure. RemoteHand Editor owns CodeMirror integration, document/session semantics, recovery, text/binary file handling, Hex Editor behavior, language presentation, Find/Replace, tabs, and editing interactions.

The UI source is intentionally split into:

- ui/index.html — panel shell
- ui/editor.css — Editor / CodeMirror styling
- ui/editor-src.js — Editor behavior
- generated ui/editor.js — bundled CodeMirror UI output, excluded from Git

The Windows package build creates a self-contained panel HTML document because RemoteHand plugin panels are served from a virtual source where sibling relative assets are not guaranteed to resolve.

## Build on Windows

Requirements: Rust 1.85 or later, Node.js/npm, and PowerShell.

Run:

    cargo test
    powershell.exe -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1

The build creates:

    dist\remotehand-editor-windows-x86_64\
    dist\remotehand-editor-v0.4.1-windows-x86_64.zip
    dist\SHA256SUMS.txt

## Current limitations

- normal text editing currently supports UTF-8 text
- no external-file-change/conflict detection yet
- no go-to-line UI yet
- no LSP, debugger, build system, project indexing, Git client, or embedded terminal
- recovery snapshots store full document contents
- general file size limit is 8 MiB
- editable Hex mode is limited to 512 KiB
- binary preview displays at most 128 KiB
- binary ASCII replacement currently supports printable ASCII and equal-length replacements only

## Future directions

Possible later additions include go to line, configurable indentation, visible whitespace, recently closed tabs, split views, Markdown preview, JSON formatting, compare/diff, richer binary editing operations, and optional language-server integration.

## License

MIT.
