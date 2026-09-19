export interface FieldChange {
  from: unknown;
  to: unknown;
}

/**
 * Picks out only the fields whose value actually changed, for an audit log's "fields" detail.
 * Arrays are compared by content (JSON.stringify) so re-sending the same list (e.g.
 * allowedEnvironments in the same order) never shows up as a change.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Record<string, unknown>,
  fields: (keyof T & string)[]
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};
  for (const field of fields) {
    if (!(field in after)) continue;
    const a = before[field];
    const b = after[field];
    const same = Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b;
    if (!same) changes[field] = { from: a, to: b };
  }
  return changes;
}

/** Wraps diffFields' result for storage, or undefined when nothing actually changed. */
export function fieldChangeDetails<T extends Record<string, unknown>>(
  before: T,
  after: Record<string, unknown>,
  fields: (keyof T & string)[]
): Record<string, unknown> | undefined {
  const changes = diffFields(before, after, fields);
  return Object.keys(changes).length ? { kind: "fields", changes } : undefined;
}

export interface LineDiffEntry {
  type: "context" | "add" | "remove";
  line: string;
}

const MAX_DIFF_LINES = 2000;

/**
 * Line-level diff via a classic LCS table. Config files this is used for are small (hundreds
 * of lines), so the O(n*m) table is cheap; above MAX_DIFF_LINES the table would get too large,
 * so callers fall back to a size-only summary instead (see textDiffDetails).
 */
export function diffText(before: string, after: string): LineDiffEntry[] | null {
  if (before === after) return [];
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) return null;

  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const lcs = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + (j + 1)] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + (j + 1)]);
    }
  }

  const entries: LineDiffEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      entries.push({ type: "context", line: a[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + (j + 1)]) {
      entries.push({ type: "remove", line: a[i] });
      i++;
    } else {
      entries.push({ type: "add", line: b[j] });
      j++;
    }
  }
  while (i < n) entries.push({ type: "remove", line: a[i++] });
  while (j < m) entries.push({ type: "add", line: b[j++] });
  return entries;
}

/** Wraps diffText's result for storage, degrading to a size-only summary for huge files. */
export function textDiffDetails(before: string, after: string): Record<string, unknown> {
  const entries = diffText(before, after);
  if (entries === null) {
    return { kind: "diff-summary", sizeBefore: before.length, sizeAfter: after.length };
  }
  return { kind: "diff", entries };
}
