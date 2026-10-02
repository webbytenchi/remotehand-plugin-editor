  editorHost.addEventListener("mouseup", () => {
    const tab = activeTab();
    if (!tab || !tab.hexEditable) return;
    const selection = currentSelection();
    if (!selection.empty || hexNibbleAt(view.state, selection.head) || asciiCellAt(view.state, selection.head)) return;

    const forward = nextHexNibblePosition(view.state, selection.head, 1);
    const backward = nextHexNibblePosition(view.state, selection.head, -1);
    const target = Math.abs(forward - selection.head) <= Math.abs(selection.head - backward)
      ? forward
      : backward;
    if (target !== selection.head) view.dispatch({selection:{anchor:target}});
  });