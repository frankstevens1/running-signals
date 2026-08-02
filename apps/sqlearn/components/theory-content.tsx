import { codeToHtml } from "shiki";

interface TheoryContentProps {
  content: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderMarkdown(md: string): Promise<string> {
  const lines = md.split("\n");
  const blocks: { type: string; content: string }[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim() || "text";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      const code = codeLines.join("\n");
      const html = await codeToHtml(code, {
        lang: lang === "sql" ? "sql" : "text",
        theme: "dark-plus",
      });
      blocks.push({ type: "code", content: html });
      continue;
    }

    if (/^#{1,4} /.test(line)) {
      const match = line.match(/^(#{1,4}) (.+)$/);
      if (match) {
        const level = match[1].length;
        blocks.push({ type: `h${level}`, content: match[2] });
      }
      i++;
      continue;
    }

    if (line.startsWith("---")) {
      blocks.push({ type: "hr", content: "" });
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: "blockquote", content: quoteLines.join("\n") });
      continue;
    }

    if (line.match(/^[\*\-] /)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^[\*\-] /)) {
        listItems.push(lines[i].replace(/^[\*\-] /, ""));
        i++;
      }
      blocks.push({ type: "ul", content: listItems.join("\n") });
      continue;
    }

    if (line.match(/^\d+\. /)) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        listItems.push(lines[i].replace(/^\d+\. /, ""));
        i++;
      }
      blocks.push({ type: "ol", content: listItems.join("\n") });
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("```") && !lines[i].startsWith("#") && !lines[i].startsWith(">") && !lines[i].match(/^[\*\-] /) && !lines[i].match(/^\d+\. /) && lines[i] !== "---") {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", content: paraLines.join(" ") });
  }

  const parts: string[] = [];

  for (const block of blocks) {
    let inline = block.content;

    if (block.type !== "code") {
      inline = inline.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
      inline = inline.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      inline = inline.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");
    }

    if (block.type === "h1") {
      parts.push(`<h2 class="theory-h2">${inline}</h2>`);
    } else if (block.type === "h2") {
      parts.push(`<h2 class="theory-h2">${inline}</h2>`);
    } else if (block.type === "h3") {
      parts.push(`<h3 class="theory-h3">${inline}</h3>`);
    } else if (block.type === "h4") {
      parts.push(`<h4 class="theory-h4">${inline}</h4>`);
    } else if (block.type === "p") {
      parts.push(`<p class="theory-p">${inline}</p>`);
    } else if (block.type === "ul") {
      const items = inline.split("\n").map((item) => `<li class="theory-li">${item}</li>`).join("");
      parts.push(`<ul class="theory-ul">${items}</ul>`);
    } else if (block.type === "ol") {
      const items = inline.split("\n").map((item) => `<li class="theory-li">${item}</li>`).join("");
      parts.push(`<ol class="theory-ol">${items}</ol>`);
    } else if (block.type === "blockquote") {
      parts.push(`<blockquote class="theory-blockquote"><p>${inline}</p></blockquote>`);
    } else if (block.type === "hr") {
      parts.push('<hr class="theory-hr">');
    } else if (block.type === "code") {
      parts.push(`<div class="code-block-wrapper">${inline}</div>`);
    }
  }

  return parts.join("\n");
}

export default async function TheoryContent({ content }: TheoryContentProps) {
  const html = await renderMarkdown(content);

  return (
    <div
      className="theory-root"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
