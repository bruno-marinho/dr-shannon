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

  try {
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

    // Specialization is synthesized by a separate api/specialize call,
    // orchestrated by the client after this response arrives.
    const corpus: Corpus = { plan, attempts, papers };

    return NextResponse.json(corpus);
  } catch (err) {
    // Anything upstream (LLM plan call, arXiv timeout) becomes a clean JSON
    // 502 rather than a bodiless 500 — the client turns this into a visible,
    // retryable stage error instead of failing silently.
    console.error("research route failed:", err);
    return NextResponse.json({ error: "research_failed" }, { status: 502 });
  }
}
