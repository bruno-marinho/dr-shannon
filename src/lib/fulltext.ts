import { extractText, getDocumentProxy } from "unpdf";

// How much extracted text we hand to the reading call. ~150k chars is
// roughly 40k tokens — enough for the full body of almost any paper while
// bounding the cost and latency of a single reading call.
const MAX_CHARS = 150_000;

export interface FullText {
  source: "html" | "pdf";
  text: string;
}

// Strips an arXiv HTML page (LaTeXML output) down to readable text. Crude
// tag-stripping is deliberate: the reading model tolerates leftover
// boilerplate far better than this MVP needs a real HTML parser.
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|nav|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Fetches a paper's full text: arXiv's HTML rendering first (available
// for most papers submitted since late 2023), PDF extraction as fallback.
// Returns null when both fail — the caller falls back to the abstract and
// Dr. Shannon discloses that in his note.
export async function fetchFullText(arxivId: string): Promise<FullText | null> {
  try {
    const res = await fetch(`https://arxiv.org/html/${arxivId}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const text = htmlToText(await res.text());
      // A tiny result means the HTML page exists but is a stub/error page.
      if (text.length > 2000) {
        return { source: "html", text: text.slice(0, MAX_CHARS) };
      }
    }
  } catch {}

  try {
    const res = await fetch(`https://arxiv.org/pdf/${arxivId}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
      const { text } = await extractText(pdf, { mergePages: true });
      const cleaned = text.replace(/\s+/g, " ").trim();
      if (cleaned.length > 2000) {
        return { source: "pdf", text: cleaned.slice(0, MAX_CHARS) };
      }
    }
  } catch {}

  return null;
}
