/**
 * Shared output-formatting helpers for the PLANKA MCP server.
 *
 * Goal: keep tool responses information-dense but token-cheap. Every handler
 * serializes through here instead of calling `JSON.stringify(x, null, 2)`.
 * The techniques mirror the mcp-rtk pipeline (strip nulls, collapse/cap arrays,
 * truncate) and generalize the conditional-omit pattern that already lived in
 * the board formatter.
 */

/** Output verbosity. `compact` is the lean default; `full` restores dropped fields. */
export type Detail = "compact" | "full";

/** Coerce an untrusted `detail` argument to a valid value, defaulting to compact. */
export function parseDetail(value: unknown): Detail {
  return value === "full" ? "full" : "compact";
}

/**
 * The single serialization point for object/mutation payloads: compact JSON
 * with no indentation (the 2-space indent was ~30-40% pure token overhead).
 */
export function toText(value: unknown): string {
  return JSON.stringify(value);
}

/** True for values that carry no information and should be dropped from output. */
function isEmpty(v: unknown): boolean {
  return (
    v === null ||
    v === undefined ||
    v === "" ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === "object" &&
      v !== null &&
      !Array.isArray(v) &&
      Object.keys(v).length === 0)
  );
}

/**
 * Recursively drop `null` / `undefined` / `""` values and empty arrays/objects.
 * Preserves `false` and `0` (they carry meaning). Mirrors mcp-rtk `strip_nulls`.
 */
export function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((v) => stripNulls(v))
      .filter((v) => !isEmpty(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = stripNulls(v);
      if (!isEmpty(cleaned)) out[k] = cleaned;
    }
    return out as unknown as T;
  }
  return value;
}

/** Escape a single cell so `|` and newlines never break the row grid. */
function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.map((x) => String(x)).join(",") : String(v);
  return s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

/**
 * Render records as a TOON-style delimited block: a header line naming the
 * columns once, then one `|`-delimited row per record. Empty cells are blank.
 * Returns an empty string for no rows so callers can omit the block entirely.
 *
 * @param label   block name, e.g. "card"
 * @param columns column names, e.g. ["id", "name", "labels", "tasks", "due"]
 * @param rows    the records
 * @param cells   maps a record to its ordered cell values
 */
export function toRows<R>(
  label: string,
  columns: string[],
  rows: R[],
  cells: (row: R) => unknown[]
): string {
  if (rows.length === 0) return "";
  const head = `${label}(${columns.join("|")}):`;
  const body = rows.map((r) => cells(r).map(fmtCell).join("|"));
  return [head, ...body].join("\n");
}

/**
 * Keep the first `n` items; report how many were dropped so the caller can
 * append a "… and X more" sentinel. Mirrors mcp-rtk `collapse_arrays`.
 */
export function capArray<T>(items: T[], n: number): { items: T[]; more: number } {
  if (items.length <= n) return { items, more: 0 };
  return { items: items.slice(0, n), more: items.length - n };
}

/** Cap free-text length, appending an ellipsis when truncated. */
export function truncate(text: string, n: number): string {
  return text.length > n ? text.slice(0, n) + "…" : text;
}
