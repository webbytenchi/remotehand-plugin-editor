import "./csv-model.js";
import "./markdown-model.js";
import {EditorView, basicSetup} from "codemirror";
import {EditorState, Compartment, Prec, Annotation, Transaction, StateEffect, StateField} from "@codemirror/state";
import {keymap, Decoration} from "@codemirror/view";
import {HighlightStyle, syntaxHighlighting} from "@codemirror/language";
import {tags} from "@lezer/highlight";
import {closeCompletion} from "@codemirror/autocomplete";
import {undo, redo} from "@codemirror/commands";
import {languages} from "@codemirror/language-data";

(() => {
  const request = (method, params = null) => window.remotehand.request(method, params);

  const tabsShell = document.getElementById("tabsShell");
  const tabsHost = document.getElementById("tabs");
  const tabsPrev = document.getElementById("tabsPrev");
  const tabsNext = document.getElementById("tabsNext");
  const editorHost = document.getElementById("editorHost");
  const empty = document.getElementById("empty");
  const saveBtn = document.getElementById("saveBtn");
  const saveAsBtn = document.getElementById("saveAsBtn");
  const fileAssociationsBtn = document.getElementById("fileAssociationsBtn");
  const fileAssocSettings = document.getElementById("fileAssocSettings");
  const fileAssocCustom = document.getElementById("fileAssocCustom");
  const fileAssocError = document.getElementById("fileAssocError");
  const fileAssocCheckboxes = Array.from(fileAssocSettings.querySelectorAll("[data-extension]"));
  const hexEditControl = document.getElementById("hexEditControl");
  const hexEditToggle = document.getElementById("hexEdit");
  const csvViewControl = document.getElementById("csvViewControl");
  const csvViewToggle = document.getElementById("csvView");
  const csvHost = document.getElementById("csvHost");
  const csvTableWrap = document.getElementById("csvTableWrap");
  const mdPreviewControl = document.getElementById("mdPreviewControl");
  const mdPreviewToggle = document.getElementById("mdPreview");
  const mdPreviewHost = document.getElementById("mdPreviewHost");
  const mdPreviewContent = document.getElementById("mdPreviewContent");
  const wrapTextToggle = document.getElementById("wrapText");
  const lineNumbersToggle = document.getElementById("lineNumbers");
  const autocompleteControl = document.getElementById("autocompleteControl");
  const autocompleteToggle = document.getElementById("autocomplete");
  const position = document.getElementById("position");
  const saveState = document.getElementById("saveState");
  const encoding = document.getElementById("encoding");
  const eol = document.getElementById("eol");
  const language = document.getElementById("language");
  const findbar = document.getElementById("findbar");
  const findInput = document.getElementById("findInput");
  const findCount = document.getElementById("findCount");
  const replaceToggle = document.getElementById("replaceToggle");
  const replaceRow = document.getElementById("replaceRow");
  const replaceInput = document.getElementById("replaceInput");
  const replaceOneBtn = document.getElementById("replaceOne");
  const replaceAllBtn = document.getElementById("replaceAll");
  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalTitle = document.getElementById("modalTitle");
  const modalMessage = document.getElementById("modalMessage");
  const modalActions = document.getElementById("modalActions");

  const wrapCompartment = new Compartment();
  const languageCompartment = new Compartment();
  const binaryGuardCompartment = new Compartment();
  const hexEditAnnotation = Annotation.define();
  const setBinaryFindMarks = StateEffect.define();
  const binaryFindMark = Decoration.mark({class:"cm-binaryFindMatch"});
  const binaryFindField = StateField.define({
    create:() => Decoration.none,
    update(value, transaction) {
      let next = value.map(transaction.changes);
      for (const effect of transaction.effects) {
        if (effect.is(setBinaryFindMarks)) {
          next = Decoration.set(
            effect.value
              .filter(range => range && range.from < range.to)
              .map(range => binaryFindMark.range(range.from, range.to)),
            true
          );
        }
      }
      return next;
    },
    provide:field => EditorView.decorations.from(field)
  });

  const remotehandHighlightStyle = HighlightStyle.define([
    {tag:[tags.keyword, tags.operatorKeyword], color:"var(--remotehand-accent-text,#7fb4e8)", fontWeight:"600"},
    {tag:[tags.string, tags.special(tags.string)], color:"var(--remotehand-success-text,#a8d080)"},
    {tag:[tags.number, tags.bool, tags.null], color:"var(--remotehand-warning-text,#d5a76f)"},
    {tag:[tags.comment, tags.docComment], color:"var(--remotehand-muted-text,#718096)", fontStyle:"italic"},
    {tag:[tags.function(tags.variableName), tags.definition(tags.variableName)], color:"var(--remotehand-accent-text,#8fc1ef)"},
    {tag:[tags.typeName, tags.className], color:"var(--remotehand-warning-text,#dfbd70)"},
    {tag:tags.propertyName, color:"var(--remotehand-terminal-foreground,#c8d7e8)"},
    {tag:tags.regexp, color:"var(--remotehand-success-text,#a8d080)"},
    {tag:[tags.heading, tags.strong], color:"var(--remotehand-accent-text,#8fc1ef)", fontWeight:"700"},
    {tag:[tags.link, tags.url], color:"var(--remotehand-accent-text,#7fb4e8)", textDecoration:"underline"},
    {tag:tags.meta, color:"var(--remotehand-muted-text,#9aa8b8)"}
  ]);

  const normalizePastedText = text => String(text || "")
    .replace(/[\u00a0\u202f]/g, " ");

  let tabs = [];
  let activeId = null;
  let untitledCounter = 1;
  let wrapText = false;
  let lineNumbers = true;
  let autocompleteEnabled = true;
  let persistTimer = null;
  let persistInFlight = Promise.resolve();
  let modalResolve = null;
  let nativeDialogPending = false;
  let draggedTabId = null;
  let sessionRestored = false;
  let pendingContextPath = "";
  let suppressEditorUpdates = false;
  let languageLoadToken = 0;

  const basename = path => String(path || "").split(/[\\/]/).filter(Boolean).pop() || String(path || "");

  function padTimestampPart(value) {
    return String(value).padStart(2, "0");
  }

  function formatTimestamp(date = new Date()) {
    return date.getFullYear() + "-" +
      padTimestampPart(date.getMonth() + 1) + "-" +
      padTimestampPart(date.getDate()) + " " +
      padTimestampPart(date.getHours()) + ":" +
      padTimestampPart(date.getMinutes()) + ":" +
      padTimestampPart(date.getSeconds());
  }

  function detectEol(content) {
    return String(content || "").includes("\r\n") ? "CRLF" : "LF";
  }

  function languageInfo(name) {
    const description = matchingLanguage(name);
    return description && description.name ? description.name : "Plain Text";
  }

  function activeTab() {
    return tabs.find(tab => tab.id === activeId) || null;
  }

  function isCsvTab(tab) {
    return Boolean(tab && !tab.binary && /\.csv$/i.test(String(tab.name || "")));
  }

  function isCsvView(tab = activeTab()) {
    return Boolean(isCsvTab(tab) && tab.viewMode === "csv");
  }

  function isMarkdownTab(tab) {
    return Boolean(tab && !tab.binary && /\.md$/i.test(String(tab.name || "")));
  }

  function isMarkdownPreview(tab = activeTab()) {
    return Boolean(isMarkdownTab(tab) && tab.viewMode === "markdown-preview");
  }

  function makeId() {
    return "doc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8);
  }

  function editorText() {
    return view.state.doc.toString();
  }

  function editorCursor() {
    return view.state.selection.main.head;
  }

  function currentSelection() {
    return view.state.selection.main;
  }

  function hexByteStart(byteIndex) {
    return 10 + byteIndex * 3 + (byteIndex >= 8 ? 1 : 0);
  }

  function hexNibbleAt(state, position) {
    if (position < 0 || position > state.doc.length) return null;
    const line = state.doc.lineAt(Math.min(position, state.doc.length));
    const column = position - line.from;

    for (let byteIndex = 0; byteIndex < 16; byteIndex++) {
      const start = hexByteStart(byteIndex);
      const pair = line.text.slice(start, start + 2);
      if (!/^[0-9A-F]{2}$/i.test(pair)) continue;
      if (column === start || column === start + 1) {
        return {
          line,
          byteIndex,
          nibble:column - start,
          position:line.from + column
        };
      }
    }
    return null;
  }

  function asciiCellAt(state, position) {
    if (position < 0 || position > state.doc.length) return null;
    const line = state.doc.lineAt(Math.min(position, state.doc.length));
    const column = position - line.from;
    const byteIndex = column - 61;
    if (byteIndex < 0 || byteIndex >= 16) return null;

    const hexStart = hexByteStart(byteIndex);
    const pair = line.text.slice(hexStart, hexStart + 2);
    if (!/^[0-9A-F]{2}$/i.test(pair)) return null;

    return {
      line,
      byteIndex,
      position:line.from + column,
      hexPosition:line.from + hexStart
    };
  }

  function binaryAsciiChanges(state, from, to, replacement) {
    if (to - from !== replacement.length) {
      throw new Error("Binary replacements must keep the same byte length.");
    }
    if (!/^[\x20-\x7E]*$/.test(replacement)) {
      throw new Error("Binary ASCII editing currently supports printable ASCII characters only.");
    }

    const changes = [];
    for (let index = 0; index < replacement.length; index++) {
      const cell = asciiCellAt(state, from + index);
      if (!cell) {
        throw new Error("Binary replacement must stay inside the ASCII column.");
      }
      const code = replacement.charCodeAt(index);
      const pair = code.toString(16).toUpperCase().padStart(2, "0");
      changes.push({from:cell.hexPosition, to:cell.hexPosition + 2, insert:pair});
      changes.push({from:cell.position, to:cell.position + 1, insert:replacement[index]});
    }
    changes.sort((a,b) => a.from - b.from);
    return changes;
  }

  function nextAsciiPosition(state, position, direction) {
    let cursor = position + direction;
    while (cursor >= 0 && cursor <= state.doc.length) {
      const cell = asciiCellAt(state, cursor);
      if (cell) return cell.position;
      cursor += direction;
    }
    return position;
  }

  function nextHexNibblePosition(state, position, direction) {
    let cursor = position + direction;
    while (cursor >= 0 && cursor <= state.doc.length) {
      if (hexNibbleAt(state, cursor)) return cursor;
      cursor += direction;
    }
    return position;
  }

  function hexPayloadFromDump(content, expectedBytes) {
    const pairs = [];
    for (const line of String(content || "").split("\n")) {
      if (!/^[0-9A-Fa-f]{8}\s\s/.test(line)) continue;
      for (let byteIndex = 0; byteIndex < 16; byteIndex++) {
        const start = hexByteStart(byteIndex);
        const pair = line.slice(start, start + 2);
        if (/^[0-9A-Fa-f]{2}$/.test(pair)) pairs.push(pair.toUpperCase());
      }
    }

    if (Number.isFinite(Number(expectedBytes)) && pairs.length !== Number(expectedBytes)) {
      throw new Error(
        "Hex editor byte count changed unexpectedly (" + pairs.length +
        " bytes, expected " + Number(expectedBytes) + ")."
      );
    }
    return pairs.join("");
  }

  function binaryEdgePosition(state, side, toEnd, nibble = 0) {
    const bytes = binaryByteMap(state);
    if (bytes.length === 0) return 0;
    const byte = toEnd ? bytes[bytes.length - 1] : bytes[0];
    return side === "ascii"
      ? byte.asciiPosition
      : byte.hexPosition + Math.min(1, Math.max(0, nibble));
  }

  function verticalBinaryPosition(state, cell, direction, side) {
    const targetLineNumber = cell.line.number + direction;
    if (targetLineNumber < 1 || targetLineNumber > state.doc.lines) return cell.position;

    const targetLine = state.doc.line(targetLineNumber);
    const hexStart = hexByteStart(cell.byteIndex);
    const pair = targetLine.text.slice(hexStart, hexStart + 2);
    if (!/^[0-9A-F]{2}$/i.test(pair)) return cell.position;

    return side === "ascii"
      ? targetLine.from + 61 + cell.byteIndex
      : targetLine.from + hexStart + (cell.nibble || 0);
  }

  function lineEdgeBinaryPosition(cell, side, toEnd) {
    const order = toEnd
      ? Array.from({length:16}, (_,index) => 15 - index)
      : Array.from({length:16}, (_,index) => index);

    for (const byteIndex of order) {
      const hexStart = hexByteStart(byteIndex);
      const pair = cell.line.text.slice(hexStart, hexStart + 2);
      if (!/^[0-9A-F]{2}$/i.test(pair)) continue;
      if (side === "ascii") return cell.line.from + 61 + byteIndex;
      return cell.line.from + hexStart + (toEnd ? 1 : 0);
    }
    return cell.position;
  }

  function binaryGuardFor(tab) {
    if (!tab.hexEditable) return [];
    return EditorState.transactionFilter.of(transaction => {
      if (!transaction.docChanged) return transaction;
      if (transaction.annotation(hexEditAnnotation)) return transaction;
      const userEvent = transaction.annotation(Transaction.userEvent) || "";
      if (userEvent.startsWith("undo") || userEvent.startsWith("redo")) return transaction;
      return [];
    });
  }

  function handleHexEditorKeydown(event) {
    const tab = activeTab();
    if (!tab || !tab.binary || !tab.hexEditable) return;

    const selection = currentSelection();
    if (!selection.empty) return;

    const asciiCell = asciiCellAt(view.state, selection.head);
    const hexCell = hexNibbleAt(view.state, selection.head);
    const side = asciiCell ? "ascii" : (hexCell ? "hex" : null);
    const mod = event.ctrlKey || event.metaKey;

    if (side && mod && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      const target = binaryEdgePosition(
        view.state,
        side,
        event.key === "End",
        hexCell ? hexCell.nibble : 0
      );
      view.dispatch({selection:{anchor:target}, scrollIntoView:true});
      return;
    }

    if (side && mod && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const target = binaryEdgePosition(
        view.state,
        side,
        event.key === "ArrowDown",
        hexCell ? hexCell.nibble : 0
      );
      view.dispatch({selection:{anchor:target}, scrollIntoView:true});
      return;
    }

    if (side && mod && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      const toEnd = event.key === "ArrowRight";
      const target = lineEdgeBinaryPosition(
        asciiCell || hexCell,
        side,
        toEnd
      );
      view.dispatch({selection:{anchor:target}, scrollIntoView:true});
      return;
    }

    if (event.altKey || mod) return;

    if (event.key === "Tab") {
      if (hexCell) {
        event.preventDefault();
        const target = hexCell.line.from + 61 + hexCell.byteIndex;
        view.dispatch({selection:{anchor:target}, scrollIntoView:true});
        return;
      }
      if (asciiCell) {
        event.preventDefault();
        const target = asciiCell.hexPosition;
        view.dispatch({selection:{anchor:target}, scrollIntoView:true});
        return;
      }
    }

    if (asciiCell && event.key.length === 1 && /^[\x20-\x7E]$/.test(event.key)) {
      event.preventDefault();
      const code = event.key.charCodeAt(0);
      const pair = code.toString(16).toUpperCase().padStart(2, "0");
      const nextPosition = nextAsciiPosition(view.state, asciiCell.position, 1);

      view.dispatch({
        changes:[
          {from:asciiCell.hexPosition, to:asciiCell.hexPosition + 2, insert:pair},
          {from:asciiCell.position, to:asciiCell.position + 1, insert:event.key}
        ],
        selection:{anchor:nextPosition},
        annotations:hexEditAnnotation.of(true),
        scrollIntoView:true
      });
      return;
    }

    if (/^[0-9a-fA-F]$/.test(event.key)) {
      const cell = hexNibbleAt(view.state, selection.head);
      if (!cell) return;

      event.preventDefault();
      const key = event.key.toUpperCase();
      const pairStart = cell.line.from + hexByteStart(cell.byteIndex);
      const oldPair = view.state.doc.sliceString(pairStart, pairStart + 2);
      const nextPair = cell.nibble === 0 ? key + oldPair[1] : oldPair[0] + key;
      const byteValue = Number.parseInt(nextPair, 16);
      const asciiPosition = cell.line.from + 61 + cell.byteIndex;
      const asciiChar = byteValue >= 0x20 && byteValue <= 0x7e
        ? String.fromCharCode(byteValue)
        : ".";
      const nextPosition = nextHexNibblePosition(view.state, cell.position, 1);

      view.dispatch({
        changes:[
          {from:cell.position, to:cell.position + 1, insert:key},
          {from:asciiPosition, to:asciiPosition + 1, insert:asciiChar}
        ],
        selection:{anchor:nextPosition},
        annotations:hexEditAnnotation.of(true),
        scrollIntoView:true
      });
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const direction = event.key === "ArrowRight" ? 1 : -1;

      if (asciiCell) {
        event.preventDefault();
        const target = nextAsciiPosition(view.state, selection.head, direction);
        if (target !== selection.head) {
          view.dispatch({selection:{anchor:target}, scrollIntoView:true});
        }
        return;
      }

      if (hexCell) {
        event.preventDefault();
        const target = nextHexNibblePosition(view.state, selection.head, direction);
        if (target !== selection.head) {
          view.dispatch({selection:{anchor:target}, scrollIntoView:true});
        }
        return;
      }
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (asciiCell || hexCell) {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const target = verticalBinaryPosition(
          view.state,
          asciiCell || hexCell,
          direction,
          asciiCell ? "ascii" : "hex"
        );
        if (target !== selection.head) {
          view.dispatch({selection:{anchor:target}, scrollIntoView:true});
        }
        return;
      }
    }
  }

  function customKeymap() {
    return Prec.highest(keymap.of([
      {
        key:"Ctrl-n",
        run:() => { newDocument(); return true; }
      },
      {
        key:"Ctrl-o",
        run:() => { void openFile(); return true; }
      },
      {
        key:"Ctrl-s",
        run:() => { void saveTab(); return true; }
      },
      {
        key:"Ctrl-Shift-s",
        run:() => { void saveAsTab(); return true; }
      },
      {
        key:"Ctrl-w",
        run:() => { void closeTab(activeId); return true; }
      },
      {
        key:"Ctrl-Tab",
        run:() => { switchTab(1); return true; }
      },
      {
        key:"Ctrl-Shift-Tab",
        run:() => { switchTab(-1); return true; }
      },
      {
        key:"Ctrl-f",
        run:() => { openFind(false); return true; }
      },
      {
        key:"Ctrl-h",
        run:() => { openFind(true); return true; }
      },
      {
        key:"F5",
        run:() => {
          replaceSelection(formatTimestamp());
          return true;
        }
      },
      {
        key:"Tab",
        run:() => {
          const selection = currentSelection();
          if (!selection.empty) return false;
          replaceSelection("    ");
          return true;
        }
      }
    ]));
  }

  function createEditorState(tab) {
    const cursor = Math.max(0, Math.min(Number(tab.cursor) || 0, tab.content.length));
    return EditorState.create({
      doc: tab.content,
      selection:{anchor:cursor},
      extensions:[
        basicSetup,
        syntaxHighlighting(remotehandHighlightStyle),
        EditorView.clipboardInputFilter.of(normalizePastedText),
        wrapCompartment.of(wrapText ? EditorView.lineWrapping : []),
        languageCompartment.of([]),
        binaryFindField,
        binaryGuardCompartment.of(binaryGuardFor(tab)),
        EditorState.readOnly.of(Boolean(tab.readOnly)),
        EditorView.editable.of(!tab.readOnly),
        customKeymap(),
        EditorView.updateListener.of(update => {
          if (suppressEditorUpdates) return;
          if (!update.docChanged && !update.selectionSet) return;
          handleEditorUpdate(update);
        })
      ]
    });
  }

  const view = new EditorView({
    state:EditorState.create({
      doc:"",
      extensions:[
        basicSetup,
        syntaxHighlighting(remotehandHighlightStyle),
        EditorView.clipboardInputFilter.of(normalizePastedText),
        wrapCompartment.of([]),
        languageCompartment.of([]),
        binaryFindField,
        customKeymap()
      ]
    }),
    parent:editorHost
  });

  function handleEditorUpdate(update) {
    const tab = activeTab();
    if (!tab) return;

    tab.cmState = update.state;
    tab.cursor = update.state.selection.main.head;

    if (update.docChanged) {
      tab.content = update.state.doc.toString();
      tab.dirty = tab.content !== (typeof tab.savedContent === "string" ? tab.savedContent : "");
      if (!tab.dirty) tab.recovered = false;
      if (!tab.binary) tab.eol = detectEol(tab.content);
      renderTabs();
      updateSaveState();
      eol.textContent = tab.binary ? "—" : tab.eol;
    }

    updatePosition();
    if (!findbar.hidden) updateFindCount();
    if (!autocompleteEnabled) {
      requestAnimationFrame(() => closeCompletion(view));
    }
    schedulePersist();
  }

  function replaceSelection(text) {
    const selection = currentSelection();
    view.dispatch({
      changes:{from:selection.from, to:selection.to, insert:text},
      selection:{anchor:selection.from + text.length},
      scrollIntoView:true
    });
    view.focus();
  }

  function applyWrapTextState() {
    wrapTextToggle.checked = wrapText;
    view.dispatch({
      effects:wrapCompartment.reconfigure(wrapText ? EditorView.lineWrapping : [])
    });
    const tab = activeTab();
    if (tab) tab.cmState = view.state;
  }

  function applyLineNumbersState() {
    lineNumbersToggle.checked = lineNumbers;
    editorHost.classList.toggle("hide-line-numbers", !lineNumbers);
  }

  function updateContextualControls() {
    const tab = activeTab();
    const binary = Boolean(tab && tab.binary);
    const csvEligible = isCsvTab(tab);
    const csvMode = isCsvView(tab);
    const markdownEligible = isMarkdownTab(tab);
    const markdownMode = isMarkdownPreview(tab);
    hexEditControl.hidden = !binary;
    hexEditToggle.checked = Boolean(tab && tab.hexEditable);
    csvViewControl.hidden = !csvEligible;
    csvViewToggle.checked = csvMode;
    mdPreviewControl.hidden = !markdownEligible;
    mdPreviewToggle.checked = markdownMode;

    const hasAutocomplete = Boolean(tab && !binary && !csvMode && !markdownMode && tab.hasAutocomplete);
    autocompleteControl.hidden = !hasAutocomplete;
    autocompleteToggle.checked = autocompleteEnabled;

    wrapTextToggle.disabled = binary || csvMode || markdownMode;
    lineNumbersToggle.disabled = csvMode || markdownMode;
    saveBtn.disabled = Boolean(binary && !tab.hexEditable);
    saveAsBtn.disabled = false;
  }

  function matchingLanguage(name) {
    const lower = String(name || "").toLowerCase();
    const ext = (lower.match(/\.([^.]+)$/) || [,""])[1];

    return languages.find(description => {
      if (Array.isArray(description.extensions) && description.extensions.some(value => value.toLowerCase() === ext)) {
        return true;
      }
      if (description.filename instanceof RegExp) {
        description.filename.lastIndex = 0;
        return description.filename.test(lower);
      }
      return false;
    }) || null;
  }

  async function applyLanguageForActiveTab() {
    const tab = activeTab();
    if (!tab) return;

    const token = ++languageLoadToken;
    view.dispatch({effects:languageCompartment.reconfigure([])});
    tab.cmState = view.state;
    tab.hasAutocomplete = false;
    updateContextualControls();

    const description = matchingLanguage(tab.name);
    if (!description || typeof description.load !== "function") return;

    try {
      const support = await description.load();
      if (token !== languageLoadToken || activeId !== tab.id) return;
      view.dispatch({effects:languageCompartment.reconfigure(support)});
      tab.cmState = view.state;
      tab.hasAutocomplete = view.state.languageDataAt("autocomplete", 0).length > 0;
      updateContextualControls();
      if (!autocompleteEnabled) closeCompletion(view);
    } catch (error) {
      console.warn("Editor language mode failed to load:", tab.name, error);
    }
  }


  function csvRowsFor(tab = activeTab()) {
    if (!isCsvTab(tab)) return null;
    return window.RemoteHandCsv.normalize(window.RemoteHandCsv.parse(tab.content));
  }

  function updateCsvDocument(rows) {
    const tab = activeTab();
    if (!isCsvView(tab)) return;
    const content = window.RemoteHandCsv.stringify(rows, tab.eol || detectEol(tab.content));
    if (content === view.state.doc.toString()) return;
    view.dispatch({
      changes:{from:0, to:view.state.doc.length, insert:content},
      selection:{anchor:Math.min(view.state.selection.main.head, content.length)}
    });
    tab.cmState = view.state;
  }

  const csvContextMenu = document.createElement("div");
  csvContextMenu.className = "csv-context-menu";
  csvContextMenu.hidden = true;
  document.body.appendChild(csvContextMenu);

  function closeCsvContextMenu() {
    csvContextMenu.hidden = true;
    csvContextMenu.replaceChildren();
  }

  function showCsvContextMenu(x, y, items) {
    csvContextMenu.replaceChildren();
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "csv-context-item" + (item.danger ? " danger" : "");
      const label = document.createElement("span");
      label.textContent = item.label;
      button.appendChild(label);
      if (item.shortcut) {
        const shortcut = document.createElement("span");
        shortcut.className = "csv-context-shortcut";
        shortcut.textContent = item.shortcut;
        button.appendChild(shortcut);
      }
      button.disabled = Boolean(item.disabled);
      button.addEventListener("click", () => {
        closeCsvContextMenu();
        if (!item.disabled && typeof item.run === "function") item.run();
      });
      csvContextMenu.appendChild(button);
    }

    csvContextMenu.hidden = false;
    csvContextMenu.style.left = Math.max(6, x) + "px";
    csvContextMenu.style.top = Math.max(6, y) + "px";

    requestAnimationFrame(() => {
      const rect = csvContextMenu.getBoundingClientRect();
      const left = Math.max(6, Math.min(x, window.innerWidth - rect.width - 6));
      const top = Math.max(6, Math.min(y, window.innerHeight - rect.height - 6));
      csvContextMenu.style.left = left + "px";
      csvContextMenu.style.top = top + "px";
    });
  }

  function csvCellElement(rowIndex, columnIndex) {
    return csvTableWrap.querySelector(
      '.csv-grid-cell[data-csv-row="' + rowIndex + '"][data-csv-column="' + columnIndex + '"]'
    );
  }

  function clampCsvSelection(rows, rowIndex, columnIndex) {
    const width = window.RemoteHandCsv.columnCount(rows);
    return {
      row:Math.max(0, Math.min(Number(rowIndex) || 0, rows.length - 1)),
      column:Math.max(0, Math.min(Number(columnIndex) || 0, width - 1))
    };
  }

  function csvSelectionBounds(tab = activeTab()) {
    const focus = tab && tab.csvSelection ? tab.csvSelection : {row:0, column:0};
    const anchor = tab && tab.csvSelectionAnchor ? tab.csvSelectionAnchor : focus;
    return {
      top:Math.min(anchor.row, focus.row),
      bottom:Math.max(anchor.row, focus.row),
      left:Math.min(anchor.column, focus.column),
      right:Math.max(anchor.column, focus.column)
    };
  }

  function applyCsvSelectionClasses(tab = activeTab()) {
    if (!tab) return;
    const focus = tab.csvSelection || {row:0, column:0};
    const bounds = csvSelectionBounds(tab);

    for (const cell of csvTableWrap.querySelectorAll(".csv-grid-cell")) {
      const row = Number(cell.dataset.csvRow);
      const column = Number(cell.dataset.csvColumn);
      const inRange = row >= bounds.top && row <= bounds.bottom &&
        column >= bounds.left && column <= bounds.right;
      const active = row === focus.row && column === focus.column;
      cell.classList.toggle("range-selected", inRange && !active);
      cell.classList.toggle("selected", active);
      cell.tabIndex = active ? 0 : -1;
    }
  }

  let csvMouseSelecting = false;
  let csvMouseMoved = false;

  function csvCellIsInSelection(row, column, tab = activeTab()) {
    if (!tab) return false;
    const bounds = csvSelectionBounds(tab);
    return row >= bounds.top && row <= bounds.bottom &&
      column >= bounds.left && column <= bounds.right;
  }

  async function writeClipboardText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return;
    }

    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand("copy");
    helper.remove();
    if (!copied) throw new Error("Clipboard write is unavailable.");
  }

  async function readClipboardText() {
    if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
      return navigator.clipboard.readText();
    }
    throw new Error("Clipboard paste is unavailable.");
  }

  async function copyCsvSelectionToClipboard(cut = false) {
    const tab = activeTab();
    if (!isCsvView(tab)) return;
    try {
      await writeClipboardText(csvSelectionText(csvRowsFor(tab), tab));
      if (cut) clearCsvSelectionValues();
    } catch (error) {
      void messageModal("Clipboard unavailable", String(error));
    }
  }

  async function pasteCsvSelectionFromClipboard() {
    try {
      const text = await readClipboardText();
      pasteCsvGrid(text);
    } catch (error) {
      void messageModal("Clipboard unavailable", String(error));
    }
  }

  function focusCsvCell(rowIndex, columnIndex, edit = false, extend = false) {
    const tab = activeTab();
    if (!isCsvView(tab)) return;

    let rows;
    try {
      rows = csvRowsFor(tab);
    } catch (_) {
      return;
    }

    const target = clampCsvSelection(rows, rowIndex, columnIndex);
    if (!extend || !tab.csvSelectionAnchor) {
      tab.csvSelectionAnchor = {...target};
    }
    tab.csvSelection = target;
    updatePosition();

    requestAnimationFrame(() => {
      const cell = csvCellElement(target.row, target.column);
      if (!cell) return;
      applyCsvSelectionClasses(tab);
      cell.focus({preventScroll:true});
      cell.scrollIntoView({block:"nearest", inline:"nearest"});

      const wrapRect = csvTableWrap.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();

      const stickyRowHeadWidth = 64;
      const minimumLeft = wrapRect.left + stickyRowHeadWidth;
      if (cellRect.left < minimumLeft) {
        csvTableWrap.scrollLeft = Math.max(
          0,
          csvTableWrap.scrollLeft - (minimumLeft - cellRect.left)
        );
      }

      const stickyHeader = csvTableWrap.querySelector("thead");
      const stickyHeaderHeight = stickyHeader ? stickyHeader.getBoundingClientRect().height : 36;
      const minimumTop = wrapRect.top + stickyHeaderHeight;
      if (cellRect.top < minimumTop) {
        csvTableWrap.scrollTop = Math.max(
          0,
          csvTableWrap.scrollTop - (minimumTop - cellRect.top)
        );
      }

      if (edit) beginCsvEdit(cell);
    });
  }

  function csvSelectionText(rows, tab = activeTab()) {
    const bounds = csvSelectionBounds(tab);
    const lines = [];
    for (let row = bounds.top; row <= bounds.bottom; row++) {
      const values = [];
      for (let column = bounds.left; column <= bounds.right; column++) {
        values.push((rows[row] && rows[row][column]) || "");
      }
      lines.push(values.join("\t"));
    }
    return lines.join("\r\n");
  }

  function clearCsvSelectionValues() {
    const tab = activeTab();
    if (!isCsvView(tab)) return;
    let rows = csvRowsFor(tab);
    const bounds = csvSelectionBounds(tab);
    for (let row = bounds.top; row <= bounds.bottom; row++) {
      for (let column = bounds.left; column <= bounds.right; column++) {
        rows[row][column] = "";
      }
    }
    updateCsvDocument(rows);
    renderCsvGrid({row:tab.csvSelection.row, column:tab.csvSelection.column});
  }

  function parseClipboardGrid(text) {
    const normalized = String(text == null ? "" : text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n");
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    return lines.map(line => line.split("\t"));
  }

  function pasteCsvGrid(text) {
    const tab = activeTab();
    if (!isCsvView(tab)) return;

    const block = parseClipboardGrid(text);
    if (!block.length) return;

    let rows = csvRowsFor(tab);
    const start = tab.csvSelection || {row:0, column:0};
    const blockWidth = Math.max(1, ...block.map(row => row.length));
    const neededRows = start.row + block.length;
    const neededColumns = start.column + blockWidth;

    while (rows.length < neededRows) rows = window.RemoteHandCsv.addRow(rows);
    while (window.RemoteHandCsv.columnCount(rows) < neededColumns) {
      rows = window.RemoteHandCsv.addColumn(rows);
      tab.csvColumnWidths.push(180);
    }

    for (let rowOffset = 0; rowOffset < block.length; rowOffset++) {
      for (let columnOffset = 0; columnOffset < block[rowOffset].length; columnOffset++) {
        rows[start.row + rowOffset][start.column + columnOffset] = block[rowOffset][columnOffset];
      }
    }

    updateCsvDocument(rows);
    const end = {
      row:start.row + block.length - 1,
      column:start.column + blockWidth - 1
    };
    tab.csvSelectionAnchor = {...start};
    tab.csvSelection = end;
    renderCsvGrid({row:end.row, column:end.column, preserveAnchor:true});
  }

  function beginCsvEdit(cell) {
    const tab = activeTab();
    if (!isCsvView(tab) || !cell || cell.classList.contains("editing")) return;

    const row = Number(cell.dataset.csvRow);
    const column = Number(cell.dataset.csvColumn);
    const rows = csvRowsFor(tab);
    if (!rows || !rows[row]) return;

    tab.csvSelection = {row, column};
    const original = rows[row][column] || "";
    cell.classList.add("editing");
    cell.replaceChildren();

    const input = document.createElement("textarea");
    input.className = "csv-cell-editor";
    input.rows = 1;
    input.value = original;
    input.dataset.originalValue = original;

    const finish = (mode, direction = 1) => {
      if (!cell.isConnected) return;
      if (mode === "cancel") {
        renderCsvGrid({row, column});
        return;
      }

      let nextRows = window.RemoteHandCsv.setCell(csvRowsFor(tab), row, column, input.value);

      if (mode === "advance") {
        const width = window.RemoteHandCsv.columnCount(nextRows);
        let flat = row * width + column + direction;

        if (direction > 0 && flat >= nextRows.length * width) {
          nextRows = window.RemoteHandCsv.addRow(nextRows);
          flat = (nextRows.length - 1) * width;
        }

        updateCsvDocument(nextRows);
        flat = Math.max(0, Math.min(flat, nextRows.length * width - 1));
        renderCsvGrid({
          row:Math.floor(flat / width),
          column:flat % width,
          edit:true
        });
        return;
      }

      updateCsvDocument(nextRows);
      renderCsvGrid({row, column});
    };

    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        finish("advance", event.shiftKey ? -1 : 1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish("cancel");
      } else if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        const nextRows = window.RemoteHandCsv.setCell(csvRowsFor(tab), row, column, input.value);
        updateCsvDocument(nextRows);
        const width = window.RemoteHandCsv.columnCount(nextRows);
        const flat = Math.max(
          0,
          Math.min(
            row * width + column + (event.shiftKey ? -1 : 1),
            nextRows.length * width - 1
          )
        );
        renderCsvGrid({row:Math.floor(flat / width), column:flat % width});
      }
    });

    input.addEventListener("blur", () => {
      if (!cell.isConnected || !cell.classList.contains("editing")) return;
      const next = window.RemoteHandCsv.setCell(csvRowsFor(tab), row, column, input.value);
      updateCsvDocument(next);
      renderCsvGrid({row, column});
    });

    cell.appendChild(input);
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  function handleCsvGridKeydown(event) {
    const cell = event.currentTarget;
    if (!cell || cell.classList.contains("editing")) return;

    const tab = activeTab();
    const rows = csvRowsFor(tab);
    if (!rows) return;
    const width = window.RemoteHandCsv.columnCount(rows);
    const row = Number(cell.dataset.csvRow);
    const column = Number(cell.dataset.csvColumn);

    if (event.key === "F2" || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      beginCsvEdit(cell);
      return;
    }

    if (event.key === "Escape") {
      const bounds = csvSelectionBounds(tab);
      const multi = bounds.top !== bounds.bottom || bounds.left !== bounds.right;
      if (multi) {
        event.preventDefault();
        event.stopPropagation();
        tab.csvSelectionAnchor = {row, column};
        tab.csvSelection = {row, column};
        applyCsvSelectionClasses(tab);
        updatePosition();
      }
      return;
    }

    let target = null;
    const arrow = event.key.startsWith("Arrow");
    if (event.key === "ArrowLeft") target = {row, column:column - 1};
    else if (event.key === "ArrowRight") target = {row, column:column + 1};
    else if (event.key === "ArrowUp") target = {row:row - 1, column};
    else if (event.key === "ArrowDown") target = {row:row + 1, column};
    else if (event.key === "Tab") {
      const flat = row * width + column + (event.shiftKey ? -1 : 1);
      if (flat >= 0 && flat < rows.length * width) {
        target = {row:Math.floor(flat / width), column:flat % width};
      }
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      clearCsvSelectionValues();
      return;
    }

    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const clamped = clampCsvSelection(rows, target.row, target.column);
    focusCsvCell(clamped.row, clamped.column, false, arrow && event.shiftKey);
  }

  function openCsvCellMenu(event, rowIndex, columnIndex) {
    event.preventDefault();
    event.stopPropagation();

    const tab = activeTab();
    if (!isCsvView(tab)) return;

    if (!csvCellIsInSelection(rowIndex, columnIndex, tab)) {
      focusCsvCell(rowIndex, columnIndex);
    }

    const bounds = csvSelectionBounds(tab);
    const multi = bounds.top !== bounds.bottom || bounds.left !== bounds.right;

    showCsvContextMenu(event.clientX, event.clientY, [
      {
        label:multi ? "Copy selection" : "Copy",
        shortcut:"Ctrl+C",
        run:() => void copyCsvSelectionToClipboard(false)
      },
      {
        label:multi ? "Cut selection" : "Cut",
        shortcut:"Ctrl+X",
        run:() => void copyCsvSelectionToClipboard(true)
      },
      {
        label:"Paste",
        shortcut:"Ctrl+V",
        run:() => void pasteCsvSelectionFromClipboard()
      },
      {
        label:"Clear contents",
        shortcut:"Del",
        run:() => clearCsvSelectionValues()
      },
      {
        label:"Edit",
        shortcut:"F2",
        disabled:multi,
        run:() => {
          const active = tab.csvSelection || {row:rowIndex, column:columnIndex};
          renderCsvGrid({row:active.row, column:active.column, edit:true});
        }
      }
    ]);
  }

  function makeCsvGridCell(rowIndex, columnIndex, value, header = false) {
    const cell = document.createElement("div");
    cell.className = "csv-grid-cell" + (header ? " csv-grid-header" : "");
    cell.tabIndex = -1;
    cell.textContent = value || "";
    cell.dataset.csvRow = String(rowIndex);
    cell.dataset.csvColumn = String(columnIndex);
    cell.title = header ? "Double-click or press F2 to rename" : "Double-click or press F2 to edit";

    cell.addEventListener("mousedown", event => {
      if (event.button !== 0) return;
      csvMouseSelecting = true;
      csvMouseMoved = false;
      event.preventDefault();
      focusCsvCell(rowIndex, columnIndex, false, event.shiftKey);
    });

    cell.addEventListener("mouseenter", event => {
      if (!csvMouseSelecting || (event.buttons & 1) !== 1) return;
      csvMouseMoved = true;
      event.preventDefault();
      focusCsvCell(rowIndex, columnIndex, false, true);
    });

    cell.addEventListener("dblclick", event => {
      if (csvMouseMoved) return;
      event.preventDefault();
      focusCsvCell(rowIndex, columnIndex);
      beginCsvEdit(cell);
    });

    cell.addEventListener("keydown", handleCsvGridKeydown);
    if (!header) {
      cell.addEventListener("contextmenu", event => openCsvCellMenu(event, rowIndex, columnIndex));
    }
    return cell;
  }

  function openCsvColumnMenu(event, column, rows) {
    event.preventDefault();
    event.stopPropagation();
    focusCsvCell(0, column);
    const tab = activeTab();
    const width = window.RemoteHandCsv.columnCount(rows);

    showCsvContextMenu(event.clientX, event.clientY, [
      {
        label:"Insert column left",
        run:() => {
          const next = window.RemoteHandCsv.addColumn(csvRowsFor(tab), column);
          updateCsvDocument(next);
          tab.csvColumnWidths.splice(column, 0, 180);
          renderCsvGrid({row:0, column});
        }
      },
      {
        label:"Insert column right",
        run:() => {
          const next = window.RemoteHandCsv.addColumn(csvRowsFor(tab), column + 1);
          updateCsvDocument(next);
          tab.csvColumnWidths.splice(column + 1, 0, 180);
          renderCsvGrid({row:0, column:column + 1});
        }
      },
      {
        label:"Rename column",
        run:() => renderCsvGrid({row:0, column, edit:true})
      },
      {
        label:"Delete column",
        danger:true,
        disabled:width <= 1,
        run:() => {
          const next = window.RemoteHandCsv.deleteColumn(csvRowsFor(tab), column);
          updateCsvDocument(next);
          tab.csvColumnWidths.splice(column, 1);
          renderCsvGrid({row:0, column:Math.max(0, Math.min(column, next[0].length - 1))});
        }
      }
    ]);
  }

  function openCsvRowMenu(event, rowIndex) {
    event.preventDefault();
    event.stopPropagation();
    const tab = activeTab();

    showCsvContextMenu(event.clientX, event.clientY, [
      {
        label:"Insert row above",
        run:() => {
          const next = window.RemoteHandCsv.addRow(csvRowsFor(tab), rowIndex);
          updateCsvDocument(next);
          renderCsvGrid({row:rowIndex, column:0});
        }
      },
      {
        label:"Insert row below",
        run:() => {
          const next = window.RemoteHandCsv.addRow(csvRowsFor(tab), rowIndex + 1);
          updateCsvDocument(next);
          renderCsvGrid({row:rowIndex + 1, column:0});
        }
      },
      {
        label:"Delete row",
        danger:true,
        run:() => {
          const next = window.RemoteHandCsv.deleteRow(csvRowsFor(tab), rowIndex);
          updateCsvDocument(next);
          renderCsvGrid({row:Math.max(0, Math.min(rowIndex, next.length - 1)), column:0});
        }
      }
    ]);
  }

  function renderCsvGrid(focus = null) {
    const tab = activeTab();
    if (!isCsvView(tab)) {
      closeCsvContextMenu();
      csvTableWrap.replaceChildren();
      return true;
    }

    let rows;
    try {
      rows = csvRowsFor(tab);
    } catch (error) {
      tab.viewMode = "text";
      csvViewToggle.checked = false;
      csvHost.hidden = true;
      editorHost.hidden = false;
      void messageModal("Could not open CSV view", String(error));
      return false;
    }

    const width = window.RemoteHandCsv.columnCount(rows);
    if (!Array.isArray(tab.csvColumnWidths)) tab.csvColumnWidths = [];
    while (tab.csvColumnWidths.length < width) tab.csvColumnWidths.push(180);
    tab.csvColumnWidths = tab.csvColumnWidths.slice(0, width);

    const requested = focus && Number.isInteger(focus.row) && Number.isInteger(focus.column)
      ? focus
      : (tab.csvSelection || {row:0, column:0});
    const selection = clampCsvSelection(rows, requested.row, requested.column);
    tab.csvSelection = selection;
    if (!requested.preserveAnchor || !tab.csvSelectionAnchor) {
      tab.csvSelectionAnchor = {...selection};
    }

    const table = document.createElement("table");
    table.className = "csv-table";

    const colgroup = document.createElement("colgroup");
    const rowHeadCol = document.createElement("col");
    rowHeadCol.style.width = "64px";
    colgroup.appendChild(rowHeadCol);
    for (let column = 0; column < width; column++) {
      const col = document.createElement("col");
      col.style.width = Math.max(90, Number(tab.csvColumnWidths[column]) || 180) + "px";
      col.dataset.csvCol = String(column);
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "csv-row-head";
    corner.textContent = "#";
    headerRow.appendChild(corner);

    for (let column = 0; column < width; column++) {
      const th = document.createElement("th");
      th.className = "csv-header-cell";

      const cell = makeCsvGridCell(0, column, rows[0][column] || "", true);
      cell.addEventListener("contextmenu", event => openCsvColumnMenu(event, column, rows));
      th.appendChild(cell);

      const handle = document.createElement("span");
      handle.className = "csv-resize-handle";
      handle.addEventListener("mousedown", event => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startWidth = Math.max(90, Number(tab.csvColumnWidths[column]) || 180);
        const move = moveEvent => {
          const nextWidth = Math.max(90, startWidth + moveEvent.clientX - startX);
          tab.csvColumnWidths[column] = nextWidth;
          const col = colgroup.querySelector('col[data-csv-col="' + column + '"]');
          if (col) col.style.width = nextWidth + "px";
        };
        const up = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", up);
          schedulePersist();
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      });
      th.appendChild(handle);

      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const tr = document.createElement("tr");
      const rowHead = document.createElement("th");
      rowHead.className = "csv-row-head";
      rowHead.textContent = String(rowIndex);
      rowHead.title = "Right-click for row actions";
      rowHead.addEventListener("contextmenu", event => openCsvRowMenu(event, rowIndex));
      tr.appendChild(rowHead);

      for (let column = 0; column < width; column++) {
        const td = document.createElement("td");
        td.appendChild(makeCsvGridCell(rowIndex, column, rows[rowIndex][column] || ""));
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    csvTableWrap.replaceChildren(table);

    focusCsvCell(selection.row, selection.column, Boolean(requested.edit), Boolean(requested.preserveAnchor));
    return true;
  }

  function setCsvView(enabled) {
    const tab = activeTab();
    if (!isCsvTab(tab)) return;
    if (enabled) {
      try {
        window.RemoteHandCsv.parse(tab.content);
      } catch (error) {
        csvViewToggle.checked = false;
        void messageModal("Could not open CSV view", String(error));
        return;
      }
      tab.viewMode = "csv";
    } else {
      tab.viewMode = "text";
    }
    render();
    schedulePersist();
  }

  function setMarkdownPreview(enabled) {
    const tab = activeTab();
    if (!isMarkdownTab(tab)) return;
    if (enabled) saveActiveEditorState();
    tab.viewMode = enabled ? "markdown-preview" : "text";
    render();
    schedulePersist();
  }

  function renderMarkdownPreview(tab = activeTab()) {
    if (!isMarkdownPreview(tab)) {
      mdPreviewContent.replaceChildren();
      return;
    }
    mdPreviewContent.innerHTML = window.RemoteHandMarkdown.render(tab.content);
  }

  function updatePosition() {
    const tab = activeTab();
    if (!tab) {
      position.textContent = "Ln 1, Col 1";
      return;
    }

    if (isCsvView(tab)) {
      try {
        const rows = csvRowsFor(tab);
        const width = window.RemoteHandCsv.columnCount(rows);
        const selection = clampCsvSelection(
          rows,
          tab.csvSelection && tab.csvSelection.row,
          tab.csvSelection && tab.csvSelection.column
        );
        const location = selection.row === 0
          ? "Header C" + (selection.column + 1)
          : "R" + selection.row + " C" + (selection.column + 1);
        const bounds = csvSelectionBounds(tab);
        const selectedRows = bounds.bottom - bounds.top + 1;
        const selectedColumns = bounds.right - bounds.left + 1;
        const selectedCells = selectedRows * selectedColumns;
        const selectionSummary = selectedCells > 1
          ? " · Selected " + selectedRows.toLocaleString() + " × " +
            selectedColumns.toLocaleString() + " (" + selectedCells.toLocaleString() + " cells)"
          : "";

        position.textContent = location + " · " +
          Math.max(0, rows.length - 1).toLocaleString() + " rows × " +
          width.toLocaleString() + " columns" + selectionSummary;
      } catch (_) {
        position.textContent = "";
      }
      return;
    }

    const head = editorCursor();
    tab.cursor = head;

    if (tab.binary) {
      if (!tab.hexEditable) {
        position.textContent = "";
        return;
      }

      const ascii = asciiCellAt(view.state, head);
      const hex = hexNibbleAt(view.state, head);
      const cell = ascii || hex;

      if (cell) {
        const offset = ((cell.line.number - 1) * 16) + cell.byteIndex;
        const offsetText = "0x" + offset.toString(16).toUpperCase().padStart(8, "0");

        if (ascii) {
          position.textContent = "Offset " + offsetText + " · ASCII";
        } else {
          position.textContent = "Offset " + offsetText + " · " +
            (hex.nibble === 0 ? "High nibble" : "Low nibble");
        }
        return;
      }

      position.textContent = "";
      return;
    }

    const lineInfo = view.state.doc.lineAt(head);
    position.textContent = "Ln " + lineInfo.number + ", Col " + (head - lineInfo.from + 1);
  }

  function updateSaveState() {
    const tab = activeTab();
    if (!tab) {
      saveState.textContent = "";
      saveState.className = "";
      return;
    }

    saveState.textContent = tab.dirty
      ? (tab.recovered ? "Recovered • Not saved to disk" : "Modified • Not saved to disk")
      : "Saved";
    saveState.className = tab.dirty ? "status-dirty" : "";
  }

  function newDocument(content = "") {
    saveActiveEditorState();
    const tab = {
      id:makeId(),
      name:"Untitled " + untitledCounter++,
      path:null,
      content,
      savedContent:"",
      dirty:Boolean(content),
      recovered:false,
      encoding:"UTF-8",
      bom:false,
      eol:detectEol(content),
      hasAutocomplete:false,
      viewMode:"text",
      csvColumnWidths:[],
      cursor:0,
      cmState:null
    };
    tabs.push(tab);
    activeId = tab.id;
    render();
    schedulePersist();
    requestAnimationFrame(() => view.focus());
  }

  function sessionPayload() {
    saveActiveEditorState();
    return {
      version:3,
      activeId,
      untitledCounter,
      wrapText,
      lineNumbers,
      autocompleteEnabled,
      tabs:tabs.map(tab => ({
        id:tab.id,
        name:tab.name,
        path:tab.path,
        content:tab.content,
        savedContent:typeof tab.savedContent === "string" ? tab.savedContent : "",
        dirty:Boolean(tab.dirty),
        encoding:tab.encoding || "UTF-8",
        bom:Boolean(tab.bom),
        binary:Boolean(tab.binary),
        readOnly:Boolean(tab.readOnly),
        hexEditable:Boolean(tab.hexEditable),
        binarySize:Number.isFinite(Number(tab.binarySize)) ? Number(tab.binarySize) : null,
        previewTruncated:Boolean(tab.previewTruncated),
        viewMode:isCsvTab(tab) && tab.viewMode === "csv"
          ? "csv"
          : (isMarkdownTab(tab) && tab.viewMode === "markdown-preview" ? "markdown-preview" : "text"),
        csvColumnWidths:Array.isArray(tab.csvColumnWidths) ? tab.csvColumnWidths : [],
        eol:tab.eol || detectEol(tab.content),
        cursor:Number.isFinite(tab.cursor) ? tab.cursor : 0
      }))
    };
  }

  function persistNow() {
    clearTimeout(persistTimer);
    persistTimer = null;
    if (nativeDialogPending) return persistInFlight;

    const snapshot = sessionPayload();
    persistInFlight = persistInFlight
      .catch(() => {})
      .then(() => request("session.set", snapshot))
      .catch(error => console.warn("Editor recovery save failed:", error));
    return persistInFlight;
  }

  function schedulePersist(delay = 180) {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, delay);
  }

  async function restoreSession() {
    let stored = null;
    try {
      stored = await request("session.get");
    } catch (error) {
      console.warn("Editor could not restore its previous session:", error);
    }

    if (!stored || !Array.isArray(stored.tabs) || stored.tabs.length === 0) {
      newDocument();
      return;
    }

    wrapText = Boolean(stored.wrapText);
    lineNumbers = stored.lineNumbers !== false;
    autocompleteEnabled = stored.autocompleteEnabled !== false;
    wrapTextToggle.checked = wrapText;
    lineNumbersToggle.checked = lineNumbers;
    autocompleteToggle.checked = autocompleteEnabled;
    applyLineNumbersState();
    untitledCounter = Math.max(1, Number(stored.untitledCounter) || 1);

    tabs = stored.tabs.map(raw => ({
      id:typeof raw.id === "string" ? raw.id : makeId(),
      name:typeof raw.name === "string" ? raw.name : "Untitled",
      path:typeof raw.path === "string" && raw.path ? raw.path : null,
      content:typeof raw.content === "string" ? raw.content : "",
      savedContent:typeof raw.savedContent === "string" ? raw.savedContent : (raw.path ? null : ""),
      dirty:Boolean(raw.dirty),
      recovered:Boolean(raw.path && raw.dirty),
      encoding:raw.binary ? "Binary" : "UTF-8",
      bom:Boolean(raw.bom),
      binary:Boolean(raw.binary),
      readOnly:Boolean(raw.readOnly),
      hexEditable:Boolean(raw.hexEditable),
      binarySize:Number.isFinite(Number(raw.binarySize)) ? Number(raw.binarySize) : null,
      previewTruncated:Boolean(raw.previewTruncated),
      viewMode:!raw.binary && /\.csv$/i.test(String(raw.name || "")) && raw.viewMode === "csv"
        ? "csv"
        : (!raw.binary && /\.md$/i.test(String(raw.name || "")) && raw.viewMode === "markdown-preview"
            ? "markdown-preview"
            : "text"),
      csvColumnWidths:Array.isArray(raw.csvColumnWidths) ? raw.csvColumnWidths.map(value => Math.max(90, Number(value) || 180)) : [],
      eol:raw.binary ? "—" : (raw.eol === "CRLF" ? "CRLF" : detectEol(String(raw.content || ""))),
      hasAutocomplete:false,
      cursor:Math.max(0, Number(raw.cursor) || 0),
      cmState:null
    }));

    for (const tab of tabs) {
      if (!tab.path || tab.binary) continue;
      try {
        const fresh = await request("file.read", {path:tab.path});
        tab.savedContent = fresh.content || "";
        if (!tab.dirty) {
          tab.content = tab.savedContent;
          tab.name = fresh.name || basename(tab.path);
          tab.bom = Boolean(fresh.bom);
          tab.eol = fresh.eol || detectEol(tab.content);
        } else if (tab.content === tab.savedContent) {
          tab.dirty = false;
          tab.recovered = false;
        }
      } catch (error) {
        console.warn("Editor could not refresh remembered file:", tab.path, error);
        if (tab.savedContent === null) tab.savedContent = tab.content;
      }
    }

    activeId = tabs.some(tab => tab.id === stored.activeId) ? stored.activeId : tabs[0].id;
    render();
    schedulePersist(400);
  }

  function saveActiveEditorState() {
    const tab = activeTab();
    if (!tab || editorHost.hidden) return;
    tab.cmState = view.state;
    tab.content = editorText();
    tab.cursor = editorCursor();
  }

  function render() {
    const tab = activeTab();
    renderTabs();

    const hasTab = Boolean(tab);
    if (tab && !isCsvTab(tab) && !isMarkdownTab(tab)) tab.viewMode = "text";
    const csvMode = Boolean(tab && isCsvView(tab));
    const markdownMode = Boolean(tab && isMarkdownPreview(tab));
    editorHost.hidden = !hasTab || csvMode || markdownMode;
    csvHost.hidden = !hasTab || !csvMode;
    mdPreviewHost.hidden = !hasTab || !markdownMode;
    empty.hidden = hasTab;

    if (!tab) {
      updateSaveState();
      return;
    }

    suppressEditorUpdates = true;
    try {
      const nextState = tab.cmState || createEditorState(tab);
      view.setState(nextState);
      tab.cmState = view.state;
    } finally {
      suppressEditorUpdates = false;
    }

    if (wrapText !== wrapTextToggle.checked) wrapTextToggle.checked = wrapText;
    applyLineNumbersState();
    view.dispatch({effects:wrapCompartment.reconfigure(wrapText ? EditorView.lineWrapping : [])});
    tab.cmState = view.state;

    if (tab.binary && tab.hexEditable) {
      const selection = currentSelection();
      if (!hexNibbleAt(view.state, selection.head) && !asciiCellAt(view.state, selection.head)) {
        const line = view.state.doc.lineAt(Math.min(selection.head, view.state.doc.length));
        const column = selection.head - line.from;
        const side = column >= 60 ? "ascii" : "hex";
        const target = binaryEdgePosition(view.state, side, true, 0);
        view.dispatch({selection:{anchor:target}, scrollIntoView:true});
        tab.cmState = view.state;
        tab.cursor = target;
      }
    }

    encoding.textContent = tab.encoding || "UTF-8";
    eol.textContent = tab.binary ? "—" : (tab.eol || detectEol(tab.content));
    language.textContent = tab.binary
      ? (tab.hexEditable
          ? "Hex editor"
          : (tab.previewTruncated ? "Binary preview (truncated)" : "Binary preview"))
      : (csvMode ? "CSV" : (markdownMode ? "Markdown preview" : languageInfo(tab.name)));

    if (csvMode) renderCsvGrid();
    if (markdownMode) renderMarkdownPreview(tab);

    updateContextualControls();
    updateSaveState();
    updatePosition();
    void applyLanguageForActiveTab();

    requestAnimationFrame(() => {
      if (!csvMode && !markdownMode) view.focus();
    });
  }

  function ensureActiveTabVisible() {
    const element = tabsHost.querySelector('.tab[data-id="' + activeId + '"]');
    if (!element) return;
    const left = element.offsetLeft;
    const right = left + element.offsetWidth;
    if (left < tabsHost.scrollLeft) tabsHost.scrollLeft = left - 4;
    else if (right > tabsHost.scrollLeft + tabsHost.clientWidth) {
      tabsHost.scrollLeft = right - tabsHost.clientWidth + 4;
    }
    updateTabScrollButtons();
  }

  function updateTabScrollButtons() {
    const max = Math.max(0, tabsHost.scrollWidth - tabsHost.clientWidth);
    tabsPrev.disabled = tabsHost.scrollLeft <= 1;
    tabsNext.disabled = tabsHost.scrollLeft >= max - 1;
  }

  function clearTabDropIndicators() {
    for (const element of tabsHost.querySelectorAll(".tab")) {
      element.classList.remove("drop-before", "drop-after", "dragging");
    }
  }

  function reorderTab(draggedId, targetId, placeAfter) {
    const fromIndex = tabs.findIndex(tab => tab.id === draggedId);
    const targetIndex = tabs.findIndex(tab => tab.id === targetId);
    if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return false;

    const moved = tabs.splice(fromIndex, 1)[0];
    let insertIndex = tabs.findIndex(tab => tab.id === targetId);
    if (insertIndex < 0) {
      tabs.push(moved);
      return true;
    }
    if (placeAfter) insertIndex += 1;
    tabs.splice(insertIndex, 0, moved);
    return true;
  }

  function renderTabs() {
    tabsHost.replaceChildren();

    for (const tab of tabs) {
      const item = document.createElement("div");
      item.className = "tab" + (tab.id === activeId ? " active" : "");
      item.dataset.id = tab.id;
      item.draggable = true;

      const name = document.createElement("span");
      name.className = "tab-name";
      name.textContent = tab.name;
      item.appendChild(name);

      if (tab.dirty) {
        const dirty = document.createElement("span");
        dirty.className = "dirty";
        dirty.textContent = "•";
        item.appendChild(dirty);
      }

      const close = document.createElement("button");
      close.type = "button";
      close.className = "tab-close";
      close.textContent = "×";
      close.title = "Close";
      close.addEventListener("click", event => {
        event.stopPropagation();
        void closeTab(tab.id);
      });
      item.appendChild(close);

      item.addEventListener("click", () => {
        if (tab.id === activeId) return;
        saveActiveEditorState();
        activeId = tab.id;
        render();
        schedulePersist();
      });

      item.addEventListener("dragstart", event => {
        draggedTabId = tab.id;
        item.classList.add("dragging");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-remotehand-editor-tab", tab.id);
        }
      });

      item.addEventListener("dragover", event => {
        if (!draggedTabId || draggedTabId === tab.id) return;
        event.preventDefault();
        const rect = item.getBoundingClientRect();
        const after = event.clientX > rect.left + rect.width / 2;
        item.classList.toggle("drop-before", !after);
        item.classList.toggle("drop-after", after);
      });

      item.addEventListener("dragleave", () => {
        item.classList.remove("drop-before", "drop-after");
      });

      item.addEventListener("drop", event => {
        if (!draggedTabId || draggedTabId === tab.id) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = item.getBoundingClientRect();
        const after = event.clientX > rect.left + rect.width / 2;
        if (reorderTab(draggedTabId, tab.id, after)) {
          renderTabs();
          void persistNow();
        }
        draggedTabId = null;
        clearTabDropIndicators();
      });

      item.addEventListener("dragend", () => {
        draggedTabId = null;
        clearTabDropIndicators();
      });

      tabsHost.appendChild(item);
    }

    requestAnimationFrame(ensureActiveTabVisible);
  }

  tabsPrev.addEventListener("click", () => {
    tabsHost.scrollBy({left:-Math.max(140, Math.round(tabsHost.clientWidth * .55)), behavior:"smooth"});
  });
  tabsNext.addEventListener("click", () => {
    tabsHost.scrollBy({left:Math.max(140, Math.round(tabsHost.clientWidth * .55)), behavior:"smooth"});
  });
  tabsHost.addEventListener("scroll", updateTabScrollButtons, {passive:true});

  function pathFromFileUri(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "file:") return "";
      let path = decodeURIComponent(url.pathname || "");
      if (url.hostname) return "\\\\" + url.hostname + path.replace(/\//g, "\\");
      if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
      if (/^[A-Za-z]:\//.test(path)) path = path.replace(/\//g, "\\");
      return path;
    } catch {
      return "";
    }
  }

  function normalizeDroppedPath(value) {
    let path = String(value || "").trim();
    if (!path || path.startsWith("#")) return "";
    if ((path.startsWith('"') && path.endsWith('"')) || (path.startsWith("'") && path.endsWith("'"))) {
      path = path.slice(1, -1).trim();
    }
    if (/^file:\/\//i.test(path)) return pathFromFileUri(path);
    return path;
  }

  function droppedPaths(dataTransfer) {
    if (!dataTransfer) return [];
    const paths = [];

    for (const file of Array.from(dataTransfer.files || [])) {
      const localPath = typeof file.path === "string" ? file.path : "";
      if (localPath) paths.push(localPath);
    }

    for (const type of ["text/uri-list", "text/plain"]) {
      let text = "";
      try { text = dataTransfer.getData(type) || ""; } catch {}
      for (const line of text.split(/\r?\n/)) {
        const path = normalizeDroppedPath(line);
        if (path) paths.push(path);
      }
    }

    return [...new Set(paths)];
  }

  function clearFileDropState() {
    tabsShell.classList.remove("file-drop-ready", "file-drop-invalid");
  }

  function updateFileDropState(event) {
    if (draggedTabId || !event.dataTransfer) return false;
    const types = Array.from(event.dataTransfer.types || []);
    const mayContainPath = types.includes("Files") || types.includes("text/plain") || types.includes("text/uri-list");
    if (!mayContainPath) return false;

    event.preventDefault();
    const fileCount = event.dataTransfer.files ? event.dataTransfer.files.length : 0;
    const knownPaths = droppedPaths(event.dataTransfer);
    const multiple = fileCount > 1 || knownPaths.length > 1;
    event.dataTransfer.dropEffect = multiple ? "none" : "copy";
    tabsShell.classList.toggle("file-drop-invalid", multiple);
    tabsShell.classList.toggle("file-drop-ready", !multiple);
    return true;
  }

  tabsShell.addEventListener("dragenter", updateFileDropState);
  tabsShell.addEventListener("dragover", updateFileDropState);
  tabsShell.addEventListener("dragleave", event => {
    if (draggedTabId) return;
    const related = event.relatedTarget;
    if (related instanceof Node && tabsShell.contains(related)) return;
    clearFileDropState();
  });

  tabsShell.addEventListener("drop", event => {
    if (draggedTabId || !event.dataTransfer) return;
    const types = Array.from(event.dataTransfer.types || []);
    if (types.includes("application/x-remotehand-editor-tab")) return;
    const paths = droppedPaths(event.dataTransfer);
    if (!types.includes("Files") && paths.length === 0) return;

    event.preventDefault();
    event.stopPropagation();
    clearFileDropState();

    if (paths.length === 0) return;
    if (paths.length !== 1) {
      void messageModal("Could not open files", "Drop one file at a time onto the Editor tab area.");
      return;
    }
    void openPath(paths[0]);
  });

  editorHost.addEventListener("dragover", event => {
    if (draggedTabId || !event.dataTransfer) return;
    const paths = droppedPaths(event.dataTransfer);
    if (paths.length > 0 || Array.from(event.dataTransfer.types || []).includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  });

  editorHost.addEventListener("drop", event => {
    if (draggedTabId || !event.dataTransfer) return;
    const paths = droppedPaths(event.dataTransfer);
    if (paths.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    insertDroppedPaths(paths);
  });

  function activateOpenedFile(result) {
    if (!result || !result.path) return false;
    const existing = tabs.find(tab => tab.path === result.path);
    if (existing) {
      saveActiveEditorState();
      activeId = existing.id;
      render();
      return true;
    }

    const tab = {
      id:makeId(),
      name:result.name || basename(result.path),
      path:result.path,
      content:result.content || "",
      savedContent:result.content || "",
      dirty:false,
      recovered:false,
      encoding:result.encoding || "UTF-8",
      bom:Boolean(result.bom),
      binary:Boolean(result.binary),
      readOnly:Boolean(result.readOnly),
      hexEditable:Boolean(result.hexEditable),
      binarySize:Number.isFinite(Number(result.size)) ? Number(result.size) : null,
      previewTruncated:Boolean(result.previewTruncated),
      hasAutocomplete:false,
      viewMode:"text",
      csvColumnWidths:[],
      eol:result.binary ? "—" : (result.eol || detectEol(result.content || "")),
      cursor:0,
      cmState:null
    };
    saveActiveEditorState();
    tabs.push(tab);
    activeId = tab.id;
    render();
    return true;
  }

  async function loadBinaryPreview(tab) {
    const result = await request("file.read", {path:tab.path, allowBinary:true});
    tab.content = result.content || "";
    tab.savedContent = tab.content;
    tab.dirty = false;
    tab.recovered = false;
    tab.readOnly = true;
    tab.hexEditable = false;
    tab.binarySize = Number(result.size) || 0;
    tab.previewTruncated = Boolean(result.previewTruncated);
    tab.encoding = "Binary";
    tab.cursor = 0;
    tab.cmState = null;
    render();
    await persistNow();
  }

  async function enableHexEditing() {
    const tab = activeTab();
    if (!tab || !tab.binary || tab.hexEditable || !tab.path) return;

    try {
      const result = await request("file.read", {
        path:tab.path,
        allowBinary:true,
        editBinary:true
      });
      tab.content = result.content || "";
      tab.savedContent = tab.content;
      tab.dirty = false;
      tab.readOnly = false;
      tab.hexEditable = true;
      tab.binarySize = Number(result.size) || 0;
      tab.previewTruncated = false;
      tab.encoding = "Binary";
      tab.cursor = 10;
      tab.cmState = null;
      render();
      await persistNow();
    } catch (error) {
      hexEditToggle.checked = false;
      await messageModal("Could not enable hex editing", String(error));
    }
  }

  async function disableHexEditing() {
    const tab = activeTab();
    if (!tab || !tab.binary || !tab.hexEditable || !tab.path) return;

    if (tab.id === activeId) saveActiveEditorState();

    if (tab.dirty) {
      const choice = await choiceModal(
        "Leave Hex Editor?",
        "“" + tab.name + "” has unsaved binary changes.",
        [
          {id:"save", label:"Save", primary:true},
          {id:"discard", label:"Discard", danger:true},
          {id:"cancel", label:"Cancel"}
        ]
      );

      if (choice === "cancel" || choice === null) {
        hexEditToggle.checked = true;
        return;
      }
      if (choice === "save" && !(await saveTab(tab))) {
        hexEditToggle.checked = true;
        return;
      }
    }

    try {
      await loadBinaryPreview(tab);
    } catch (error) {
      hexEditToggle.checked = true;
      await messageModal("Could not return to binary preview", String(error));
    }
  }

  async function resolveOpenResult(result) {
    if (!result || !result.path) return false;
    if (!result.binary || Object.prototype.hasOwnProperty.call(result, "content")) {
      return activateOpenedFile(result);
    }

    const sizeText = Number.isFinite(Number(result.size))
      ? " (" + Number(result.size).toLocaleString() + " bytes)"
      : "";
    const choice = await choiceModal(
      "Binary file detected",
      "“" + (result.name || basename(result.path)) + "” appears to be binary" + sizeText +
        ". Open a read-only hex preview?",
      [
        {id:"preview", label:"Open preview", primary:true},
        {id:"cancel", label:"Cancel"}
      ]
    );
    if (choice !== "preview") return false;

    const preview = await request("file.read", {path:result.path, allowBinary:true});
    return activateOpenedFile(preview);
  }

  async function openPath(path) {
    const value = String(path || "").trim();
    if (!value) return;

    const existing = tabs.find(tab => tab.path === value);
    if (existing) {
      saveActiveEditorState();
      activeId = existing.id;
      render();
      return;
    }

    try {
      const result = await request("file.read", {path:value});
      if (await resolveOpenResult(result)) await persistNow();
    } catch (error) {
      await messageModal("Could not open file", String(error));
    }
  }

  async function openFile() {
    if (nativeDialogPending) return;
    nativeDialogPending = true;
    try {
      const result = await request("file.open");
      if (!result || result.opened === false || !result.path) return;
      await resolveOpenResult(result);
    } catch (error) {
      await messageModal("Could not open file", String(error));
    } finally {
      nativeDialogPending = false;
      await persistNow();
    }
  }

  async function saveTab(tab = activeTab()) {
    if (!tab) return false;
    if (tab.binary && !tab.hexEditable) {
      await messageModal("Read-only preview", "Choose Edit Hex before modifying or saving a binary file.");
      return false;
    }
    if (tab.id === activeId) saveActiveEditorState();
    if (!tab.path) return saveAsTab(tab);

    try {
      if (tab.binary) {
        const hex = hexPayloadFromDump(tab.content, tab.binarySize);
        const result = await request("file.write_binary", {path:tab.path, hex});
        tab.savedContent = tab.content;
        tab.dirty = false;
        tab.recovered = false;
        tab.encoding = result.encoding || "Binary";
        tab.binarySize = Number(result.size) || tab.binarySize;
        renderTabs();
        updateSaveState();
        await persistNow();
        return true;
      }

      const result = await request("file.write", {path:tab.path, content:tab.content, bom:Boolean(tab.bom)});
      tab.name = result.name || basename(tab.path);
      tab.savedContent = tab.content;
      tab.dirty = false;
      tab.recovered = false;
      tab.bom = Boolean(result.bom);
      tab.eol = result.eol || detectEol(tab.content);
      renderTabs();
      updateSaveState();
      eol.textContent = tab.eol;
      await persistNow();
      return true;
    } catch (error) {
      await messageModal("Could not save file", String(error));
      return false;
    }
  }

  async function saveAsTab(tab = activeTab()) {
    if (!tab || nativeDialogPending) return false;
    if (tab.id === activeId) saveActiveEditorState();

    nativeDialogPending = true;
    try {
      const suggested = tab.path ? tab.name : (tab.name.startsWith("Untitled ") ? "untitled.txt" : tab.name);

      if (tab.binary) {
        const params = {
          suggestedName:suggested,
          sourcePath:tab.path
        };
        if (tab.hexEditable) {
          params.hex = hexPayloadFromDump(tab.content, tab.binarySize);
        }

        const result = await request("file.save_binary_as", params);
        if (!result || !result.saved) return false;

        tab.path = result.path;
        tab.name = basename(result.path);
        tab.savedContent = tab.content;
        tab.dirty = false;
        tab.recovered = false;
        tab.encoding = "Binary";
        tab.binarySize = Number(result.size) || tab.binarySize;
        render();
        return true;
      }

      const saveAsContent = tab.bom ? "\uFEFF" + tab.content : tab.content;
      const result = await request("file.save_as", {suggestedName:suggested, content:saveAsContent});
      if (!result || !result.saved) return false;

      tab.path = result.path;
      tab.name = basename(result.path);
      tab.savedContent = tab.content;
      tab.dirty = false;
      tab.recovered = false;
      tab.bom = Boolean(tab.bom);
      tab.eol = detectEol(tab.content);
      tab.cmState = null;

      if (tab.id === activeId) render();
      else renderTabs();

      return true;
    } catch (error) {
      await messageModal("Could not save file", String(error));
      return false;
    } finally {
      nativeDialogPending = false;
      await persistNow();
    }
  }

  function switchTab(direction) {
    if (tabs.length < 2) return;
    saveActiveEditorState();
    const current = tabs.findIndex(tab => tab.id === activeId);
    const start = current >= 0 ? current : 0;
    activeId = tabs[(start + direction + tabs.length) % tabs.length].id;
    render();
    schedulePersist();
  }

  async function closeTab(id) {
    const tab = tabs.find(item => item.id === id);
    if (!tab) return;
    if (tab.id === activeId) saveActiveEditorState();

    if (!tab.path && tab.dirty) {
      const choice = await choiceModal(
        "Close unsaved document?",
        "“" + tab.name + "” has never been saved as a file.",
        [
          {id:"save", label:"Save As", primary:true},
          {id:"discard", label:"Discard", danger:true},
          {id:"cancel", label:"Cancel"}
        ]
      );
      if (choice === "cancel" || choice === null) return;
      if (choice === "save" && !(await saveAsTab(tab))) return;
    } else if (tab.dirty) {
      const choice = await choiceModal(
        "Close modified file?",
        "“" + tab.name + "” contains changes that have not been written to disk.",
        [
          {id:"save", label:"Save", primary:true},
          {id:"discard", label:"Discard", danger:true},
          {id:"cancel", label:"Cancel"}
        ]
      );
      if (choice === "cancel" || choice === null) return;
      if (choice === "save" && !(await saveTab(tab))) return;
    }

    const index = tabs.findIndex(item => item.id === id);
    tabs.splice(index, 1);
    if (activeId === id) {
      activeId = tabs[Math.min(index, tabs.length - 1)]?.id || null;
    }

    if (tabs.length === 0) {
      newDocument();
      return;
    }

    render();
    await persistNow();
  }

  function binaryByteMap(state = view.state) {
    const bytes = [];
    for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
      const line = state.doc.line(lineNumber);
      if (!/^[0-9A-Fa-f]{8}\s\s/.test(line.text)) continue;

      for (let byteIndex = 0; byteIndex < 16; byteIndex++) {
        const hexStart = hexByteStart(byteIndex);
        const pair = line.text.slice(hexStart, hexStart + 2);
        if (!/^[0-9A-Fa-f]{2}$/.test(pair)) continue;
        const value = Number.parseInt(pair, 16);
        bytes.push({
          value,
          hexPosition:line.from + hexStart,
          asciiPosition:line.from + 61 + byteIndex,
          char:value >= 0x20 && value <= 0x7e ? String.fromCharCode(value) : "."
        });
      }
    }
    return bytes;
  }

  function findMatches(query) {
    if (!query) return [];
    const needle = query.toLocaleLowerCase();
    const tab = activeTab();

    if (tab && tab.binary) {
      const bytes = binaryByteMap();
      const haystack = bytes.map(byte => byte.char).join("").toLocaleLowerCase();
      const matches = [];
      let index = 0;

      while ((index = haystack.indexOf(needle, index)) >= 0) {
        const slice = bytes.slice(index, index + query.length);
        if (slice.length === query.length) {
          matches.push({
            binary:true,
            byteOffset:index,
            length:query.length,
            from:slice[0].asciiPosition,
            to:slice[slice.length - 1].asciiPosition + 1
          });
        }
        index += Math.max(1, needle.length);
      }
      return matches;
    }

    const haystack = editorText().toLocaleLowerCase();
    const matches = [];
    let index = 0;
    while ((index = haystack.indexOf(needle, index)) >= 0) {
      matches.push(index);
      index += Math.max(1, needle.length);
    }
    return matches;
  }

  function matchFrom(match) {
    return typeof match === "number" ? match : match.from;
  }

  function matchTo(match, queryLength) {
    return typeof match === "number" ? match + queryLength : match.to;
  }

  function updateFindCount(query = findInput.value) {
    const matches = findMatches(query);
    const hasMatches = Boolean(query) && matches.length > 0;
    const tab = activeTab();
    const canReplace = hasMatches && (!tab || !tab.binary || tab.hexEditable);
    replaceOneBtn.disabled = !canReplace;
    replaceAllBtn.disabled = !canReplace;

    if (!query) {
      findCount.textContent = "0 of 0";
      return matches;
    }
    if (matches.length === 0) {
      findCount.textContent = "No matches";
      return matches;
    }

    const selection = currentSelection();
    let current = matches.findIndex(match => matchFrom(match) === selection.from);
    if (current < 0) current = 0;
    findCount.textContent = (current + 1) + " of " + matches.length;
    return matches;
  }

  function openFind(replaceMode = false) {
    if (isCsvView()) setCsvView(false);
    findbar.hidden = false;
    replaceToggle.checked = replaceMode;
    syncReplaceMode();

    const selection = currentSelection();
    if (!selection.empty) findInput.value = view.state.doc.sliceString(selection.from, selection.to);

    updateFindCount();
    findInput.focus();
    findInput.select();
  }

  function closeFind(focusEditor = true) {
    findbar.hidden = true;
    clearBinaryFindMarks();
    if (focusEditor) view.focus();
  }

  function syncReplaceMode() {
    replaceRow.hidden = !replaceToggle.checked;
  }

  function binaryFindRanges(match) {
    if (!match || !match.binary) return [];
    const bytes = binaryByteMap();
    const ranges = [];
    for (let i = 0; i < match.length; i++) {
      const byte = bytes[match.byteOffset + i];
      if (!byte) continue;
      ranges.push({from:byte.hexPosition, to:byte.hexPosition + 2});
      ranges.push({from:byte.asciiPosition, to:byte.asciiPosition + 1});
    }
    ranges.sort((a,b) => a.from - b.from);
    return ranges;
  }

  function clearBinaryFindMarks() {
    const tab = activeTab();
    if (tab && tab.binary) {
      view.dispatch({effects:setBinaryFindMarks.of([])});
    }
  }

  function findMove(direction) {
    const query = findInput.value;
    if (!query) {
      updateFindCount(query);
      return;
    }

    const matches = findMatches(query);
    if (matches.length === 0) {
      updateFindCount(query);
      return;
    }

    const selection = currentSelection();
    let target;

    const tab = activeTab();
    if (direction > 0) {
      target = matches.find(match => {
        const from = matchFrom(match);
        return tab && tab.binary ? from > selection.from : from >= selection.to;
      });
      if (target === undefined) target = matches[0];
    } else {
      for (let i = matches.length - 1; i >= 0; i--) {
        if (matchFrom(matches[i]) < selection.from) {
          target = matches[i];
          break;
        }
      }
      if (target === undefined) target = matches[matches.length - 1];
    }

    const from = matchFrom(target);
    const to = matchTo(target, query.length);

    if (tab && tab.binary && typeof target !== "number") {
      view.dispatch({
        selection:{anchor:from},
        effects:[
          EditorView.scrollIntoView(from, {y:"center"}),
          setBinaryFindMarks.of(binaryFindRanges(target))
        ]
      });
    } else {
      view.dispatch({
        selection:{anchor:from, head:to},
        effects:EditorView.scrollIntoView(from, {y:"center"})
      });
    }
    updateFindCount(query);
    findInput.focus({preventScroll:true});
  }

  function findNext() { findMove(1); }
  function findPrevious() { findMove(-1); }

  function selectedFindMatch() {
    const query = findInput.value;
    if (!query) return null;
    const selection = currentSelection();
    const matches = findMatches(query);
    return matches.find(match => matchFrom(match) === selection.from) || null;
  }

  function selectionMatchesFind() {
    const query = findInput.value;
    if (!query) return false;
    const tab = activeTab();
    if (tab && tab.binary) return Boolean(selectedFindMatch());
    const selection = currentSelection();
    const selected = view.state.doc.sliceString(selection.from, selection.to);
    return selected.toLocaleLowerCase() === query.toLocaleLowerCase();
  }

  function replaceCurrent() {
    const query = findInput.value;
    if (!query) return;

    const tab = activeTab();
    if (tab && tab.binary && !tab.hexEditable) return;

    if (!selectionMatchesFind()) findNext();
    if (!selectionMatchesFind()) return;

    const selection = currentSelection();
    const replacement = replaceInput.value;

    try {
      if (tab && tab.binary) {
        const match = selectedFindMatch();
        if (!match) return;
        if (replacement.length !== match.length) {
          throw new Error("Binary replacements must keep the same byte length.");
        }
        if (!/^[\x20-\x7E]*$/.test(replacement)) {
          throw new Error("Binary ASCII replacement supports printable ASCII characters only.");
        }

        const bytes = binaryByteMap();
        const changes = [];
        for (let i = 0; i < replacement.length; i++) {
          const byte = bytes[match.byteOffset + i];
          const ch = replacement[i];
          const pair = ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
          changes.push({from:byte.hexPosition, to:byte.hexPosition + 2, insert:pair});
          changes.push({from:byte.asciiPosition, to:byte.asciiPosition + 1, insert:ch});
        }
        changes.sort((a,b) => a.from - b.from);
        view.dispatch({
          changes,
          selection:{anchor:match.from},
          annotations:hexEditAnnotation.of(true)
        });
      } else {
        view.dispatch({
          changes:{from:selection.from, to:selection.to, insert:replacement},
          selection:{anchor:selection.from + replacement.length}
        });
      }
    } catch (error) {
      void messageModal("Could not replace binary bytes", String(error));
      return;
    }

    clearBinaryFindMarks();
    findNext();
    if (findMatches(query).length === 0) view.focus();
  }

  function replaceAllMatches() {
    const query = findInput.value;
    if (!query) return;

    const tab = activeTab();
    if (tab && tab.binary && !tab.hexEditable) return;

    const matches = findMatches(query);
    if (matches.length === 0) {
      updateFindCount(query);
      return;
    }

    const replacement = replaceInput.value;

    try {
      if (tab && tab.binary) {
        if (replacement.length !== query.length) {
          throw new Error("Binary replacements must keep the same byte length.");
        }
        if (!/^[\x20-\x7E]*$/.test(replacement)) {
          throw new Error("Binary ASCII replacement supports printable ASCII characters only.");
        }

        const bytes = binaryByteMap();
        const changes = [];
        for (const match of matches) {
          for (let i = 0; i < replacement.length; i++) {
            const byte = bytes[match.byteOffset + i];
            const ch = replacement[i];
            const pair = ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
            changes.push({from:byte.hexPosition, to:byte.hexPosition + 2, insert:pair});
            changes.push({from:byte.asciiPosition, to:byte.asciiPosition + 1, insert:ch});
          }
        }
        changes.sort((a,b) => a.from - b.from);
        view.dispatch({changes, annotations:hexEditAnnotation.of(true)});
      } else {
        const changes = matches.map(index => ({from:index, to:index + query.length, insert:replacement}));
        view.dispatch({changes});
      }
    } catch (error) {
      void messageModal("Could not replace binary bytes", String(error));
      return;
    }

    updateFindCount(query);
    view.focus();
  }

  function insertDroppedPaths(paths) {
    const insertion = paths.join("\n");
    if (!insertion) return;

    const selection = currentSelection();
    view.dispatch({
      changes:{from:selection.from, to:selection.to, insert:insertion},
      selection:{anchor:selection.from + insertion.length},
      scrollIntoView:true
    });
    view.focus();
  }


  const BUILTIN_FILE_EXTENSIONS = ["txt", "log", "md", "json", "csv"];

  function normalizeFileExtensions(builtins, customText) {
    const customParts = String(customText || "").split(",").map(value => value.trim()).filter(Boolean);
    const normalizedCustom = [];
    const invalid = [];
    for (const original of customParts) {
      const extension = original.replace(/^\.+/, "").toLowerCase();
      if (!/^[a-z0-9][a-z0-9_-]{0,15}$/.test(extension)) {
        invalid.push(original);
        continue;
      }
      normalizedCustom.push(extension);
    }
    return {
      extensions: Array.from(new Set([...builtins, ...normalizedCustom])),
      invalid
    };
  }

  async function openFileAssociations() {
    const loadResult = await request("file_associations.get").catch(() => null);
    const saved = loadResult && Array.isArray(loadResult.extensions)
      ? loadResult.extensions
      : BUILTIN_FILE_EXTENSIONS;
    for (const checkbox of fileAssocCheckboxes) {
      checkbox.checked = saved.includes(checkbox.dataset.extension);
    }
    const customSaved = saved.filter(extension => !BUILTIN_FILE_EXTENSIONS.includes(extension));
    fileAssocCustom.value = customSaved.join(", ");
    fileAssocError.hidden = true;
    fileAssocError.textContent = "";

    const resultPromise = choiceModal("File Associations", "Choose which file types should be associated with RemoteHand Editor.", [
      {id:"cancel", label:"Cancel"},
      {id:"apply", label:"Apply", primary:true}
    ]);
    modalMessage.hidden = false;
    fileAssocSettings.hidden = false;

    const selectedAction = await resultPromise;
    if (selectedAction !== "apply") return;

    const selectedBuiltins = fileAssocCheckboxes
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.dataset.extension);
    const parsed = normalizeFileExtensions(selectedBuiltins, fileAssocCustom.value);
    if (parsed.invalid.length) {
      await messageModal("Invalid file extensions", "Please correct these entries: " + parsed.invalid.join(", ") + ". Use letters and numbers, optionally followed by hyphens or underscores, with no wildcard or path characters.");
      return openFileAssociations();
    }
    if (parsed.extensions.length > 64) {
      await messageModal("Too many file extensions", "Please select or enter no more than 64 file extensions.");
      return openFileAssociations();
    }
    try {
      await request("file_associations.set", {extensions:parsed.extensions});
      await messageModal("File associations updated", parsed.extensions.length
        ? "RemoteHand is registered to open: " + parsed.extensions.map(extension => "." + extension).join(", ") + ". Windows may still require you to choose RemoteHand as the default app."
        : "RemoteHand's file associations managed by this feature have been cleared.");
    } catch (error) {
      await messageModal("Could not update file associations", String(error));
    }
  }

  function closeModal(value = null) {
    fileAssocSettings.hidden = true;
    modalMessage.hidden = false;
    modalBackdrop.hidden = true;
    modalActions.replaceChildren();
    const resolve = modalResolve;
    modalResolve = null;
    if (resolve) resolve(value);
  }

  function choiceModal(title, message, choices) {
    if (modalResolve) closeModal(null);
    fileAssocSettings.hidden = true;
    modalMessage.hidden = false;
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalActions.replaceChildren();
    modalBackdrop.hidden = false;

    return new Promise(resolve => {
      modalResolve = resolve;
      for (const choice of choices) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = choice.label;
        if (choice.primary) button.classList.add("primary");
        if (choice.danger) button.classList.add("danger");
        button.addEventListener("click", () => closeModal(choice.id));
        modalActions.appendChild(button);
      }
    });
  }

  async function messageModal(title, message) {
    await choiceModal(title, message, [{id:"ok", label:"Close", primary:true}]);
  }

  document.getElementById("newBtn").addEventListener("click", () => newDocument());
  document.getElementById("openBtn").addEventListener("click", openFile);
  saveBtn.addEventListener("click", () => saveTab());
  saveAsBtn.addEventListener("click", () => saveAsTab());
  fileAssociationsBtn.addEventListener("click", () => { void openFileAssociations(); });
  document.getElementById("fileAssocSelectAll").addEventListener("click", () => {
    for (const checkbox of fileAssocCheckboxes) checkbox.checked = true;
  });
  document.getElementById("fileAssocDeselectAll").addEventListener("click", () => {
    for (const checkbox of fileAssocCheckboxes) checkbox.checked = false;
  });
  hexEditToggle.addEventListener("change", () => {
    if (hexEditToggle.checked) void enableHexEditing();
    else void disableHexEditing();
  });
  csvViewToggle.addEventListener("change", () => setCsvView(csvViewToggle.checked));
  mdPreviewToggle.addEventListener("change", () => setMarkdownPreview(mdPreviewToggle.checked));
  csvTableWrap.addEventListener("copy", event => {
    if (event.target && event.target.closest(".csv-cell-editor")) return;
    const tab = activeTab();
    if (!isCsvView(tab) || !event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", csvSelectionText(csvRowsFor(tab), tab));
  });

  csvTableWrap.addEventListener("cut", event => {
    if (event.target && event.target.closest(".csv-cell-editor")) return;
    const tab = activeTab();
    if (!isCsvView(tab) || !event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", csvSelectionText(csvRowsFor(tab), tab));
    clearCsvSelectionValues();
  });

  csvTableWrap.addEventListener("paste", event => {
    if (event.target && event.target.closest(".csv-cell-editor")) return;
    const tab = activeTab();
    if (!isCsvView(tab) || !event.clipboardData) return;
    event.preventDefault();
    pasteCsvGrid(event.clipboardData.getData("text/plain"));
  });

  document.getElementById("findBtn").addEventListener("click", () => openFind(false));
  document.getElementById("findPrev").addEventListener("click", findPrevious);
  document.getElementById("findNext").addEventListener("click", findNext);
  document.getElementById("findClose").addEventListener("click", () => closeFind(true));
  replaceOneBtn.addEventListener("click", replaceCurrent);
  replaceAllBtn.addEventListener("click", replaceAllMatches);

  wrapTextToggle.addEventListener("change", () => {
    wrapText = wrapTextToggle.checked;
    applyWrapTextState();
    schedulePersist();
  });

  lineNumbersToggle.addEventListener("change", () => {
    lineNumbers = lineNumbersToggle.checked;
    applyLineNumbersState();
    schedulePersist();
  });

  autocompleteToggle.addEventListener("change", () => {
    autocompleteEnabled = autocompleteToggle.checked;
    if (!autocompleteEnabled) closeCompletion(view);
    schedulePersist();
  });

  replaceToggle.addEventListener("change", syncReplaceMode);
  findInput.addEventListener("input", () => {
    clearBinaryFindMarks();
    updateFindCount();
  });

  function handleFindReplaceKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.ctrlKey && event.altKey) replaceAllMatches();
      else if (event.ctrlKey) replaceCurrent();
      else if (event.shiftKey) findPrevious();
      else findNext();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeFind(true);
    }
  }

  findInput.addEventListener("keydown", handleFindReplaceKeydown);
  replaceInput.addEventListener("keydown", handleFindReplaceKeydown);

  tabsHost.addEventListener("dblclick", event => {
    if (event.target !== tabsHost) return;
    event.preventDefault();
    newDocument();
  });

  editorHost.addEventListener("keydown", handleHexEditorKeydown, true);

  editorHost.addEventListener("mouseup", () => {
    const tab = activeTab();
    if (!tab || !tab.hexEditable) return;
    const selection = currentSelection();
    if (!selection.empty || hexNibbleAt(view.state, selection.head) || asciiCellAt(view.state, selection.head)) return;

    const line = view.state.doc.lineAt(Math.min(selection.head, view.state.doc.length));
    const column = selection.head - line.from;
    const preferAscii = column >= 60;
    const forward = preferAscii
      ? nextAsciiPosition(view.state, selection.head, 1)
      : nextHexNibblePosition(view.state, selection.head, 1);
    const backward = preferAscii
      ? nextAsciiPosition(view.state, selection.head, -1)
      : nextHexNibblePosition(view.state, selection.head, -1);
    const target = Math.abs(forward - selection.head) <= Math.abs(selection.head - backward)
      ? forward
      : backward;
    if (target !== selection.head) view.dispatch({selection:{anchor:target}});
  });

  window.addEventListener("mouseup", () => {
    csvMouseSelecting = false;
    requestAnimationFrame(() => {
      csvMouseMoved = false;
    });
  });

  document.addEventListener("mousedown", event => {
    const target = event.target;
    if (!csvContextMenu.hidden && !csvContextMenu.contains(target)) closeCsvContextMenu();
    if (findbar.hidden) return;
    if (findbar.contains(target) || document.getElementById("findBtn").contains(target)) return;
    closeFind(false);
  });

  modalBackdrop.addEventListener("mousedown", event => {
    if (event.target === modalBackdrop) closeModal(null);
  });

  window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();
    const mod = (event.ctrlKey || event.metaKey) && !event.altKey;

    if (event.key === "Escape" && !csvContextMenu.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeCsvContextMenu();
    } else if (mod && key === "tab") {
      event.preventDefault();
      event.stopPropagation();
      switchTab(event.shiftKey ? -1 : 1);
    } else if (isCsvView() && mod && !event.shiftKey && key === "z") {
      event.preventDefault();
      event.stopPropagation();
      if (undo(view)) renderCsvGrid();
    } else if (isCsvView() && ((mod && !event.shiftKey && key === "y") || (mod && event.shiftKey && key === "z"))) {
      event.preventDefault();
      event.stopPropagation();
      if (redo(view)) renderCsvGrid();
    } else if (mod && event.shiftKey && key === "s") {
      event.preventDefault();
      event.stopPropagation();
      void saveAsTab();
    } else if (mod && !event.shiftKey && key === "s") {
      event.preventDefault();
      event.stopPropagation();
      void saveTab();
    } else if (mod && !event.shiftKey && key === "w") {
      event.preventDefault();
      event.stopPropagation();
      void closeTab(activeId);
    } else if (mod && !event.shiftKey && key === "n") {
      event.preventDefault();
      event.stopPropagation();
      newDocument();
    } else if (mod && !event.shiftKey && key === "o") {
      event.preventDefault();
      event.stopPropagation();
      void openFile();
    } else if (mod && !event.shiftKey && key === "f") {
      event.preventDefault();
      event.stopPropagation();
      openFind(false);
    } else if (mod && !event.shiftKey && key === "h") {
      event.preventDefault();
      event.stopPropagation();
      openFind(true);
    } else if (mod && key === " " && !autocompleteEnabled) {
      event.preventDefault();
      event.stopPropagation();
      closeCompletion(view);
    } else if (event.key === "Escape" && !findbar.hidden) {
      event.preventDefault();
      closeFind(true);
    }
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void persistNow();
  });
  window.addEventListener("blur", () => {
    closeCsvContextMenu();
    void persistNow();
  });
  window.addEventListener("pagehide", () => void persistNow());
  window.addEventListener("resize", updateTabScrollButtons);

  if (window.remotehand && typeof window.remotehand.onEvent === "function") {
    window.remotehand.onEvent("files.drop", payload => {
      const paths = payload && Array.isArray(payload.paths)
        ? payload.paths.filter(path => typeof path === "string" && path.trim())
        : [];
      const point = payload && payload.position;

      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || paths.length === 0) {
        clearFileDropState();
        return;
      }

      const tabsRect = tabsShell.getBoundingClientRect();
      const overTabs = point.x >= tabsRect.left && point.x <= tabsRect.right &&
        point.y >= tabsRect.top && point.y <= tabsRect.bottom;
      clearFileDropState();

      if (overTabs) {
        if (paths.length !== 1) {
          if (paths.length > 1) void messageModal("Could not open files", "Drop one file at a time onto the Editor tab area.");
          return;
        }
        void openPath(paths[0]);
        return;
      }

      const editorRect = editorHost.getBoundingClientRect();
      const overEditor = point.x >= editorRect.left && point.x <= editorRect.right &&
        point.y >= editorRect.top && point.y <= editorRect.bottom;
      if (overEditor) insertDroppedPaths(paths);
    });
  }

  function handlePluginContext(context) {
    const path = context && typeof context.path === "string" ? context.path.trim() : "";
    if (!path) return;

    if (!sessionRestored) {
      pendingContextPath = path;
      return;
    }
    void openPath(path);
  }

  window.addEventListener("remotehand-plugin-context", event => {
    handlePluginContext(event.detail);
  });

  restoreSession().then(() => {
    sessionRestored = true;
    const initialPath = pendingContextPath ||
      (window.__REMOTEHAND_PLUGIN_CONTEXT__ && typeof window.__REMOTEHAND_PLUGIN_CONTEXT__.path === "string"
        ? window.__REMOTEHAND_PLUGIN_CONTEXT__.path.trim()
        : "");
    pendingContextPath = "";
    if (initialPath) void openPath(initialPath);
  });
})();
