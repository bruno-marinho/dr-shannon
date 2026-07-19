export interface Paper {
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  link: string;
  publishedDate: string;
}

export interface ResearchPlan {
  researchQuestion: string;
  // Why this question represents the business problem — shown to the user
  // as part of the transparency principle.
  rationale: string;
  // Exactly 3, ordered most-specific → broadest. Each is a flat boolean
  // expression of short terms joined by AND/OR (no parentheses, no quoted
  // full sentences) — see prompts.ts for the format contract.
  searchStrings: string[];
  // 1-3 arXiv category codes (e.g. "cs.CL", "cs.LG") used to scope the search.
  arxivCategories: string[];
  // Lookback window for the publication date range.
  dateRangeMonths: number;
}

// One rung of the pre-generated fallback ladder: which search string was
// tried, what came back, and — when the pipeline had to widen the net —
// a first-person message from Dr. Shannon explaining the retry.
export interface SearchAttempt {
  searchString: string;
  resultCount: number;
  shannonComment: string;
}

export interface Corpus {
  plan: ResearchPlan;
  attempts: SearchAttempt[];
  papers: Paper[];
  // Synthesized in a separate serverless call (api/specialize) after the
  // corpus is assembled — absent while that stage is still running.
  specialization?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
