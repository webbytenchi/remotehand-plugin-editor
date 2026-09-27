# Changelog

All notable changes to RemoteHand Editor are documented here.

## [0.2.0] - 2026-09-28

### Added

- Find/Replace mode with Replace, Replace All, next/previous match navigation, and keyboard shortcuts
- document-focused custom undo/redo history so replacement edits and subsequent typing undo in the expected document order
- quick creation of a new untitled tab from the tab strip
- generic RemoteHand panel-context support for opening a file path supplied by another plugin
- startup queuing for incoming file-open context until Editor session restoration completes
- existing-tab reuse when an incoming file path is already open

### Integration

- RemoteHand File Manager v0.2.0 can open supported text/code files directly in Editor through RemoteHand's generic plugin-panel host API.
- File Manager integration requires RemoteHand v1.2.20 or later.

### Verification

- Manual Windows acceptance confirmed Replace All plus subsequent typing undo in document order.
- Manual Windows acceptance confirmed File Manager opens supported text files in Editor and reuses an existing tab for the same path.

## [0.1.0] - 2026-09-27

Initial usable RemoteHand Editor release.

### Added

- tabbed text/code editing with line numbers and line/column status
- real local UTF-8 file Open, Save, and Save As
- host-owned native file dialogs that remain correctly associated with RemoteHand
- recovery-safe untitled documents and unsaved named-file snapshots
- restored document session, active tab, cursor position, and tab order
- recovered-file Save and Discard flows
- drag-and-drop tab reordering with persistence
- overflow tab navigation and automatic reveal of the active tab
- `Ctrl+Tab`, `Ctrl+Shift+Tab`, and `Ctrl+W` tab shortcuts
- four-space Tab indentation, Shift+Tab outdent, multi-line indent/outdent, and Enter auto-indent
- Find with next/previous navigation, match count, active-match highlighting, and automatic reveal
- lightweight syntax highlighting for common programming and configuration formats
- language, UTF-8 encoding, and LF/CRLF status indicators
- RemoteHand UI theme integration
- RemoteHand terminal font family, font size, foreground, and background integration for the code surface
- Windows x86_64 build/package script with SHA-256 output

### Safety and limits

- files are limited to 8 MiB
- binary-looking files are rejected
- recovery sessions are limited to 12 MiB
- named files require explicit Save to update the real file
- v0.1.0 recovery stores full document snapshots
