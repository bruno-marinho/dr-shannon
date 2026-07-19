// Placeholder stage list for the Phase 0 skeleton. Phase 5 replaces this
// with real, first-person stage messages driven by actual pipeline events
// (research question drafted, arXiv queried, filtered, specialization
// synthesized) instead of this static, all-at-once list.
const STAGES = [
  "Turning your problem into a research question...",
  "Searching arXiv for relevant work...",
  "Reading through abstracts and picking the ten most relevant...",
  "Building a specialization out of what I found...",
];

export function PipelineStatus() {
  return (
    <ul className="flex flex-col gap-1 text-sm text-zinc-500 dark:text-zinc-400">
      {STAGES.map((stage) => (
        <li key={stage}>{stage}</li>
      ))}
    </ul>
  );
}
