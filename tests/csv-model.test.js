const test = require("node:test");
const assert = require("node:assert/strict");
const csv = require("../ui/csv-model.js");

test("parses quoted commas, escaped quotes, and multiline fields", () => {
  assert.deepEqual(
    csv.parse('name,notes\r\nPapa,"Manila, PH"\r\nMarielle,"Hello, ""Papa""\nAgain"'),
    [["name","notes"], ["Papa","Manila, PH"], ["Marielle",'Hello, "Papa"\nAgain']]
  );
});

test("does not add a phantom row for a trailing newline", () => {
  assert.deepEqual(csv.parse("a,b\r\n1,2\r\n"), [["a","b"], ["1","2"]]);
});

test("serializes using requested line ending and valid quoting", () => {
  assert.equal(
    csv.stringify([["name","notes"],["Papa","Manila, PH"],["Marielle",'Hello "Papa"']], "CRLF"),
    'name,notes\r\nPapa,"Manila, PH"\r\nMarielle,"Hello ""Papa"""'
  );
});

test("row and column operations preserve a rectangular model", () => {
  let rows = csv.normalize([["a","b"], ["1"]]);
  rows = csv.addColumn(rows);
  rows = csv.setCell(rows, 0, 2, "c");
  rows = csv.addRow(rows);
  rows = csv.setCell(rows, 2, 2, "3");
  assert.deepEqual(rows, [["a","b","c"], ["1","",""], ["","","3"]]);
  rows = csv.deleteRow(rows, 1);
  rows = csv.deleteColumn(rows, 1);
  assert.deepEqual(rows, [["a","c"], ["","3"]]);
});

test("header row cannot be deleted and at least one column remains", () => {
  assert.deepEqual(csv.deleteRow([["h"],["x"]], 0), [["h"],["x"]]);
  assert.deepEqual(csv.deleteColumn([["h"],["x"]], 0), [["h"],["x"]]);
});

test("rejects unclosed quoted fields", () => {
  assert.throws(() => csv.parse('a,"broken'), /Unclosed quoted field/);
});
