const test = require("node:test");
const assert = require("node:assert/strict");
const markdown = require("../ui/markdown-model.js");

test("renders common Markdown blocks", () => {
  const html = markdown.render("# Title\n\n- one\n- two\n\n**bold** and `code`");
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<ul>[\s\S]*<li>one<\/li>[\s\S]*<li>two<\/li>[\s\S]*<\/ul>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
});

test("escapes raw HTML instead of executing it", () => {
  const html = markdown.render('<script>alert("x")<\/script>');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("blocks unsafe links", () => {
  const html = markdown.render("[bad](javascript:alert(1)) [good](https://example.com)");
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /href="https:\/\/example\.com"/);
});
