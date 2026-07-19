import { NextResponse } from "next/server";
import { generateResearchPlan } from "@/lib/anthropic";
import { searchArxiv } from "@/lib/arxiv";
import { rankByRelevance } from "@/lib/relevance";
import { FALLBACK_MESSAGES } from "@/lib/prompts";
import type { Corpus, SearchAttempt } from "@/lib/types";

function dateRangeFromMonths(months: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - months);
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);
  return { from: isoDate(from), to: isoDate(to) };
}

export async function POST(request: Request) {
  const { problem } = (await request.json()) as { problem?: string };

  if (!problem || !problem.trim()) {
    return NextResponse.json({ error: "Describe a business problem first." }, { status: 400 });
  }

  // Step 1 — translate the business problem into a research plan (one
  // LLM tool-use call; see prompts.ts for the design intent).
  const plan = await generateResearchPlan(problem.trim());
  const dateRange = dateRangeFromMonths(plan.dateRangeMonths);

  // Step 2 — walk the pre-generated fallback ladder: try the most
  // specific search string first, widening only on zero results. Every
  // rung is recorded and returned so the UI can show the retries in
  // Dr. Shannon's voice — the fallback is visible, never silent.
  const attempts: SearchAttempt[] = [];
  let papers: Corpus["papers"] = [];

  for (let i = 0; i < plan.searchStrings.length; i++) {
    const searchString = plan.searchStrings[i];
    const candidates = await searchArxiv(searchString, plan.arxivCategories, dateRange);

    attempts.push({
      searchString,
      resultCount: candidates.length,
      shannonComment: FALLBACK_MESSAGES[i] ?? "",
    });

    if (candidates.length > 0) {
      papers = rankByRelevance(candidates, searchString);
      break;
    }
  }

  const corpus: Corpus = {
    plan,
    attempts,
    papers,
    specialization:
      papers.length > 0
        ? `For this session, Dr. Shannon is speaking from ${papers.length} arXiv papers on this question. (Specialization synthesis lands in Phase 3.)`
        : "Even the broadest search found nothing on arXiv — the problem may sit outside the corpus's strengths. Try rephrasing toward the technical side of it.",
  };

  return NextResponse.json(corpus);
}
