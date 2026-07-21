"use client";

import { useState } from "react";

export function ProblemInput({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (problem: string) => void;
}) {
  const [value, setValue] = useState("");

  return (
    <form
      className="flex w-full flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <label
        htmlFor="problem"
        className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
      >
        Describe a business problem
      </label>
      <textarea
        id="problem"
        className="min-h-28 w-full rounded-lg border border-zinc-300 bg-white p-3 text-base leading-6 outline-none transition-colors focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        placeholder="e.g. Our support team wants to use LLMs for customer answers, but we can't tolerate hallucinated responses — how are teams making this reliable?"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="self-start rounded-full bg-zinc-950 px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-950"
      >
        {disabled ? "Dr. Shannon is on it..." : "Ask Dr. Shannon"}
      </button>
    </form>
  );
}
