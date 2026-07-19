// Standalone verification for the Phase 2 problem → research-plan step,
// run against the real Anthropic + arXiv APIs before wiring into the UI.
// Run with `npm run verify:plan` (requires ANTHROPIC_API_KEY in .env.local).
//
// Three probes, chosen to test the translation at its edges:
//   1. The product's sweet spot (the UI placeholder example).
//   2. A deliberately vague problem — does it pick a sensible technical
//      interpretation and say so in the rationale?
//   3. A non-frontier business problem (pricing/churn) — does it translate
//      toward the nearest quantitative formulation arXiv actually covers?
import { config } from "dotenv";
config({ path: ".env.local" });

import { generateResearchPlan } from "../src/lib/anthropic";
import { searchArxiv, termsOf } from "../src/lib/arxiv";
import { rankByRelevance } from "../src/lib/relevance";
import { FALLBACK_MESSAGES } from "../src/lib/prompts";

const PROBLEMS = [
  "Our support team wants to use LLMs for customer answers, but we can't tolerate hallucinated responses — how are teams making this reliable?",
  "we want to use AI somehow",
  "Our subscription churn spikes whenever we raise prices, and we don't know why.",
];

function dateRangeFromMonths(months: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - months);
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);
  return { from: isoDate(from), to: isoDate(to) };
}

async function run(problem: string) {
  console.log(`\n${"=".repeat(70)}\nPROBLEM: ${problem}\n`);

  const plan = await generateResearchPlan(problem);
  console.log(`research question : ${plan.researchQuestion}`);
  console.log(`rationale         : ${plan.rationale}`);
  console.log(`categories        : ${plan.arxivCategories.join(", ")}`);
  console.log(`date range        : last ${plan.dateRangeMonths} months`);
  plan.searchStrings.forEach((s, i) => {
    console.log(`search string ${i + 1}   : ${s}  [terms: ${termsOf(s).join(" | ")}]`);
  });

  const dateRange = dateRangeFromMonths(plan.dateRangeMonths);
  for (let i = 0; i < plan.searchStrings.length; i++) {
    const searchString = plan.searchStrings[i];
    if (FALLBACK_MESSAGES[i]) console.log(`  Dr. Shannon: "${FALLBACK_MESSAGES[i]}"`);
    const candidates = await searchArxiv(searchString, plan.arxivCategories, dateRange);
    console.log(`  attempt ${i + 1}: "${searchString}" → ${candidates.length} candidates`);
    if (candidates.length > 0) {
      const top = rankByRelevance(candidates, searchString);
      top.slice(0, 5).forEach((p, j) => {
        console.log(`    [${j + 1}] ${p.title} (${p.publishedDate})`);
      });
      if (top.length > 5) console.log(`    ... and ${top.length - 5} more`);
      return;
    }
  }
  console.log("  all three rungs returned zero results");
}

async function main() {
  for (const problem of PROBLEMS) {
    await run(problem);
  }
}

main().catch((err) => {
  console.error("verify-plan failed:", err);
  process.exit(1);
});
