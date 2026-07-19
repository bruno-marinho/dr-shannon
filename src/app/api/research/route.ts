import { NextResponse } from "next/server";
import type { Corpus } from "@/lib/types";

// Stub for the Phase 0 walking skeleton: returns canned data so the
// full request → response → UI path can be deployed and verified before
// the real arXiv search (Phase 1) and LLM research-question step (Phase 2)
// exist.
const STUB_CORPUS: Corpus = {
  plan: {
    researchQuestion:
      "How does dynamic pricing affect customer retention in subscription businesses?",
    searchStrings: ["dynamic pricing subscription retention", "churn pricing elasticity"],
    dateRange: { from: "2023-01-01", to: "2026-07-19" },
  },
  papers: Array.from({ length: 10 }).map((_, i) => ({
    arxivId: `stub.${1000 + i}`,
    title: `Placeholder Paper Title ${i + 1}`,
    authors: ["A. Researcher", "B. Scientist"],
    abstract:
      "This is placeholder abstract text standing in for a real arXiv result. It will be replaced once the arXiv search pipeline (Phase 1) is wired up.",
    link: `https://arxiv.org/abs/stub.${1000 + i}`,
    publishedDate: "2025-01-01",
  })),
  specialization:
    "For this session, Dr. Shannon is speaking from a placeholder corpus on pricing and retention — real specialization synthesis lands in Phase 3.",
};

export async function POST(request: Request) {
  const { problem } = (await request.json()) as { problem?: string };

  if (!problem || !problem.trim()) {
    return NextResponse.json(
      { error: "Describe a business problem first." },
      { status: 400 },
    );
  }

  return NextResponse.json(STUB_CORPUS);
}
