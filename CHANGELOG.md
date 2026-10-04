# Changelog

## [0.5.1] - 2026-10-04

### Added

- Contextual **MD preview** checkbox for Markdown (`.md`) files.
- Rendered Markdown preview for headings, emphasis, lists, links, blockquotes, fenced code blocks, inline code, horizontal rules, and images.
- Per-tab/session persistence for Markdown preview state.

### Safety

- Raw HTML is escaped instead of executed inside the preview.
- Link/image targets are restricted to safe preview schemes; unsafe targets such as `javascript:` are not emitted as active links.

### Compatibility

- Normal Markdown source editing remains the default.
- Toggling preview off returns to the same underlying Markdown source without rewriting it.
- The MD preview control is shown only for `.md` files.
- Existing text/code, CSV, binary/Hex Editor, Find/Replace, recovery, tab, and Explorer-drop workflows remain available.
- RemoteHand Plugin API remains **v1**.

### Verification

- CSV model tests: **6 passed, 0 failed**.
- Markdown renderer tests: **3 passed, 0 failed**.
- Rust tests: **13 passed, 0 failed**.
- CodeMirror production UI bundle built successfully.
- Windows plugin package built successfully.
- Manual RemoteHand acceptance confirmed Markdown source editing, MD preview rendering, preview/source round-trip behavior, and Markdown-only contextual control visibility.

## [0.5.0] - 2026-10-03

### Added

- Editable structured **CSV view** for `.csv` files, with the existing raw-text view remaining available at any time.
- CSV parsing and serialization for quoted commas, escaped quotes, quoted multiline fields, and LF/CRLF output.
- Grid navigation with arrow keys, Tab / Shift+Tab, Enter, F2, and double-click editing.
- Enter-to-commit data-entry flow that advances directly into the next cell and automatically appends a new row after the final cell.
- Resizable CSV columns with widths persisted in the Editor session.
- Right-click row actions for insert above, insert below, and delete.
- Right-click column actions for insert left, insert right, rename, and delete.
- Rectangular multi-cell selection with Shift+Arrow, Shift+click, and mouse drag.
- Copy, Cut, Paste, Clear contents, and Edit context actions for CSV cells and selections.
- Tab/newline clipboard interoperability for pasting rectangular data to and from spreadsheet applications.
- Automatic row/column growth when pasted data extends beyond the current CSV grid.
- CSV status details for active row/column, total dimensions, and selected-range dimensions/cell count.

### Improved

- CSV cells now use distinct navigation and edit modes instead of always-active textareas.
- Sticky CSV row numbers and column headers keep the active cell visible during horizontal and vertical navigation.
- Escape collapses a multi-cell selection back to the active cell without changing data.
- CSV table chrome was simplified by moving dimension/position information into the normal Editor status bar.

### Fixed

- Prevented the active first-column CSV cell from sliding underneath the sticky row-number column.
- Prevented cells near the top of a scrolled CSV from sliding underneath the sticky column-header row.
- Corrected the runtime plugin version so it matches the v0.5.0 manifest.

### Compatibility

- RemoteHand Plugin API remains **v1**.
- Existing text/code, Find/Replace, recovery, tab, Explorer-drop, binary preview, and Hex Editor workflows remain available.
- Existing session data remains compatible; CSV view state and column widths are stored as additive session fields.
- CSV v0.5.0 is comma-delimited and intentionally remains a lightweight table editor rather than a spreadsheet engine.

### Verification

- CSV model tests: **6 passed, 0 failed**.
- Rust tests: **13 passed, 0 failed** after the runtime-version correction.
- CodeMirror production UI bundle built successfully.
- Optimized Windows backend/package build completed successfully during development acceptance.
- Manual RemoteHand acceptance covered CSV raw/table round-trips, save-close-reopen persistence, quoted commas and escaped quotes, row/column editing, keyboard navigation, Enter auto-row creation, right-click structural actions, rectangular keyboard/mouse selection, clipboard copy/cut/paste, range status, and sticky-header/row visibility.

## [0.4.1] - 2026-10-03

### Changed

- Refreshed the RemoteHand sidebar icon with a cleaner editor/text-lines mark that reads more clearly at compact sidebar sizes.

### Compatibility

- RemoteHand Plugin API remains **v1**.
- Editor behavior, file formats, session data, and CodeMirror integration are unchanged.

### Verification

- Manual RemoteHand acceptance confirmed the updated sidebar icon renders cleanly in the normal application sidebar.

## [0.4.0] - 2026-10-02

### Changed

- Replaced the hand-built textarea/syntax-overlay editing engine with CodeMirror 6.
- Split the UI into a small HTML shell, dedicated Editor CSS, and bundled JavaScript source.
- Text files are accepted based on UTF-8 content rather than a fixed extension whitelist.
- Language names, parsing, syntax highlighting, and available completion data now come from CodeMirror language support.

### Added

- Persistent **Wrap text** and **Line numbers** controls.
- Contextual **Autocomplete** control for languages that provide completion data.
- UTF-8 BOM detection and preservation without showing the BOM as an editable character.
- PHP and broader CodeMirror language support.
- Binary-file detection with an explicit read-only preview prompt.
- Binary hex/ASCII preview with a dedicated **Hex editor** toggle.
- Controlled hexadecimal nibble editing and printable ASCII-side editing with synchronized byte updates.
- Hex/ASCII Tab switching, constrained byte-grid navigation, and binary byte-offset/nibble status.
- Binary Find across visual row boundaries with mirrored Hex/ASCII match highlighting.
- Binary Replace / Replace All with synchronized byte updates.
- Binary Save and Save As support.

### Fixed

- Normal Editor shortcuts now continue to work while CodeMirror has focus.
- Line-number gutter alignment.
- Caret visibility and selection behavior formerly handled by custom overlays.
- Horizontal/vertical editing behavior at long lines and blank lines.
- Binary caret escape into offsets, separators, or trailing blank document space.
- Binary Find Next/Previous progression.
- ASCII editing continuation across 16-byte visual rows.

### Safety

- General file-size limit remains 8 MiB.
- Editable Hex mode is limited to 512 KiB.
- Read-only binary preview is capped at 128 KiB of displayed bytes.
- Binary files open read-only by default and require explicitly enabling Hex Editor mode before editing.
- Binary replacement currently requires equal-length printable ASCII text.

### Verification

- Manual Windows acceptance covered CodeMirror text editing, session restoration, line-number alignment, wrapping, syntax colors, PHP opening, UTF-8 BOM handling, binary preview, Hex/ASCII editing, binary Find/Replace, Hex navigation, and contextual status behavior.
- Rust tests cover runtime/manifest version consistency, text/BOM handling, binary detection and preview, binary hex parsing/writing, session validation, and normal text writes.
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
