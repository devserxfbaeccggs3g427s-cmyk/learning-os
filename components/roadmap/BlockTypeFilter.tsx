"use client";

import { useRouter } from "next/navigation";
import { STUDY_BLOCK_TYPES, type StudyBlockType } from "@/config/domain";
import { serializeDailyBlockTypes, toggleDailyBlockType } from "@/lib/roadmap/daily";

export function BlockTypeFilter({ selected }: { selected: StudyBlockType[] }) {
  const router = useRouter();

  function apply(next: StudyBlockType[]) {
    // serialize luôn giữ key `types` (kể cả rỗng) để phân biệt "trống" với "không có tham số".
    router.replace(`/roadmap?view=day&types=${serializeDailyBlockTypes(next)}`, { scroll: false });
  }

  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Loại block
      </legend>
      {STUDY_BLOCK_TYPES.map((type) => (
        <label key={type} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(type)}
            onChange={() => apply(toggleDailyBlockType(selected, type))}
          />
          {type}
        </label>
      ))}
    </fieldset>
  );
}
