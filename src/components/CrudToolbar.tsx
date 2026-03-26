"use client";

import { Button, Select } from "@/components/ui";

type SortOption = { value: string; label: string };

export function CrudToolbar({
  sortOptions,
  sort,
  order,
  onSortChange,
  onOrderChange,
  onRefresh,
  onAdd,
  loading,
}: {
  sortOptions: SortOption[];
  sort: string;
  order: "asc" | "desc";
  onSortChange: (v: string) => void;
  onOrderChange: (v: "asc" | "desc") => void;
  onRefresh: () => void;
  onAdd: () => void;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Select
        value={sort}
        onChange={(e) => onSortChange(e.target.value)}
        aria-label="Sortuj według"
        disabled={loading}
        className="min-w-[11rem]"
      >
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <Select
        value={order}
        onChange={(e) => onOrderChange(e.target.value as "asc" | "desc")}
        aria-label="Kolejność"
        disabled={loading}
        className="w-28"
      >
        <option value="asc">Rosnąco</option>
        <option value="desc">Malejąco</option>
      </Select>
      <Button type="button" variant="secondary" onClick={onRefresh} disabled={loading}>
        Odśwież
      </Button>
      <Button type="button" onClick={onAdd} disabled={loading}>
        Dodaj
      </Button>
    </div>
  );
}
