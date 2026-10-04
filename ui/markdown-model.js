(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RemoteHandMarkdown = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeHref(value) {
    const href = String(value || "").trim();
    if (!href) return "";
    if (/^(https?:|mailto:|#)/i.test(href)) return escapeHtml(href);
    return "";
  }

  function renderInline(value) {
    let text = escapeHtml(value);
    const code = [];
    text = text.replace(/`([^`]+)`/g, (_, body) => {
      const index = code.push("<code>" + body + "</code>") - 1;
      return "\u0000CODE" + index + "\u0000";
    });
    text = text
      .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, href) => {
        const safe = safeHref(href);
        return safe ? '<img src="' + safe + '" alt="' + alt + '">' : alt;
      })
      .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, href) => {
        const safe = safeHref(href);
        return safe ? '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + label + "</a>" : label;
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
    text = text.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => code[Number(index)] || "");
    return text;
  }

  function render(markdown) {
    const lines = String(markdown == null ? "" : markdown).replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let paragraph = [];
    let listType = "";
    let inFence = false;
    let fence = [];

    function flushParagraph() {
      if (!paragraph.length) return;
      out.push("<p>" + renderInline(paragraph.join(" ")) + "</p>");
      paragraph = [];
    }

    function closeList() {
      if (!listType) return;
      out.push("</" + listType + ">");
      listType = "";
    }

    for (const line of lines) {
      if (/^\s*```/.test(line)) {
        flushParagraph();
        closeList();
        if (inFence) {
          out.push("<pre><code>" + escapeHtml(fence.join("\n")) + "</code></pre>");
          fence = [];
          inFence = false;
        } else {
          inFence = true;
        }
        continue;
      }

      if (inFence) {
        fence.push(line);
        continue;
      }

      if (!line.trim()) {
        flushParagraph();
        closeList();
        continue;
      }

      const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        closeList();
        const level = heading[1].length;
        out.push("<h" + level + ">" + renderInline(heading[2].trim()) + "</h" + level + ">");
        continue;
      }

      if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
        flushParagraph();
        closeList();
        out.push("<hr>");
        continue;
      }

      const quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) {
        flushParagraph();
        closeList();
        out.push("<blockquote><p>" + renderInline(quote[1]) + "</p></blockquote>");
        continue;
      }

      const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        flushParagraph();
        const nextType = ordered ? "ol" : "ul";
        if (listType !== nextType) {
          closeList();
          listType = nextType;
          out.push("<" + listType + ">");
        }
        out.push("<li>" + renderInline((unordered || ordered)[1]) + "</li>");
        continue;
      }

      closeList();
      paragraph.push(line.trim());
    }

    if (inFence) {
      flushParagraph();
      closeList();
      out.push("<pre><code>" + escapeHtml(fence.join("\n")) + "</code></pre>");
    } else {
      flushParagraph();
      closeList();
    }

    return out.join("\n");
  }

  return {render, escapeHtml, safeHref};
});
