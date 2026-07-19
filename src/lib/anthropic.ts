import Anthropic from "@anthropic-ai/sdk";
import { RESEARCH_PLAN_SYSTEM_PROMPT, RESEARCH_PLAN_TOOL } from "@/lib/prompts";
import type { ResearchPlan } from "@/lib/types";

// The Anthropic client reads ANTHROPIC_API_KEY from the environment —
// server-side only, never exposed to the browser (see CLAUDE.md).
// Constructed lazily so the env var is read at call time, not import time
// (import hoisting otherwise breaks scripts that load .env.local first).
let client: Anthropic | undefined;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

// What the strict tool schema in prompts.ts guarantees the model returns.
interface ResearchPlanToolInput {
  research_question: string;
  rationale: string;
  search_strings: string[];
  arxiv_categories: string[];
  date_range_months: number;
}

// One tool-use call: business problem in, structured research plan out.
// tool_choice forces the tool, and strict:true makes the API validate the
// input against the schema, so no free-text parsing is needed.
export async function generateResearchPlan(problem: string): Promise<ResearchPlan> {
  const response = await getClient().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    system: RESEARCH_PLAN_SYSTEM_PROMPT,
    tools: [RESEARCH_PLAN_TOOL],
    tool_choice: { type: "tool", name: RESEARCH_PLAN_TOOL.name },
    messages: [{ role: "user", content: problem }],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Model did not return a research plan.");
  }

  const plan = toolUse.input as unknown as ResearchPlanToolInput;

  return {
    researchQuestion: plan.research_question,
    rationale: plan.rationale,
    // The schema can't enforce "exactly 3" (array length constraints are
    // unsupported in strict mode), so clamp here: the fallback ladder
    // depends on having at most 3 rungs, and at least 1.
    searchStrings: plan.search_strings.slice(0, 3),
    arxivCategories: plan.arxiv_categories.slice(0, 3),
    dateRangeMonths: plan.date_range_months,
  };
}
