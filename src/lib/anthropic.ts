import Anthropic from "@anthropic-ai/sdk";
import {
  CHAT_SYSTEM_PROMPT,
  chatCorpusContext,
  READING_NOTES_SYSTEM_PROMPT,
  readingNotesUserMessage,
  RESEARCH_PLAN_SYSTEM_PROMPT,
  RESEARCH_PLAN_TOOL,
  SPECIALIZATION_SYSTEM_PROMPT,
  specializationUserMessage,
  TRIAGE_SYSTEM_PROMPT,
  TRIAGE_TOOL,
  triageCorpusContext,
} from "@/lib/prompts";
import type { ChatMessage, Paper, ResearchPlan } from "@/lib/types";

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

// One reading call: Dr. Shannon reads one paper (full text when we could
// get it, abstract as last resort) and writes ~500-word structured notes.
// Runs 10x per session, so it uses the faster model per the CLAUDE.md
// model split.
export async function generateReadingNotes(
  paper: Paper,
  source: "html" | "pdf" | "abstract",
  text: string,
): Promise<string> {
  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    // ~500-word notes are ~700 tokens; 2048 leaves headroom so a note that
    // runs long is never cut off mid-sentence.
    max_tokens: 2048,
    system: READING_NOTES_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: readingNotesUserMessage(paper.title, paper.authors, source, text),
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Model did not return reading notes.");
  }
  return block.text.trim();
}

// Synthesizes the session's "first impressions" blurb from the ABSTRACTS
// (no paper has been opened yet — reads happen on demand at question
// time). Runs once per session, so it gets the higher-quality model (see
// CLAUDE.md).
export async function generateSpecialization(
  researchQuestion: string,
  corpus: { title: string; abstract: string }[],
): Promise<string> {
  const response = await getClient().messages.create({
    model: "claude-opus-4-8",
    // A thin-corpus blurb with several caveats can run long; 1024 keeps it
    // from being truncated.
    max_tokens: 1024,
    system: SPECIALIZATION_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: specializationUserMessage(researchQuestion, corpus) },
    ],
  });

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Model did not return a specialization.");
  }
  return text.text.trim();
}

// Triage: given a question and the corpus abstracts, decide which 1-3
// papers to open in full, and write the in-character reading decision the
// user sees before the answer. Runs many times per session — faster model.
export interface TriageResult {
  paperNumbers: number[];
  readingDecision: string;
}

export async function generateTriage(
  messages: ChatMessage[],
  corpus: { title: string; abstract: string }[],
): Promise<TriageResult> {
  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `${TRIAGE_SYSTEM_PROMPT}\n\n${triageCorpusContext(corpus)}`,
    tools: [TRIAGE_TOOL],
    tool_choice: { type: "tool", name: TRIAGE_TOOL.name },
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Triage did not return a selection.");
  }
  const input = toolUse.input as { paper_numbers: number[]; reading_decision: string };

  // Clamp to valid corpus range and cap at 3 — the schema can't enforce
  // array bounds in strict mode.
  const paperNumbers = [...new Set(input.paper_numbers)]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= corpus.length)
    .slice(0, 3);

  return { paperNumbers, readingDecision: input.reading_decision.trim() };
}

// Streams a chat reply grounded in the session's reading notes. Runs many
// times per session, so it uses the faster model (see CLAUDE.md). The
// fixed voice/grounding contract plus the corpus context go in the system
// prompt; returns the SDK MessageStream for the route to pipe to the
// client token by token.
export function streamChat(
  messages: ChatMessage[],
  researchQuestion: string,
  corpus: { title: string; link: string; opened: boolean; text: string }[],
) {
  return getClient().messages.stream({
    model: "claude-sonnet-4-6",
    // A grounded answer to a multi-part question is genuinely long — the
    // old 1024 cap cut replies off mid-sentence. We stream, so a high cap
    // costs nothing in latency and only bounds pathological runaway output.
    max_tokens: 8192,
    system: `${CHAT_SYSTEM_PROMPT}\n\n${chatCorpusContext(researchQuestion, corpus)}`,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
}
