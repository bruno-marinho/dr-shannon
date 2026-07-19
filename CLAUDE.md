# Dr. Shannon — Project Memory

## What this is

A weekend MVP being built as a case study for Anthropic. Code quality and
clear documentation matter as much as functionality — this will be read,
not just run.

Dr. Shannon is a frontier-scientist AI for business problems. A user
describes a business problem in plain language; the system turns that into
a research question, searches arXiv for relevant papers, and then lets the
user chat with "Dr. Shannon" — a persona whose specialization is built live
from whatever papers the search turned up.

## Product flow (do not change without discussion)

1. User describes a business problem in free text.
2. LLM translates the problem into a research question, plus arXiv search
   strings and a publication date range.
3. Server queries the arXiv API (`export.arxiv.org/api/query` — public, no
   auth, returns Atom XML).
4. Results are filtered by title + abstract relevance; keep the top 10.
5. Dr. Shannon READS each paper in full — arXiv HTML first, PDF extraction
   as fallback, abstract as last resort (disclosed in character) — one
   parallel, client-orchestrated serverless call per paper, producing
   ~500-word structured reading notes (method, findings, key numbers,
   limitations) in his voice.
6. Those 10 reading notes (not the abstracts) become the knowledge base.
   Dr. Shannon's persona (fixed) gets a dynamically written
   "specialization" blurb synthesized from the notes.
7. User chats with Dr. Shannon, who speaks from his reading notes; every
   claim cites which paper supports it, and for exact wording he points to
   the paper and section rather than quoting from memory.

## Key design decisions — already made, do not revisit

- **Fixed persona, dynamic corpus.** Dr. Shannon's bio/voice is written
  once, hand-authored. Only the knowledge base changes per session.
- **Transparency is the differentiator.** Every pipeline step (translating
  the question, searching arXiv, filtering, building the specialization)
  is shown to the user as it happens. Loading messages are tied to real
  pipeline stages, not a timer, and are written in Dr. Shannon's
  first-person voice (e.g. "Reading through 47 abstracts on queueing
  theory..." not "Loading...").
- **Preprints are a feature.** arXiv results are not peer-reviewed and
  that's fine — "the frontier doesn't wait for peer review" is part of the
  pitch. But every source must be cited and linked back to its arXiv page.
- **No semantic sophistication needed.** Simple relevance scoring (e.g.
  keyword/term overlap in title+abstract) is sufficient. Do not build
  embeddings or vector search for this MVP.
- **Model split by call frequency.** The problem → research-plan
  translation runs once per session and uses `claude-opus-4-8` (spend
  quality where it runs once). Chat with Dr. Shannon runs many times per
  session and uses `claude-sonnet-4-6`.

## Explicitly out of scope for this MVP

- Multiple scientists / "advisory board" mode
- User accounts, auth, login
- History, saved sessions, persistence across page loads
- A database of any kind
- Sophisticated semantic filtering / embeddings / reranking

If a task seems to require any of the above, stop and flag it rather than
building a workaround.

## Stack

- **Framework:** Next.js (App Router), Tailwind CSS
- **Deploy target:** Vercel, Hobby plan. Function limit is 300s default
  and max with Fluid compute (verified against Vercel docs 2026-07-19 —
  an earlier 10s assumption here was stale). Keep the pipeline split into
  small per-stage functions anyway: that's what makes the stage-by-stage
  transparency UI truthful.
- **API routes:**
  - one serverless route for the arXiv search + filtering pipeline
  - one serverless route proxying the Anthropic API (the Anthropic API key
    lives only in a server-side env var, never sent to the client)
- **State:** all in-memory / in-browser for the duration of one session.
  No database, no auth, no server-side session store.
- **Language:** English, for both UI copy and code/comments.

## Conventions

- Prefer editing over adding abstractions; this is a weekend MVP, not a
  platform. Don't build for hypothetical future requirements (see out of
  scope list above).
- Every pipeline stage that takes a network round trip should be
  observable by the user in the UI — treat "you can see what Dr. Shannon
  is doing right now" as a hard requirement, not a nice-to-have.
- Since this ships as an Anthropic case study, favor readable code and
  short explanatory comments over cleverness, especially in the
  arXiv-parsing and prompt-construction code, which reviewers are likely
  to read closely.
- **Example problems in UI copy must fall within arXiv's strengths**
  (AI/ML, systems, quantitative methods) — never generic business topics
  (pricing, churn, org strategy, etc.) that arXiv's corpus can't serve
  well. arXiv has weak coverage of general business subjects; steering
  users toward a topic it covers thinly produces a bad first result and
  undermines the demo. When writing placeholder text, sample copy, or demo
  scripts, pick problems phrased around applying ML/AI/technical methods
  to a business context, not the business context alone.
