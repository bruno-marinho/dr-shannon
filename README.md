# Dr. Shannon

**Live:** https://dr-shannon.vercel.app

Dr. Shannon is a frontier-scientist AI for business problems. You describe a problem in plain language; the system translates it into a research question, searches arXiv for the most relevant recent preprints, and hands you to Dr. Shannon — a fixed persona whose *specialization* is rebuilt live from whatever the search turns up. Then you ask him questions. He decides which papers each question requires, opens and reads those in full while you watch him choose, and answers the way a consultant would: recommendation first, cited evidence second, and what would change his mind last.

Built as a weekend MVP with [Claude Code](https://claude.com/claude-code). The code is meant to be read as much as run: every prompt lives in one file ([src/lib/prompts.ts](src/lib/prompts.ts)), every pipeline stage is visible in the UI while it happens, and the commit history records how the product changed shape when its own testing argued back.

## Design decisions

**arXiv preprints, deliberately.** The corpus is preprints that mostly haven't cleared peer review — and that's the pitch, not a compromise: *the frontier doesn't wait for peer review.* The product handles the tradeoff honestly instead of hiding it. Every claim links back to its arXiv page, and Dr. Shannon reports evidence quality rather than flattening it — when a paper's headline F1 rests on a 72-example training set, his reading notes say so, and it survives into his answers.

**A fixed persona with a dynamic specialization.** Dr. Shannon's bio and voice are hand-written once and never generated. What changes per session is only the knowledge base — plus one dynamic paragraph, the "what does this corpus make me qualified to say" blurb, synthesized fresh from each session's papers under a strict voice contract. The persona is synthetic and transparent about being synthetic; re-specializing from a fresh corpus every session is presented as his method, not a secret. That's the product's thesis in miniature.

**On-demand reading, not eager reading.** At search time, Dr. Shannon only skims titles and abstracts. Full papers are read at question time: he triages the ten abstracts against your question, announces which 1–3 papers he's opening and what in each abstract made him think the answer lives there, then reads those in full (arXiv HTML first, PDF extraction as fallback, abstract as a disclosed last resort). This is how researchers actually work — nobody reads ten papers cover to cover before hearing the question. It also has teeth as a rule: any substantive question *must* open at least one paper. Abstracts are for triage, never for evidence. Reading notes are cached per session by arXiv ID, and papers get a "read in full" badge as he opens them, so you can see exactly what he has and hasn't read at any moment.

**Client-orchestrated stages.** The pipeline is small serverless functions sequenced by the browser — research, skim, triage, read, answer — not because the platform demanded it (a single function would fit the timeout comfortably) but because it's what makes the stage-by-stage display truthful. "Reading the papers..." appears exactly when a reading call is in flight, not on a decorative timer. Transparency claims are cheap; an architecture that can't fake them is not.

## Two corrections that shaped the product

The most important changes came from testing the product against its own claims.

**1. Abstracts weren't reading.** The first working version built Dr. Shannon's expertise from abstracts alone. It sounded fine — and it quietly undercut the entire thesis: a specialist who claims to have read the frontier had better have read it. The correction made reading real and on demand, as described above. The difference is not cosmetic. Full-text reading catches what abstracts are written to obscure: training sets of 72 examples behind confident headline numbers, single-annotator evaluations, benchmarks that live in one narrow domain. Those caveats now flow from his reading notes into his answers.

**2. A literature review is not an answer.** In external evaluation, a test question about churn prediction got a well-cited, well-structured survey of what the corpus contained — and scored 4/10, because it never said what to do. That was a prompt failure, not a model failure: the voice contract had encoded epistemic virtue and said nothing about decision usefulness. The chat prompt was restructured around a consulting order — recommendation first (commit to a position), cited evidence second, caveats last and reframed from "what the corpus doesn't cover" into "what would change my recommendation." Organizing the answer by paper, or refusing to commit, is explicitly banned; a hedged recommendation is still a recommendation. The same question now opens with *"Build on the rolling-window event-driven framework from [3], not on raw time-series deep learning"* and closes with the conditions under which that call fails.

## The transparency contract

Every network round trip is a stage the user can see: the research-question translation (with its rationale), the arXiv search trail — including the fallback ladder visibly widening, in character, when a query comes back empty — the abstract skim, and the per-question reading decision shown *before* the answer. Loading messages are bound to real pipeline stages, never timers, and are written in Dr. Shannon's first-person voice.

Errors are part of the same contract: **no stage may fail silently.** This is a design principle earned the hard way — an early production test hit an arXiv timeout that threw an unhandled error, and the entire pipeline vanished without a word. Now every stage has a visible failure state in Dr. Shannon's voice ("The search fell over — ... it's the plumbing, not you") with a stage-scoped retry, so a failed specialization re-runs alone rather than restarting the pipeline. And because arXiv is a free public API with no SLA, transient failures get one automatic retry with a short backoff before the user ever sees a failure message — with rate limits respected along the way (descriptive User-Agent, spaced requests, Retry-After honored). Honest infrastructure is part of honest methodology.

## How Claude contributed

The app was built end to end with Claude Code, and runs on Claude at runtime with the model chosen by call frequency:

| Call | Model | Frequency | Why |
|---|---|---|---|
| Problem → research plan | `claude-opus-4-8` | once per session | The highest-leverage prompt in the system: vocabulary translation (business language in, the words researchers actually write in abstracts out). Quality spent where it's amortized. |
| Specialization blurb | `claude-opus-4-8` | once per session | The one dynamic piece of the persona; voice quality matters most here. |
| Triage, reading notes, chat | `claude-sonnet-4-6` | many times per session | Fast, capable, and grounded — these calls run on every question. |

The research-plan and triage calls use strict tool use for schema-guaranteed structured output; chat streams token by token.

## Run it locally

```bash
git clone https://github.com/bruno-marinho/dr-shannon
cd dr-shannon
npm install
```

Create `.env.local` with your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Then:

```bash
npm run dev
```

Standalone pipeline checks, used throughout development (they hit the live arXiv and Anthropic APIs):

```bash
npm run verify:arxiv           # arXiv query construction + zero-result failure mode
npm run verify:plan            # problem → research-plan translation, incl. vague and off-corpus edge cases
npm run verify:specialization  # full flow: skim → triage → read → consulting answer
```

## Roadmap

- **Full-corpus prompt caching.** The corpus context (abstracts + accumulated reading notes) is re-sent on every chat turn; Anthropic prompt caching on that stable prefix would cut both latency and cost per question.
- **A global reading-notes cache keyed by arXiv ID.** Notes are currently cached per session, so a paper is read at most once per conversation. A shared cache would mean each paper is read once *ever*, across all sessions and users — reading the frontier as a commons. Deliberately out of scope for the no-database MVP.
