"use client";

import { Button } from "@/components/ui/button";
import { sourceTypes } from "@/components/send-form/constants";
import type { SourceType } from "@/lib/types";

export function SourceTypePicker({
  onSelect,
  sourceType,
}: {
  onSelect: (nextSourceType: SourceType) => void;
  sourceType: SourceType;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {sourceTypes.map((option) => (
        <Button
          key={option.value}
          type="button"
          onClick={() => onSelect(option.value)}
          variant={sourceType === option.value ? "default" : "outline"}
          className={`h-auto min-h-24 flex-col items-start rounded-[1.25rem] px-4 py-4 text-left ${
            sourceType === option.value
              ? "text-white"
              : "bg-[var(--panel)] text-neutral-800"
          }`}
        >
          <div className="text-sm font-semibold">{option.label}</div>
          <div
            className={`mt-2 text-xs leading-5 ${
              sourceType === option.value ? "text-white/80" : "text-neutral-600"
            }`}
          >
            {option.hint}
          </div>
        </Button>
      ))}
    </div>
  );
}
