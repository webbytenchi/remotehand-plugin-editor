# RemoteHand Editor

Status: **v0.1.0 foundation in development**

RemoteHand Editor is intended to be a lightweight, programmer-focused text and code editor integrated into RemoteHand.

The design direction is inspired by the speed, practicality, and familiar workflow of Notepad++, while deliberately avoiding the scope of a full IDE.

Implementation has started on a temporary v0.1.0 foundation branch. The first slice focuses on document/session recovery, real-file open/save, tabs, line numbers, status information, and find before adding a dedicated syntax-highlighting engine.

## Product identity

RemoteHand Editor should feel like a fast programmer's editor and scratchpad rather than a consumer note-taking application.

Primary characteristics:

- tabbed documents
- line numbers
- monospace editing
- syntax highlighting
- find / replace
- current line and column display
- encoding and line-ending indicators
- unsaved/change state where useful
- multiple open documents
- fast startup and low friction
- support for both internal scratch documents and real text/code files

It should not initially attempt to provide IDE features such as debugging, language servers, project builds, or integrated development tooling.

## Core document model

The editor should support two broad document types.

### Internal / untitled documents

Untitled documents are recovery-safe internal buffers stored by the plugin.

They should:

- autosave continuously or with a short debounce
- survive RemoteHand being fully closed
- survive the Editor panel/plugin being closed
- reopen automatically when RemoteHand and Editor are opened again
- preserve their contents without requiring the user to manually save
- remain internal until the user explicitly saves them as a real file

Closing RemoteHand itself must **not** trigger a save prompt for these documents.

Closing the Editor panel/plugin must **not** trigger a save prompt either.

If the user explicitly closes an untitled document tab and that document has never been given a filename/location, the Editor should ask whether the user wants to save it as a real file before discarding it.

### Named / real files

Files opened from disk or explicitly saved by the user should be remembered by the Editor and restored as part of the previous session when practical.

The Editor should remember enough session state to reopen the user's previous working set after RemoteHand restarts.

The preferred direction is to make named files low-friction as well:

- maintain an internal recovery snapshot while editing
- autosave the actual file after a short idle/debounce interval
- keep the recovery snapshot until the disk write succeeds
- handle write failures gracefully
- never lose the in-memory/recovery version merely because a drive, path, or permission becomes unavailable

The exact named-file autosave policy should be validated carefully before implementation because automatically modifying real files has stronger consequences than autosaving internal notes.

## Session restoration

When RemoteHand starts again and Editor loads, the user should return to the previous editing session rather than an empty editor.

Potential session state to restore:

- open tabs
- tab order
- active tab
- untitled document contents
- paths for named files
- cursor position
- selection where practical
- scroll position where practical
- per-document language/syntax mode
- word-wrap state if document-specific

The design goal is:

> Open RemoteHand, open Editor, and continue where you left off.

Normal application shutdown should not require a sequence of save confirmations.

## Explicit close behavior

The intended interaction model is:

### Closing RemoteHand

No save prompts.

Recoverable document/session state is already persisted.

### Closing the Editor panel/plugin

No save prompts.

Session state remains available for the next time Editor is opened.

### Closing an untitled tab

If it has never been saved as a real file, prompt the user to:

- save it as a file
- discard it
- cancel closing

Exact wording and button arrangement should follow RemoteHand UI conventions.

### Closing a named-file tab

The final behavior depends on the named-file autosave policy chosen during implementation.

The desired end state is to avoid routine "Do you want to save?" dialogs wherever data can already be safely persisted.

## Autosave and recovery direction

Autosave is a first-class design requirement, not an optional convenience.

A likely model:

```text
typing
  |
  +--> short debounce
         |
         +--> update internal recovery state
         |
         +--> if named file and file-autosave is enabled:
                write real file
                retain recovery state until write succeeds
```

Important properties:

- no data loss on normal RemoteHand shutdown
- recovery after unexpected application termination where feasible
- failed disk writes must not destroy the recoverable copy
- internal recovery data should be plugin-owned
- recovery storage must not contain credentials or secrets unless the user explicitly typed such content into the document itself

Exact debounce timing should be selected during implementation and tested for responsiveness and disk-write behavior.

## Programmer-oriented editing features

Potential baseline features:

- tabs
- line numbers
- syntax highlighting
- find
- replace
- go to line
- line/column status
- configurable tab width
- spaces vs tabs behavior
- indentation helpers
- word wrap toggle
- visible whitespace toggle
- bracket matching
- common editing shortcuts
- duplicate line
- move line up/down
- file type / language detection

Potential file types include:

- `.txt`
- `.md`
- `.json`
- `.yaml` / `.yml`
- `.toml`
- `.ini`
- `.xml`
- `.html`
- `.css`
- `.js`
- `.ts`
- `.py`
- `.rs`
- `.go`
- `.c`
- `.h`
- `.cpp`
- `.cs`
- `.java`
- `.sh`
- `.ps1`
- configuration and log formats where useful

Actual syntax support should depend on the editor component chosen rather than becoming a promise to support every language.

## UI direction

The overall feel should be closer to Notepad++ than to OneNote, Notion, or a rich-text notes application.

Likely layout:

```text
+----------------------------------------------------------+
| Toolbar / actions                                        |
+----------------------------------------------------------+
| file1.rs | notes.txt | Untitled 3 | config.json          |
+----------------------------------------------------------+
|  1 | editor content...                                   |
|  2 |                                                     |
|  3 |                                                     |
|    |                                                     |
+----------------------------------------------------------+
| Ln 12, Col 8 | UTF-8 | LF | Rust                         |
+----------------------------------------------------------+
```

The interface should remain visually consistent with RemoteHand rather than copying Notepad++ styling literally.

## Real file support

Editor should support opening and saving real local text/code files, not only plugin-internal notes.

Potential actions:

- New
- Open File
- Save
- Save As
- Close
- Close Others
- Reopen recently closed document later if useful

RemoteHand's generic native file APIs should be used where they fit.

Editor-specific file semantics belong in the plugin.

## Scratch documents

Untitled documents are intentionally useful as programmer scratchpads.

Examples:

- temporary commands
- copied log fragments
- JSON snippets
- configuration fragments
- TODO notes
- code experiments
- notes tied to current work

A scratch document should not require the user to invent a filename before it becomes safe.

## RemoteHand integration ideas

Potential future integrations, only when justified by real use:

- first-class RemoteHand sidebar contribution
- recent Editor documents surfaced on a future Home panel
- create a scratch document from current connection context
- attach a generic connection reference without copying secrets
- open a selected local text file from another RemoteHand surface
- "Open terminal here" style actions for a named file's directory
- send selected text to a terminal if RemoteHand later exposes an appropriate generic host action

These should remain generic integrations. RemoteHand core should not gain editor-specific behavior.

## Storage direction

Use RemoteHand plugin-scoped storage for:

- untitled document recovery buffers
- session state
- editor preferences
- recent-file metadata where appropriate

Do not store credentials or RemoteHand secrets in editor metadata.

Real file contents remain in their actual user-selected files, with temporary/recovery copies maintained only as needed for resilience.

## Possible future features

After the editing/session foundation is stable:

- split editor view
- Markdown preview
- JSON formatting
- code folding if supported by the editor engine
- document outline for supported formats
- bookmarks
- recently closed tabs
- compare/diff view
- configurable syntax themes
- richer search across open files

These are intentionally deferred.

## Non-goals for the initial versions

Avoid turning Editor into a full IDE.

Initially out of scope:

- debugger
- language server protocol integration
- compiler/build orchestration
- package management
- project/workspace indexing
- Git client replacement
- AI coding assistant features
- embedded terminal
- database client
- rich-text/WYSIWYG document editing

The goal is a fast, reliable programmer editor inside RemoteHand.

## Architecture rule

RemoteHand core owns generic infrastructure such as:

- plugin runtime
- plugin-scoped storage
- native file open/save capabilities
- panels and navigation
- sidebar contribution plumbing
- generic context passing where available

RemoteHand Editor owns:

- document/session semantics
- autosave/recovery behavior
- file editing behavior
- syntax and language presentation
- editor UI
- find/replace
- tab management
- programmer-oriented editing features

Do not add editor-specific logic to RemoteHand core.

Do not create speculative host APIs simply to make Editor more feature-complete. Add generic host capabilities only when a concrete need demonstrates them.

## Open design questions

Before implementation starts, decide:

- editor engine/component
- exact recovery persistence format
- named-file autosave policy
- debounce timing
- external-file-change detection
- behavior when a remembered file is moved or deleted
- conflict behavior when a file changes on disk while open
- maximum practical number/size of recovery buffers
- encoding support beyond UTF-8
- CRLF/LF preservation
- binary-file rejection behavior
- session restore ordering and failure handling

## Development status

**Parked.**

The repository exists to preserve the design direction. Implementation should begin only after the first milestone is explicitly scoped.
