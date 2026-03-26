"use client";

import { Input } from "@/components/ui";

type Props = Omit<React.ComponentProps<typeof Input>, "list"> & {
  listId: string;
  suggestions: string[];
};

export function NameAutocomplete({ listId, suggestions, ...rest }: Props) {
  return (
    <>
      <Input {...rest} list={listId} autoComplete="off" />
      <datalist id={listId}>
        {suggestions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </>
  );
}
