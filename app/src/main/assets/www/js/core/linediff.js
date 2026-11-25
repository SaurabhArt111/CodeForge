// Line diff used to patch an open editor model in place (cursor, folds, scroll and undo history survive) instead of replacing everything.

/** Changed regions between two line arrays: [{ i0, i1, j0, j1 }] = old lines [i0,i1) became new lines [j0,j1). */
export function diffHunks(a, b) {
  let pre = 0; while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let sa = a.length, sb = b.length; while (sa > pre && sb > pre && a[sa - 1] === b[sb - 1]) { sa--; sb--; }
  const n = sa - pre, m = sb - pre; if (!n && !m) return [];
  if (n * m > 4e6 || n > 20000 || m > 20000) return [{ i0: pre, i1: sa, j0: pre, j1: sb }];   // huge rewrite: one block
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[pre + i] === b[pre + j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const hunks = []; let i = 0, j = 0, cur = null;
  const open = () => (cur ||= { i0: pre + i, i1: pre + i, j0: pre + j, j1: pre + j });
  const close = () => { if (cur) { hunks.push(cur); cur = null; } };
  while (i < n || j < m) {
    if (i < n && j < m && a[pre + i] === b[pre + j]) { close(); i++; j++; }
    else if (j >= m || (i < n && L[i + 1][j] >= L[i][j + 1])) { open().i1 = pre + ++i; }
    else { open().j1 = pre + ++j; }
  }
  close(); return hunks;
}

/** Monaco edit operations for the hunks (old text → new text). `model` supplies line lengths. */
export function hunkEdits(model, newLines, hunks) {
  const n = model.getLineCount(), maxCol = (l) => model.getLineMaxColumn(l);
  return hunks.map(({ i0, i1, j0, j1 }) => {
    const text = newLines.slice(j0, j1).join("\n");
    if (i1 > i0) {                                                     // lines replaced or removed
      if (j1 > j0) return { range: { startLineNumber: i0 + 1, startColumn: 1, endLineNumber: i1, endColumn: maxCol(i1) }, text };
      if (i0 > 0) return { range: { startLineNumber: i0, startColumn: maxCol(i0), endLineNumber: i1, endColumn: maxCol(i1) }, text: "" };
      return i1 < n ? { range: { startLineNumber: 1, startColumn: 1, endLineNumber: i1 + 1, endColumn: 1 }, text: "" } : { range: { startLineNumber: 1, startColumn: 1, endLineNumber: i1, endColumn: maxCol(i1) }, text: "" };
    }
    if (i0 > 0) return { range: { startLineNumber: i0, startColumn: maxCol(i0), endLineNumber: i0, endColumn: maxCol(i0) }, text: "\n" + text };   // pure insertion after line i0
    return { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: text + "\n" };
  });
}
