// Standalone verification for the reading + specialization stages: runs
// the full pipeline (plan → search ladder → rank → per-paper reading →
// specialization from notes) for one problem and prints two full reading
// notes plus the blurb, so voice and grounding can be reviewed before
// wiring changes ship. Run with `npm run verify:specialization`.
import { config } from "dotenv";
config({ path: ".env.local" });

const READ_CONCURRENCY = 4;

async function main() {
  // Dynamic imports so dotenv runs before the Anthropic client module loads.
  const { generateResearchPlan, generateReadingNotes, generateSpecialization } =
    await import("../src/lib/anthropic");
  const { searchArxiv } = await import("../src/lib/arxiv");
  const { rankByRelevance } = await import("../src/lib/relevance");
  const { fetchFullText } = await import("../src/lib/fulltext");

  const problem =
    "Our support team wants to use LLMs for customer answers, but we can't tolerate hallucinated responses — how are teams making this reliable?";
  console.log(`PROBLEM: ${problem}\n`);

  const plan = await generateResearchPlan(problem);
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - plan.dateRangeMonths);
  const dateRange = {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };

  let papers: Awaited<ReturnType<typeof searchArxiv>> = [];
  for (const searchString of plan.searchStrings) {
    const candidates = await searchArxiv(searchString, plan.arxivCategories, dateRange);
    if (candidates.length > 0) {
      papers = rankByRelevance(candidates, searchString);
      break;
    }
  }
  console.log(`corpus: ${papers.length} papers`);

  // Reading stage, same shape as the client orchestration.
  const t0 = Date.now();
  const notes: { source: string; notes: string }[] = new Array(papers.length);
  let next = 0;
  async function worker() {
    while (next < papers.length) {
      const i = next++;
      const p = papers[i];
      const fullText = await fetchFullText(p.arxivId);
      const source = fullText?.source ?? "abstract";
      const text = fullText?.text ?? p.abstract;
      notes[i] = { source, notes: await generateReadingNotes(p, source, text) };
      console.log(`  read [${i + 1}] ${p.arxivId} (${source})`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, papers.length) }, worker));
  console.log(`reading stage: ${Math.round((Date.now() - t0) / 1000)}s total`);

  const sources = notes.map((n) => n.source);
  console.log(
    `sources: ${sources.filter((s) => s === "html").length} html, ${sources.filter((s) => s === "pdf").length} pdf, ${sources.filter((s) => s === "abstract").length} abstract-only\n`,
  );

  for (const i of [0, Math.min(1, notes.length - 1)]) {
    console.log(`=== READING NOTES [${i + 1}] ${papers[i].title} (${notes[i].source}) ===`);
    console.log(notes[i].notes);
    console.log();
  }

  const specialization = await generateSpecialization(
    plan.researchQuestion,
    papers.map((p, i) => ({ title: p.title, notes: notes[i].notes })),
  );
  console.log(`=== SPECIALIZATION BLURB ===\n${specialization}`);
}

main().catch((err) => {
  console.error("verify-specialization failed:", err);
  process.exit(1);
});
