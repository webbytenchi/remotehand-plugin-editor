(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RemoteHandCsv = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function parse(text) {
    const source = String(text == null ? "" : text);
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (quoted) {
        if (ch === '"') {
          if (source[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            quoted = false;
          }
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === '"' && field.length === 0) {
        quoted = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\r" || ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        if (ch === "\r" && source[i + 1] === "\n") i++;
      } else {
        field += ch;
      }
    }

    if (quoted) throw new Error("Unclosed quoted field.");
    if (field.length > 0 || row.length > 0 || source.endsWith(",")) {
      row.push(field);
      rows.push(row);
    }

    if (rows.length === 0) rows.push([""]);
    return rows;
  }

  function escapeField(value) {
    const text = String(value == null ? "" : value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function stringify(rows, eol) {
    const newline = eol === "CRLF" || eol === "\r\n" ? "\r\n" : "\n";
    return (Array.isArray(rows) ? rows : [])
      .map(row => (Array.isArray(row) ? row : []).map(escapeField).join(","))
      .join(newline);
  }

  function columnCount(rows) {
    return Math.max(1, ...(Array.isArray(rows) ? rows : []).map(row => Array.isArray(row) ? row.length : 0));
  }

  function normalize(rows) {
    const source = Array.isArray(rows) && rows.length ? rows : [[""]];
    const width = columnCount(source);
    return source.map(row => {
      const next = Array.isArray(row) ? row.slice(0, width).map(value => String(value == null ? "" : value)) : [];
      while (next.length < width) next.push("");
      return next;
    });
  }

  function addRow(rows, index) {
    const next = normalize(rows);
    const row = Array(columnCount(next)).fill("");
    const target = Number.isInteger(index) ? Math.max(1, Math.min(index, next.length)) : next.length;
    next.splice(target, 0, row);
    return next;
  }

  function deleteRow(rows, index) {
    const next = normalize(rows);
    if (!Number.isInteger(index) || index <= 0 || index >= next.length) return next;
    next.splice(index, 1);
    if (next.length === 0) next.push([""]);
    return next;
  }

  function addColumn(rows, index) {
    const next = normalize(rows);
    const width = columnCount(next);
    const target = Number.isInteger(index) ? Math.max(0, Math.min(index, width)) : width;
    for (const row of next) row.splice(target, 0, "");
    return next;
  }

  function deleteColumn(rows, index) {
    const next = normalize(rows);
    const width = columnCount(next);
    if (!Number.isInteger(index) || index < 0 || index >= width || width <= 1) return next;
    for (const row of next) row.splice(index, 1);
    return next;
  }

  function setCell(rows, rowIndex, columnIndex, value) {
    const next = normalize(rows);
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= next.length) return next;
    if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= next[rowIndex].length) return next;
    next[rowIndex][columnIndex] = String(value == null ? "" : value);
    return next;
  }

  return {parse, stringify, normalize, columnCount, addRow, deleteRow, addColumn, deleteColumn, setCell};
});
