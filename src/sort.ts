export type SortField = "name" | "input" | "output" | "cachedRead" | "cachedWrite" | "allowance" | "cost" | "requests";
export type SortState = { field: SortField; dir: 1 | -1 };

export const VALID_SORT: readonly SortField[] = [
  "name",
  "input",
  "output",
  "cachedRead",
  "cachedWrite",
  "allowance",
  "cost",
  "requests",
];
