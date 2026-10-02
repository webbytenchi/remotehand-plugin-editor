import {EditorView, basicSetup} from "codemirror";
import {EditorState, Compartment, Prec} from "@codemirror/state";
import {keymap} from "@codemirror/view";
import {HighlightStyle, syntaxHighlighting} from "@codemirror/language";
import {tags} from "@lezer/highlight";
import {languages} from "@codemirror/language-data";

(() => {
  const request = (method, params = null) => window.remotehand.request(method, params);

  const tabsShell = document.getElementById("tabsShell");
  const tabsHost = document.getElementById("tabs");
  const tabsPrev = document.getElementById("tabsPrev");
  const tabsNext = document.getElementById("tabsNext");
  const editorHost = document.getElementById("editorHost");
  const empty = document.getElementById("empty");
  const wrapTextToggle = document.getElementById("wrapText");
  const lineNumbersToggle = document.getElementById("lineNumbers");
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
    const ext = (String(name).match(/\.([^.]+)$/) || [,""])[1].toLowerCase();
    return ({
      txt:"Plain Text", log:"Log", md:"Markdown",
      json:"JSON", yaml:"YAML", yml:"YAML", toml:"TOML", ini:"INI",
      xml:"XML", html:"HTML", htm:"HTML", css:"CSS",
      js:"JavaScript", jsx:"JavaScript", ts:"TypeScript", tsx:"TypeScript",
      py:"Python", rs:"Rust", go:"Go", c:"C", h:"C/C++",
      cpp:"C++", hpp:"C++", cs:"C#", java:"Java", sh:"Shell",
      ps1:"PowerShell"
    })[ext] || "Plain Text";
  }

  function activeTab() {
    return tabs.find(tab => tab.id === activeId) || null;
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
      tab.eol = detectEol(tab.content);
      renderTabs();
      updateSaveState();
      eol.textContent = tab.eol;
    }

    updatePosition();
    if (!findbar.hidden) updateFindCount();
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

    const description = matchingLanguage(tab.name);
    if (!description || typeof description.load !== "function") return;

    try {
      const support = await description.load();
      if (token !== languageLoadToken || activeId !== tab.id) return;
      view.dispatch({effects:languageCompartment.reconfigure(support)});
      tab.cmState = view.state;
    } catch (error) {
      console.warn("Editor language mode failed to load:", tab.name, error);
    }
  }

  function updatePosition() {
    const tab = activeTab();
    if (!tab) {
      position.textContent = "Ln 1, Col 1";
      return;
    }
    const head = editorCursor();
    const lineInfo = view.state.doc.lineAt(head);
    tab.cursor = head;
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
      version:2,
      activeId,
      untitledCounter,
      wrapText,
      lineNumbers,
      tabs:tabs.map(tab => ({
        id:tab.id,
        name:tab.name,
        path:tab.path,
        content:tab.content,
        savedContent:typeof tab.savedContent === "string" ? tab.savedContent : "",
        dirty:Boolean(tab.dirty),
        encoding:tab.encoding || "UTF-8",
        bom:Boolean(tab.bom),
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
    wrapTextToggle.checked = wrapText;
    lineNumbersToggle.checked = lineNumbers;
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
      encoding:"UTF-8",
      bom:Boolean(raw.bom),
      eol:raw.eol === "CRLF" ? "CRLF" : detectEol(String(raw.content || "")),
      cursor:Math.max(0, Number(raw.cursor) || 0),
      cmState:null
    }));

    for (const tab of tabs) {
      if (!tab.path) continue;
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
    editorHost.hidden = !hasTab;
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

    encoding.textContent = tab.encoding || "UTF-8";
    eol.textContent = tab.eol || detectEol(tab.content);
    language.textContent = languageInfo(tab.name);
    updateSaveState();
    updatePosition();
    void applyLanguageForActiveTab();

    requestAnimationFrame(() => view.focus());
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
      eol:result.eol || detectEol(result.content || ""),
      cursor:0,
      cmState:null
    };
    saveActiveEditorState();
    tabs.push(tab);
    activeId = tab.id;
    render();
    return true;
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
      if (activateOpenedFile(result)) await persistNow();
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
      activateOpenedFile(result);
    } catch (error) {
      await messageModal("Could not open file", String(error));
    } finally {
      nativeDialogPending = false;
      await persistNow();
    }
  }

  async function saveTab(tab = activeTab()) {
    if (!tab) return false;
    if (tab.id === activeId) saveActiveEditorState();
    if (!tab.path) return saveAsTab(tab);

    try {
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

  function findMatches(query) {
    const text = editorText();
    if (!query) return [];
    const haystack = text.toLocaleLowerCase();
    const needle = query.toLocaleLowerCase();
    const matches = [];
    let index = 0;

    while ((index = haystack.indexOf(needle, index)) >= 0) {
      matches.push(index);
      index += Math.max(1, needle.length);
    }
    return matches;
  }

  function updateFindCount(query = findInput.value) {
    const matches = findMatches(query);
    const hasMatches = Boolean(query) && matches.length > 0;
    replaceOneBtn.disabled = !hasMatches;
    replaceAllBtn.disabled = !hasMatches;

    if (!query) {
      findCount.textContent = "0 of 0";
      return matches;
    }
    if (matches.length === 0) {
      findCount.textContent = "No matches";
      return matches;
    }

    const selection = currentSelection();
    let current = matches.findIndex(index => index === selection.from);
    if (current < 0) current = 0;
    findCount.textContent = (current + 1) + " of " + matches.length;
    return matches;
  }

  function openFind(replaceMode = false) {
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
    if (focusEditor) view.focus();
  }

  function syncReplaceMode() {
    replaceRow.hidden = !replaceToggle.checked;
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

    if (direction > 0) {
      target = matches.find(index => index >= selection.to);
      if (target === undefined) target = matches[0];
    } else {
      for (let i = matches.length - 1; i >= 0; i--) {
        if (matches[i] < selection.from) {
          target = matches[i];
          break;
        }
      }
      if (target === undefined) target = matches[matches.length - 1];
    }

    view.dispatch({
      selection:{anchor:target, head:target + query.length},
      effects:EditorView.scrollIntoView(target, {y:"center"})
    });
    updateFindCount(query);
    findInput.focus({preventScroll:true});
  }

  function findNext() { findMove(1); }
  function findPrevious() { findMove(-1); }

  function selectionMatchesFind() {
    const query = findInput.value;
    if (!query) return false;
    const selection = currentSelection();
    const selected = view.state.doc.sliceString(selection.from, selection.to);
    return selected.toLocaleLowerCase() === query.toLocaleLowerCase();
  }

  function replaceCurrent() {
    const query = findInput.value;
    if (!query) return;

    if (!selectionMatchesFind()) findNext();
    if (!selectionMatchesFind()) return;

    const selection = currentSelection();
    const replacement = replaceInput.value;
    view.dispatch({
      changes:{from:selection.from, to:selection.to, insert:replacement},
      selection:{anchor:selection.from + replacement.length}
    });

    findNext();
    if (findMatches(query).length === 0) view.focus();
  }

  function replaceAllMatches() {
    const query = findInput.value;
    if (!query) return;

    const matches = findMatches(query);
    if (matches.length === 0) {
      updateFindCount(query);
      return;
    }

    const replacement = replaceInput.value;
    const changes = matches.map(index => ({from:index, to:index + query.length, insert:replacement}));
    view.dispatch({changes});
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

  function closeModal(value = null) {
    modalBackdrop.hidden = true;
    modalActions.replaceChildren();
    const resolve = modalResolve;
    modalResolve = null;
    if (resolve) resolve(value);
  }

  function choiceModal(title, message, choices) {
    if (modalResolve) closeModal(null);
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
  document.getElementById("saveBtn").addEventListener("click", () => saveTab());
  document.getElementById("saveAsBtn").addEventListener("click", () => saveAsTab());
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

  replaceToggle.addEventListener("change", syncReplaceMode);
  findInput.addEventListener("input", () => updateFindCount());

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

  document.addEventListener("mousedown", event => {
    if (findbar.hidden) return;
    const target = event.target;
    if (findbar.contains(target) || document.getElementById("findBtn").contains(target)) return;
    closeFind(false);
  });

  modalBackdrop.addEventListener("mousedown", event => {
    if (event.target === modalBackdrop) closeModal(null);
  });

  window.addEventListener("keydown", event => {
    const target = event.target;
    const inEditor = target instanceof Node && editorHost.contains(target);
    if (inEditor) return;

    const key = event.key.toLowerCase();
    if (event.ctrlKey && key === "tab") {
      event.preventDefault();
      switchTab(event.shiftKey ? -1 : 1);
    } else if (event.ctrlKey && !event.shiftKey && key === "w") {
      event.preventDefault();
      void closeTab(activeId);
    } else if (event.ctrlKey && !event.shiftKey && key === "n") {
      event.preventDefault();
      newDocument();
    } else if (event.ctrlKey && !event.shiftKey && key === "o") {
      event.preventDefault();
      void openFile();
    } else if (event.ctrlKey && !event.shiftKey && key === "s") {
      event.preventDefault();
      void saveTab();
    } else if (event.ctrlKey && event.shiftKey && key === "s") {
      event.preventDefault();
      void saveAsTab();
    } else if (event.ctrlKey && !event.shiftKey && key === "f") {
      event.preventDefault();
      openFind(false);
    } else if (event.ctrlKey && !event.shiftKey && key === "h") {
      event.preventDefault();
      openFind(true);
    } else if (event.key === "Escape" && !findbar.hidden) {
      event.preventDefault();
      closeFind(true);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void persistNow();
  });
  window.addEventListener("blur", () => void persistNow());
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
