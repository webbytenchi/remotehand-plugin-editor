# Changelog

## [0.3.1] - 2026-09-29

### Improved

- Recovery of unsaved edits is now silent; the persistent recovery banner and its duplicate Save/Discard controls were removed while normal unsaved-close protection remains intact.

### Verification

- Automated tests pass with the runtime version matching the plugin manifest.
- Manual Windows acceptance confirmed recovered edits are restored without the banner and closing unsaved content still prompts with the normal Save / Save As / Discard flow.

## [0.3.0] - 2026-09-29

### Added

- F5 inserts a timestamp at the current editing position.
- Windows Explorer files can be dropped on the tab strip to open the real native file through RemoteHand.
- Explorer files dropped inside the Editor body insert their full native paths at the current caret/selection, with multiple paths inserted one per line.

### Improved

- Caret tracking follows typing beyond the visible viewport.
- Trailing-newline visual alignment is corrected.
- Internal tab ordering remains draggable and persists across reloads.
- Untouched `Untitled` tabs close without a save prompt while modified untitled tabs still prompt normally.

### Fixed

- Native-file body drops now use the existing caret/selection rather than the mouse drop point.
- Dirty state is derived from current content versus saved content, so undoing exactly back to the saved state clears Modified and redo restores it.
- Recovery content that returns exactly to the disk state naturally clears the recovery/dirty condition.

### Verification

- Manual Windows acceptance passed for F5 timestamps, native Explorer tab/body drops, save-back to original files, recovery and save-after-recovery, File Manager integration, caret behavior, tab ordering, untitled-close behavior, and clean/dirty undo-redo transitions.

All notable changes to RemoteHand Editor are documented here.

## [0.2.1] - 2026-09-28

### Fixed

- corrected the executable Plugin API handshake version so it matches the installed v0.2.1 manifest
- made the UTF-8-only error message version-neutral

### Verification

- added a regression test that checks the runtime plugin version matches `plugin.json`

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
