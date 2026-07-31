import { codeToHtml } from "shiki";

export async function CodeBlock({ code, lang = "sql" }: { code: string; lang?: string }) {
  const html = await codeToHtml(code, {
    lang,
    theme: "dark-plus",
  });

  return (
    <div
      className="overflow-auto border border-(--border) bg-[#1E1E1E] [&_pre]:p-5 [&_pre]:text-[13px] [&_pre]:leading-relaxed [&_code]:font-mono [&_.line]:min-h-[1.375rem]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
