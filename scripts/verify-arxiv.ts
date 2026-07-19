// Standalone verification for lib/arxiv.ts + lib/relevance.ts, run against
// the real arXiv API before any LLM step exists (Phase 1, per CLAUDE.md).
// This is a manual diagnostic script, not part of the app — run it with
// `npm run verify:arxiv`.
//
// Risk being de-risked here: arXiv's search_query/date-range syntax is easy
// to get subtly wrong with no helpful error from the API (see CLAUDE.md
// "Riskiest points"). Case 2 below intentionally sends an over-narrow query
// to confirm searchArxiv degrades to an empty array instead of throwing or
// hanging.
import { searchArxiv } from "../src/lib/arxiv";
import { rankByRelevance } from "../src/lib/relevance";

async function run(
  label: string,
  searchStrings: string[],
  dateRange: { from: string; to: string },
) {
  console.log(`\n=== ${label} ===`);
  console.log("search strings:", searchStrings);
  console.log("date range:", dateRange);

  const candidates = await searchArxiv(searchStrings, dateRange);
  console.log(`arXiv returned ${candidates.length} raw candidate(s)`);

  const top = rankByRelevance(candidates, searchStrings);
  console.log(`top ${top.length} after relevance ranking:`);
  top.forEach((p, i) => {
    console.log(`  [${i + 1}] ${p.title} (${p.publishedDate})`);
    console.log(`      ${p.link}`);
  });
}

async function main() {
  // Case 1: a frontier AI/ML topic arXiv covers well, wide date range.
  await run(
    "well-covered topic, wide date range",
    ["LLM hallucination detection", "retrieval augmented generation reliability"],
    { from: "2023-01-01", to: "2026-07-19" },
  );

  // Case 2: Risk 1 failure mode — an over-narrow, made-up phrase combined
  // with a one-day date range. Expected: few or zero results, no crash.
  await run(
    "over-narrow query, one-day range (expected few/zero results)",
    ["zzflorbnitz quantum toaster scheduling heuristics"],
    { from: "2026-07-18", to: "2026-07-19" },
  );
}

main().catch((err) => {
  console.error("verify-arxiv failed:", err);
  process.exit(1);
});
