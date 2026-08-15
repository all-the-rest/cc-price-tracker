export type SortField = "name" | "input" | "output" | "cachedRead" | "cachedWrite" | "allowance" | "cost";
export type SortState = { field: SortField; dir: 1 | -1 };
export type FreeSortField = "model" | "availableFrom";
export type FreeSortState = { field: FreeSortField; dir: 1 | -1 };

export const VALID_SORT: readonly SortField[] = [
  "name",
  "input",
  "output",
  "cachedRead",
  "cachedWrite",
  "allowance",
  "cost",
];
