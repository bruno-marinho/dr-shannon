import { NextResponse } from "next/server";
import { searchArxiv } from "@/lib/arxiv";
import { rankByRelevance } from "@/lib/relevance";
import type { Corpus } from "@/lib/types";

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "with", "our", "their", "this", "that",
  "can", "how", "want", "wants", "cant", "don't", "we're", "into", "from",
]);

// Phase 1: naive keyword extraction from the raw problem text, used as
// unquoted arXiv search terms over a fixed 3-year window. There is no LLM
// translation into a proper research question/search strings yet — that's
// Phase 2, which replaces `naivePlan` below without touching the
// arXiv/relevance code. Quoting the *entire* problem sentence as one
// phrase (an earlier version of this function) reliably returned zero
// arXiv results, since real abstracts never contain a user's sentence
// verbatim — hence the keyword split here instead.
function naivePlan(problem: string) {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 3);
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);

  const keywords = problem
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

  const searchStrings = [...new Set(keywords)].slice(0, 6);

  return {
    researchQuestion: problem,
    searchStrings: searchStrings.length > 0 ? searchStrings : [problem],
    dateRange: { from: isoDate(from), to: isoDate(to) },
  };
}

export async function POST(request: Request) {
  const { problem } = (await request.json()) as { problem?: string };

  if (!problem || !problem.trim()) {
    return NextResponse.json({ error: "Describe a business problem first." }, { status: 400 });
  }

  const plan = naivePlan(problem.trim());

  const candidates = await searchArxiv(plan.searchStrings, plan.dateRange);
  const papers = rankByRelevance(candidates, plan.searchStrings);

  const corpus: Corpus = {
    plan,
    papers,
    specialization:
      papers.length > 0
        ? `For this session, Dr. Shannon is speaking from ${papers.length} arXiv papers related to your problem. (Specialization synthesis is still a placeholder — Phase 3 replaces this line with an LLM-written summary of the corpus.)`
        : "No arXiv papers matched this problem in the last 3 years — try rephrasing it in more technical/research terms.",
  };

  return NextResponse.json(corpus);
}
