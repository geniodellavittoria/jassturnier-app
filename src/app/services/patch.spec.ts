import { applyChecked, applyOp, applyOps, deepEqual, diff, getAt } from './patch';

describe('patch', () => {
  describe('deepEqual', () => {
    it('compares primitives, arrays and plain objects structurally', () => {
      expect(deepEqual(1, 1)).toBeTrue();
      expect(deepEqual(1, '1')).toBeFalse();
      expect(deepEqual(null, undefined)).toBeFalse();
      expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBeTrue();
      expect(deepEqual([1, 2], [1, 2, 3])).toBeFalse();
      expect(deepEqual([1, 2], [1, 3])).toBeFalse();
      expect(deepEqual({ a: { b: [1] } }, { a: { b: [1] } })).toBeTrue();
      expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBeFalse();
      expect(deepEqual({ a: 1 }, { b: 1 })).toBeFalse();
      expect(deepEqual({ a: 1 }, { a: 2 })).toBeFalse();
      expect(deepEqual([], {})).toBeFalse();
      expect(deepEqual({}, null)).toBeFalse();
    });
  });

  describe('diff', () => {
    it('is empty for equal values', () => {
      expect(diff({ a: [1, null] }, { a: [1, null] })).toEqual([]);
    });

    it('emits one op per changed, added and removed key', () => {
      expect(diff({ a: 1, b: 2, c: 3 }, { a: 1, b: 5, d: 4 })).toEqual([
        { path: ['b'], prev: 2, value: 5 },
        { path: ['c'], prev: 3, del: true },
        { path: ['d'], prev: undefined, value: 4 },
      ]);
    });

    it('diffs equal-length arrays per index and replaces resized arrays whole', () => {
      expect(diff({ s: [1, null, 3] }, { s: [1, 2, 3] })).toEqual([{ path: ['s', 1], prev: null, value: 2 }]);
      expect(diff({ s: [1] }, { s: [1, 2] })).toEqual([{ path: ['s'], prev: [1], value: [1, 2] }]);
    });

    it('replaces the root when the types differ', () => {
      expect(diff(null, { a: 1 })).toEqual([{ path: [], prev: null, value: { a: 1 } }]);
    });
  });

  describe('getAt', () => {
    it('follows the path and stops at missing or primitive values', () => {
      const obj = { a: [{ b: 7 }], n: null, s: 'text' };
      expect(getAt(obj, ['a', 0, 'b'])).toBe(7);
      expect(getAt(obj, [])).toBe(obj);
      expect(getAt(obj, ['x', 'y'])).toBeUndefined();
      expect(getAt(obj, ['n', 'y'])).toBeUndefined();
      expect(getAt(obj, ['s', 'length'])).toBeUndefined();
    });
  });

  describe('applyOp', () => {
    it('sets values immutably', () => {
      const obj = { a: { b: 1 }, c: [1, 2] };
      const next = applyOp(obj, { path: ['c', 1], prev: 2, value: 9 }) as typeof obj;
      expect(next).toEqual({ a: { b: 1 }, c: [1, 9] });
      expect(obj.c).toEqual([1, 2]);
      expect(next.a).toBe(obj.a);
    });

    it('creates missing containers, arrays for numeric keys', () => {
      expect(applyOp({}, { path: ['s', 'x', 1], prev: undefined, value: 5 })).toEqual({ s: { x: [undefined, 5] } });
    });

    it('deletes object keys', () => {
      expect(applyOp({ a: 1, b: 2 }, { path: ['a'], prev: 1, del: true })).toEqual({ b: 2 });
    });

    it('clears array slots instead of shifting them', () => {
      expect(applyOp([1, 2, 3], { path: [1], prev: 2, del: true })).toEqual([1, undefined, 3]);
    });

    it('replaces or removes the root', () => {
      expect(applyOp({ a: 1 }, { path: [], prev: { a: 1 }, value: 3 })).toBe(3);
      expect(applyOp({ a: 1 }, { path: [], prev: { a: 1 }, del: true })).toBeUndefined();
    });
  });

  it('applyOps applies ops in order', () => {
    const result = applyOps<Record<string, number>>({ a: 1 }, [
      { path: ['a'], prev: 1, value: 2 },
      { path: ['b'], prev: undefined, value: 3 },
    ]);
    expect(result).toEqual({ a: 2, b: 3 });
  });

  describe('applyChecked', () => {
    it('applies ops whose prev still matches', () => {
      expect(applyChecked({ s: [null, 1] }, [{ path: ['s', 0], prev: null, value: 5 }])).toEqual({
        result: { s: [5, 1] },
        conflicts: [],
      });
    });

    it('reports ops whose value was changed elsewhere as conflicts', () => {
      const current = { s: [7] };
      const { result, conflicts } = applyChecked(current, [{ path: ['s', 0], prev: null, value: 5 }]);
      expect(result).toBe(current);
      expect(conflicts).toEqual([{ path: ['s', 0], mine: 5, theirs: 7 }]);
    });

    it('reports a conflicting delete with mine = undefined', () => {
      const { conflicts } = applyChecked({ a: 2 }, [{ path: ['a'], prev: 1, del: true }]);
      expect(conflicts).toEqual([{ path: ['a'], mine: undefined, theirs: 2 }]);
    });

    it('skips ops that already reached their target', () => {
      const current = { a: 5 };
      expect(applyChecked(current, [{ path: ['a'], prev: 1, value: 5 }]).result).toBe(current);
    });

    it('treats missing and null as the same value', () => {
      expect(applyChecked({}, [{ path: ['a'], prev: null, value: 1 }]).result).toEqual({ a: 1 });
      expect(applyChecked({ a: null }, [{ path: ['a'], prev: 1, del: true }]).conflicts).toEqual([]);
    });
  });
});
