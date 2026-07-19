// Pre-build probe for the full-paper reading redesign (Phase 3.5).
// Answers two questions before any code is written:
//   1. What fraction of a realistic corpus has an arXiv HTML rendering
//      (arxiv.org/html/<id>), and does the PDF exist as fallback?
//   2. How long does one full-paper reading call take (fetch + extract +
//      one LLM call producing ~500-word notes) — does it fit a serverless
//      function budget?
// Run with `npx tsx scripts/probe-fulltext.ts`.
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { generateResearchPlan } = await import("../src/lib/anthropic");
  const { searchArxiv } = await import("../src/lib/arxiv");
  const { rankByRelevance } = await import("../src/lib/relevance");
  const Anthropic = (await import("@anthropic-ai/sdk")).default;

  // Build a realistic corpus the same way the app does.
  const plan = await generateResearchPlan(
    "Our support team wants to use LLMs for customer answers, but we can't tolerate hallucinated responses — how are teams making this reliable?",
  );
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - plan.dateRangeMonths);
  const dateRange = { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };

  let papers: Awaited<ReturnType<typeof searchArxiv>> = [];
  for (const s of plan.searchStrings) {
    const candidates = await searchArxiv(s, plan.arxivCategories, dateRange);
    if (candidates.length > 0) {
      papers = rankByRelevance(candidates, s);
      break;
    }
  }
  console.log(`corpus: ${papers.length} papers\n`);

  // --- Probe 1: HTML + PDF availability for every paper ---
  console.log("=== availability ===");
  const availability: { id: string; html: boolean; pdf: boolean; htmlChars?: number }[] = [];
  for (const p of papers) {
    const htmlUrl = `https://arxiv.org/html/${p.arxivId}`;
    const pdfUrl = `https://arxiv.org/pdf/${p.arxivId}`;
    let html = false;
    let htmlChars: number | undefined;
    try {
      const res = await fetch(htmlUrl, { signal: AbortSignal.timeout(15000) });
      html = res.ok;
      if (res.ok) htmlChars = (await res.text()).length;
    } catch {}
    let pdf = false;
    try {
      const res = await fetch(pdfUrl, { method: "HEAD", signal: AbortSignal.timeout(15000) });
      pdf = res.ok;
    } catch {}
    availability.push({ id: p.arxivId, html, pdf, htmlChars });
    console.log(
      `  ${p.arxivId}: html=${html}${htmlChars ? ` (${Math.round(htmlChars / 1000)}k chars)` : ""} pdf=${pdf}`,
    );
    // Be polite to arXiv: small gap between fetches.
    await new Promise((r) => setTimeout(r, 500));
  }
  const htmlCount = availability.filter((a) => a.html).length;
  const pdfOnly = availability.filter((a) => !a.html && a.pdf).length;
  const neither = availability.filter((a) => !a.html && !a.pdf).length;
  console.log(`\nHTML: ${htmlCount}/${papers.length}, PDF-only: ${pdfOnly}, neither: ${neither}`);

  // --- Probe 2: time one full reading call on the first HTML paper ---
  const target = papers[availability.findIndex((a) => a.html)];
  if (!target) {
    console.log("no HTML paper to probe timing with");
    return;
  }
  console.log(`\n=== reading-call timing (${target.arxivId}) ===`);

  let t0 = Date.now();
  const htmlRes = await fetch(`https://arxiv.org/html/${target.arxivId}`, {
    signal: AbortSignal.timeout(15000),
  });
  const rawHtml = await htmlRes.text();
  const fetchMs = Date.now() - t0;

  // Crude extraction for the probe: strip tags, collapse whitespace, cap.
  const text = rawHtml
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120_000);
  console.log(`fetch: ${fetchMs}ms, extracted ${Math.round(text.length / 1000)}k chars`);

  const client = new Anthropic();
  t0 = Date.now();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system:
      "You are reading a full research paper and producing structured reading notes (~500 words): method, findings, key numbers, limitations. Plain prose, no headings.",
    messages: [{ role: "user", content: `Paper title: ${target.title}\n\nFull text:\n${text}` }],
  });
  const llmMs = Date.now() - t0;
  const notes = response.content.find((b) => b.type === "text");
  console.log(
    `LLM call: ${llmMs}ms (input ${response.usage.input_tokens} tokens, output ${response.usage.output_tokens})`,
  );
  console.log(`total per-paper: ~${fetchMs + llmMs}ms`);
  console.log(`\nNOTES PREVIEW:\n${notes?.type === "text" ? notes.text.slice(0, 600) : "?"}...`);
}

main().catch((err) => {
  console.error("probe failed:", err);
  process.exit(1);
});
