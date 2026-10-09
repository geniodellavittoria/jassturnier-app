/**
 * Minimal structural patches for syncing the tournament between devices.
 * Shared by the app (TournamentStore) and the worker — keep this file free
 * of Angular imports.
 *
 * Instead of sending the whole tournament, a device sends only the leaves it
 * changed, each with the value it based its edit on (`prev`). The server
 * applies an op only if its current value still equals `prev`; otherwise
 * another device changed it in the meantime and the op is a conflict.
 */

export type Path = (string | number)[];

export interface PatchOp {
  path: Path;
  /** Value at `path` the edit was based on (undefined = didn't exist). */
  prev: unknown;
  /** New value; ignored when `del` is set. */
  value?: unknown;
  /** Remove the key at `path`. */
  del?: true;
}

export interface PatchConflict {
  path: Path;
  /** Value this device tried to write (undefined = delete). */
  mine: unknown;
  /** Value currently on the server. */
  theirs: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Leaf-level differences from `base` to `next`. Objects are diffed per key;
 * equal-length arrays per index (so every score cell is its own op);
 * arrays whose length changed are replaced whole.
 */
export function diff(base: unknown, next: unknown, path: Path = []): PatchOp[] {
  if (deepEqual(base, next)) return [];
  if (isPlainObject(base) && isPlainObject(next)) {
    const ops: PatchOp[] = [];
    for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
      if (!(key in next)) ops.push({ path: [...path, key], prev: base[key], del: true });
      else ops.push(...diff(base[key], next[key], [...path, key]));
    }
    return ops;
  }
  if (Array.isArray(base) && Array.isArray(next) && base.length === next.length) {
    return base.flatMap((v, i) => diff(v, next[i], [...path, i]));
  }
  return [{ path, prev: base, value: next }];
}

export function getAt(obj: unknown, path: Path): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

/** Immutable set/delete at `path`, creating intermediate objects as needed. */
function setAt(obj: unknown, path: Path, value: unknown, del: boolean): unknown {
  if (path.length === 0) return del ? undefined : value;
  const [key, ...rest] = path;
  const container: Record<string | number, unknown> | unknown[] = Array.isArray(obj)
    ? [...obj]
    : isPlainObject(obj)
      ? { ...obj }
      : typeof key === 'number'
        ? []
        : {};
  const child = setAt((container as Record<string | number, unknown>)[key], rest, value, del);
  if (rest.length === 0 && del && !Array.isArray(container)) {
    delete (container as Record<string, unknown>)[key as string];
  } else {
    (container as Record<string | number, unknown>)[key] = child;
  }
  return container;
}

export function applyOp(obj: unknown, op: PatchOp): unknown {
  return setAt(obj, op.path, op.value, !!op.del);
}

export function applyOps<T>(obj: T, ops: PatchOp[]): T {
  return ops.reduce<unknown>(applyOp, obj) as T;
}

/** Like deepEqual, but a missing value and null count as the same (clients fill in defaults the server may lack). */
function sameValue(a: unknown, b: unknown): boolean {
  return (a == null && b == null) || deepEqual(a, b);
}

/**
 * Server side: apply every op whose `prev` still matches; ops that already
 * reached their target value are no-ops; the rest are conflicts.
 */
export function applyChecked(current: unknown, ops: PatchOp[]): { result: unknown; conflicts: PatchConflict[] } {
  let result = current;
  const conflicts: PatchConflict[] = [];
  for (const op of ops) {
    const now = getAt(result, op.path);
    const target = op.del ? undefined : op.value;
    if (sameValue(now, target)) continue;
    if (sameValue(now, op.prev)) result = applyOp(result, op);
    else conflicts.push({ path: op.path, mine: target, theirs: now });
  }
  return { result, conflicts };
}
