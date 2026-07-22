// Standalone smoke for the on-demand chat architecture, end to end against
// the live APIs: research -> skim (specialize from abstracts) -> triage a
// question -> read the picked papers -> stream a consulting answer.
// Run with `npm run verify:specialization`.
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const {
    generateResearchPlan,
    generateSpecialization,
    generateTriage,
    generateReadingNotes,
    streamChat,
  } = await import("../src/lib/anthropic");
  const { searchArxiv } = await import("../src/lib/arxiv");
  const { rankByRelevance } = await import("../src/lib/relevance");
  const { fetchFullText } = await import("../src/lib/fulltext");

  const problem =
    "Our subscription churn spikes whenever we raise prices, and we don't know why.";
  // The exact question used for the before/after case-study evaluation.
  const question =
    "How can interpretable machine learning models predict individual customer churn from sparse and irregular time-series usage data while accounting for cost-sensitive intervention constraints?";

  console.log(`PROBLEM: ${problem}\n`);

  // Research + search.
  const plan = await generateResearchPlan(problem);
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
  console.log(`corpus: ${papers.length} papers`);

  // Skim -> specialization from abstracts.
  const specialization = await generateSpecialization(
    plan.researchQuestion,
    papers.map((p) => ({ title: p.title, abstract: p.abstract })),
  );
  console.log(`\n=== SPECIALIZATION (from abstracts) ===\n${specialization}`);

  // Triage the question.
  console.log(`\n=== QUESTION ===\n${question}`);
  const { paperNumbers, readingDecision } = await generateTriage(
    [{ role: "user", content: question }],
    papers.map((p) => ({ title: p.title, abstract: p.abstract })),
  );
  console.log(`\n=== READING DECISION ===\n${readingDecision}`);
  console.log(`opening: ${paperNumbers.map((n) => `[${n}]`).join(", ")}`);

  // Read the picked papers.
  const opened = new Set(paperNumbers);
  const corpus = await Promise.all(
    papers.map(async (p, i) => {
      if (!opened.has(i + 1)) {
        return { title: p.title, link: p.link, opened: false, text: p.abstract };
      }
      const full = await fetchFullText(p.arxivId);
      const source = full?.source ?? "abstract";
      const notes = await generateReadingNotes(p, source, full?.text ?? p.abstract);
      console.log(`  read [${i + 1}] ${p.arxivId} (${source})`);
      return { title: p.title, link: p.link, opened: true, text: notes };
    }),
  );

  // Stream the consulting answer.
  const stream = streamChat([{ role: "user", content: question }], plan.researchQuestion, corpus);
  const final = await stream.finalMessage();
  const answer = final.content.find((b) => b.type === "text");
  console.log(`\n=== ANSWER ===\n${answer && answer.type === "text" ? answer.text : "(none)"}`);
}

main().catch((err) => {
  console.error("verify-specialization failed:", err);
  process.exit(1);
});
