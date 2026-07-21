import { STAGE_ERRORS } from "@/lib/prompts";

// The pipeline's live, at-a-glance state — the transparency principle made
// concrete: the user can see exactly which stage Dr. Shannon is on, in his
// voice, and every failure is visible with a stage-scoped retry. Driven by
// the same Phase state machine that runs the pipeline in page.tsx, so this
// display is truthful, never a decorative timer.

export type Phase =
  | { name: "idle" }
  | { name: "researching" }
  | { name: "research_error" }
  | { name: "reading"; done: number; total: number }
  | { name: "specializing" }
  | { name: "specialize_error" }
  | { name: "ready" };

type StepState = "pending" | "active" | "done" | "error";

const STEP_LABELS = ["Search", "Read", "Specialize"] as const;

function stepStates(phase: Phase): [StepState, StepState, StepState] {
  switch (phase.name) {
    case "researching":
      return ["active", "pending", "pending"];
    case "research_error":
      return ["error", "pending", "pending"];
    case "reading":
      return ["done", "active", "pending"];
    case "specializing":
      return ["done", "done", "active"];
    case "specialize_error":
      return ["done", "done", "error"];
    case "ready":
      return ["done", "done", "done"];
    default:
      return ["pending", "pending", "pending"];
  }
}

function Dot({ state, index }: { state: StepState; index: number }) {
  const base =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors";
  const styles: Record<StepState, string> = {
    pending: "border border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500",
    active:
      "border border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 animate-pulse",
    done: "bg-emerald-600 text-white",
    error: "bg-red-600 text-white",
  };
  return (
    <span className={`${base} ${styles[state]}`}>
      {state === "done" ? "✓" : state === "error" ? "!" : index + 1}
    </span>
  );
}

export function PipelineStatus({
  phase,
  onRetryResearch,
  onRetrySpecialize,
}: {
  phase: Phase;
  onRetryResearch: () => void;
  onRetrySpecialize: () => void;
}) {
  if (phase.name === "idle") return null;

  const states = stepStates(phase);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <ol className="flex items-center">
        {STEP_LABELS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <Dot state={states[i]} index={i} />
              <span
                className={
                  states[i] === "pending"
                    ? "text-sm text-zinc-400 dark:text-zinc-500"
                    : "text-sm font-medium"
                }
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <span
                className={`mx-3 h-px flex-1 ${
                  states[i] === "done" ? "bg-emerald-500/60" : "bg-zinc-200 dark:bg-zinc-800"
                }`}
              />
            )}
          </li>
        ))}
      </ol>

      {phase.name === "researching" && (
        <p className="text-sm italic text-zinc-500 dark:text-zinc-400">
          Turning your problem into a research question and searching arXiv...
        </p>
      )}

      {phase.name === "reading" && (
        <p className="text-sm italic text-zinc-500 dark:text-zinc-400">
          Reading the papers — properly, not just the abstracts. {phase.done} of {phase.total}{" "}
          done...
        </p>
      )}

      {phase.name === "specializing" && (
        <p className="text-sm italic text-zinc-500 dark:text-zinc-400">
          Going back through my notes and working out what they make me qualified to say...
        </p>
      )}

      {phase.name === "research_error" && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-red-600 dark:text-red-400">{STAGE_ERRORS.research}</p>
          <button
            onClick={onRetryResearch}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Run it again
          </button>
        </div>
      )}

      {phase.name === "specialize_error" && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-red-600 dark:text-red-400">{STAGE_ERRORS.specialize}</p>
          <button
            onClick={onRetrySpecialize}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Try that step again
          </button>
        </div>
      )}
    </div>
  );
}
