// All prompts for Dr. Shannon live in this one file, deliberately — since
// this project ships as a case study, a reviewer should be able to read
// every prompt the system runs without hunting through route handlers.

/*
 * DESIGN INTENT — translation, not search.
 *
 * The problem → research-plan step is NOT a search-string generator. Its
 * core job is translation: business vocabulary in, academic vocabulary out.
 * A user says "AI answers that don't make things up"; the literature says
 * "hallucination mitigation", "factual grounding", "retrieval-augmented
 * generation". arXiv's search only matches the words researchers actually
 * wrote in titles and abstracts, so a query phrased in business language
 * finds nothing — Phase 1 proved this empirically: quoting a user's raw
 * sentence as a search phrase returned zero results every time.
 *
 * The output is a fallback ladder, not a single query: exactly 3 search
 * strings ordered most-specific → broadest. The pipeline tries string 1
 * and only widens to 2, then 3, on zero results — so no second LLM call
 * is ever needed to broaden a failed search, and each widening step can
 * be surfaced to the user honestly as it happens.
 */
export const RESEARCH_PLAN_SYSTEM_PROMPT = `You translate business problems into arXiv research plans.

Your core job is vocabulary translation: restate the user's business problem in the terminology the academic literature actually uses. Business phrasing ("AI answers that don't make things up") must become research phrasing ("hallucination mitigation", "factual grounding", "retrieval-augmented generation"). arXiv's search matches only words researchers write in titles and abstracts — a query in business vocabulary finds nothing.

Rules for search strings:
- Produce EXACTLY 3, ordered most-specific to broadest.
- Each combines 2-4 short terms (1-3 words each) with AND/OR. Uppercase operators, no parentheses, no nesting. Example: "hallucination detection AND customer support" or "hallucination mitigation OR factual grounding".
- NEVER use a full sentence or long phrase as a term — multi-word terms beyond 3 words match nothing.
- String 1 is precise: it should find papers squarely on the user's problem, and finding zero is acceptable.
- String 2 relaxes one constraint (drop the most restrictive term, or swap AND for OR).
- String 3 is broad enough that zero results is very unlikely: 2 well-established research terms joined by OR.

Also produce:
- research_question: one precise, answerable question a scientist could investigate.
- rationale: 1-2 sentences on why this question represents the business problem.
- arxiv_categories: 1-3 arXiv category codes where this literature lives (e.g. cs.CL, cs.LG, cs.SE, cs.IR, cs.HC, stat.ML).
- date_range_months: lookback window. Default 18 for fast-moving fields (LLMs, deep learning); widen up to 60 for slower fields (optimization, queueing theory, classical statistics).

If the problem is vague, pick the most plausible technical interpretation and note the assumption in the rationale. If the problem is outside arXiv's strengths (pure pricing, org strategy), translate it to the nearest quantitative/ML formulation that arXiv does cover, and say so in the rationale.`;

// Structured output contract for the research-plan call, enforced via
// strict tool use — the API guarantees the input matches this schema, so
// the route can consume it without defensive parsing.
export const RESEARCH_PLAN_TOOL = {
  name: "submit_research_plan",
  description:
    "Submit the research plan translated from the user's business problem.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      research_question: {
        type: "string",
        description: "One precise, answerable research question.",
      },
      rationale: {
        type: "string",
        description:
          "Why this question represents the business problem (1-2 sentences).",
      },
      search_strings: {
        type: "array",
        description:
          "Exactly 3 arXiv search strings, ordered most-specific to broadest.",
        items: { type: "string" },
      },
      arxiv_categories: {
        type: "array",
        description: "1-3 arXiv category codes, e.g. cs.CL, cs.LG.",
        items: { type: "string" },
      },
      date_range_months: {
        type: "integer",
        description: "Lookback window in months. Default 18; up to 60 for slow-moving fields.",
      },
    },
    required: [
      "research_question",
      "rationale",
      "search_strings",
      "arxiv_categories",
      "date_range_months",
    ],
    additionalProperties: false,
  },
};

// Pre-written fallback-ladder messages in Dr. Shannon's voice, indexed by
// which attempt is starting. Attempt 0 has no message (nothing to explain
// yet); attempts 1 and 2 are shown when the previous rung found nothing —
// methodological honesty is part of the product, so the retry is announced,
// never hidden.
export const FALLBACK_MESSAGES = [
  "",
  "Hmm — too narrow. Nobody has written on exactly that. Let me widen the net.",
  "Still nothing. Fine. Casting the broadest net the literature allows.",
];
