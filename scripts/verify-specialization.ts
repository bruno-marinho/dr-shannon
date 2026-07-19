// Standalone verification for the Phase 3 specialization synthesis: runs
// the full pipeline (plan → search ladder → rank) for two problems — one
// with a rich corpus, one with a thin one — and prints the synthesized
// blurb so the voice can be reviewed before wiring into the UI.
// Run with `npm run verify:specialization`.
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  // Dynamic imports so dotenv runs before the Anthropic client module loads.
  const { generateResearchPlan, generateSpecialization } = await import("../src/lib/anthropic");
  const { searchArxiv } = await import("../src/lib/arxiv");
  const { rankByRelevance } = await import("../src/lib/relevance");

  const PROBLEMS = [
    // Rich corpus expected:
    "Our support team wants to use LLMs for customer answers, but we can't tolerate hallucinated responses — how are teams making this reliable?",
    // Thin corpus expected (2-3 papers in Phase 2 testing):
    "Our subscription churn spikes whenever we raise prices, and we don't know why.",
  ];

  for (const problem of PROBLEMS) {
    console.log(`\n${"=".repeat(70)}\nPROBLEM: ${problem}\n`);

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
    papers.forEach((p, i) => console.log(`  [${i + 1}] ${p.title}`));

    const specialization = await generateSpecialization(plan.researchQuestion, papers);
    console.log(`\nSPECIALIZATION BLURB:\n${specialization}`);
  }
}

main().catch((err) => {
  console.error("verify-specialization failed:", err);
  process.exit(1);
});
