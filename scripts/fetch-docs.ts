import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

type Source =
  | { kind: "file"; out: string; url: string }
  | { kind: "html"; out: string; url: string }
  | { kind: "crawl"; dir: string; index: string; skip?: RegExp };

const SOURCES: Source[] = [
  { kind: "file", out: "meteora/llms.txt", url: "https://docs.meteora.ag/llms.txt" },
  { kind: "file", out: "meteora/llms-full.txt", url: "https://docs.meteora.ag/llms-full.txt" },
  {
    kind: "file",
    out: "meteora/dlmm-sdk.md",
    url: "https://raw.githubusercontent.com/MeteoraAg/dlmm-sdk/main/ts-client/README.md",
  },
  { kind: "file", out: "jupiter/llms.txt", url: "https://dev.jup.ag/llms.txt" },
  { kind: "file", out: "jupiter/llms-full.txt", url: "https://dev.jup.ag/llms-full.txt" },
  { kind: "file", out: "effect/LLMS.md", url: "https://raw.githubusercontent.com/Effect-TS/effect-smol/main/LLMS.md" },
  {
    kind: "crawl",
    dir: "tanstack-start",
    index: "https://tanstack.com/start/latest/llms.txt",
    skip: /\/(solid|examples)\//,
  },
  {
    kind: "crawl",
    dir: "tanstack-router",
    index: "https://tanstack.com/router/latest/llms.txt",
    skip: /\/(solid|examples)\//,
  },
  { kind: "file", out: "shadcn/llms.txt", url: "https://ui.shadcn.com/llms.txt" },
  { kind: "file", out: "zod/llms-full.txt", url: "https://zod.dev/llms-full.txt" },
  { kind: "file", out: "react-hook-form/llms.txt", url: "https://react-hook-form.com/llms.txt" },
  { kind: "file", out: "zustand/llms.txt", url: "https://zustand.docs.pmnd.rs/llms.txt" },
  { kind: "file", out: "bun/llms.txt", url: "https://bun.com/llms.txt" },
  { kind: "html", out: "telegram/mini-apps.md", url: "https://core.telegram.org/bots/webapps" },
];

const root = join(import.meta.dir, "..", "docs");

async function get(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function save(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, text);
}

// core.telegram.org has no Markdown export; keep headings, paragraphs, and code.
function htmlToText(html: string) {
  const body = html.match(/<div id="dev_page_content">([\s\S]*)<\/div>\s*<\/div>\s*<\/div>/)?.[1] ?? html;
  return body
    .replace(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/g, (_, n, t) => `\n${"#".repeat(Number(n))} ${t}\n`)
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/g, "\n```\n$1\n```\n")
    .replace(/<(br|\/p|\/li|\/tr)[^>]*>/g, "\n")
    .replace(/<li[^>]*>/g, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function crawl({ dir, index, skip }: Extract<Source, { kind: "crawl" }>) {
  const text = await get(index);
  await save(join(root, dir, "llms.txt"), text);
  const base = new URL(index).pathname.replace(/llms\.txt$/, "");
  const pages = [...new Set([...text.matchAll(/\((https:\/\/tanstack\.com[^)]+\.md)\)/g)].map((m) => m[1] as string))]
    .filter((url) => !skip?.test(url))
    .filter((url) => !url.endsWith("/docs/index.md"));
  const failed: string[] = [];
  for (let i = 0; i < pages.length; i += 8) {
    await Promise.all(
      pages.slice(i, i + 8).map(async (url) => {
        try {
          await save(join(root, dir, new URL(url).pathname.slice(base.length)), await get(url));
        } catch {
          failed.push(url);
        }
      }),
    );
  }
  return `${dir}: ${pages.length - failed.length}/${pages.length} pages${failed.length ? `, failed: ${failed.join(" ")}` : ""}`;
}

async function fetchSource(source: Source) {
  if (source.kind === "crawl") return crawl(source);
  const text = await get(source.url);
  await save(join(root, source.out), source.kind === "html" ? htmlToText(text) : text);
  return `${source.out}: ${(text.length / 1024).toFixed(0)} KB`;
}

for (const source of SOURCES) {
  const out = source.kind === "crawl" ? source.dir : source.out;
  await rm(join(root, out), { recursive: true, force: true });
}
const results = await Promise.allSettled(SOURCES.map(fetchSource));
for (const r of results) console.log(r.status === "fulfilled" ? r.value : `FAILED ${r.reason}`);
