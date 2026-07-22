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

// Dr. Shannon's structured notes from reading one paper in full. `source`
// records how much he actually got to read: full text (arXiv HTML, or PDF
// extraction as fallback) or — when a paper resists both — only the
// abstract, which the note itself discloses in character. Papers are read
// on demand at question time, not eagerly at search time; the notes are
// cached per session, keyed by arXiv ID.
export interface ReadingNote {
  arxivId: string;
  source: "html" | "pdf" | "abstract";
  notes: string;
}

export interface Corpus {
  plan: ResearchPlan;
  attempts: SearchAttempt[];
  // Title + abstract only — the search stage no longer reads full text.
  // Dr. Shannon skims these abstracts; full-text reads happen lazily in
  // chat, when a question demands a particular paper.
  papers: Paper[];
  // First-impressions blurb synthesized by api/specialize from the
  // abstracts — absent while that stage is still running.
  specialization?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
