import { Team } from '../models/tournament';
import { computeStandings, matchPointsMismatch, maxOf, normalizeRounds, roundRobin, stageComplete } from './schedule';

function team(id: string, name = id): Team {
  return { id, name, players: [] };
}

/** Every unordered pair of the schedule, e.g. "a-b". */
function pairs(rounds: ReturnType<typeof roundRobin>): string[] {
  return rounds.flat().map((p) => [p.homeId, p.awayId].sort().join('-'));
}

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `t${i + 1}`);
}

describe('schedule', () => {
  it('matchPointsMismatch only flags complete matches that miss the total', () => {
    expect(matchPointsMismatch(null, 100, 157)).toBeFalse();
    expect(matchPointsMismatch(100, null, 157)).toBeFalse();
    expect(matchPointsMismatch(100, 57, 157)).toBeFalse();
    expect(matchPointsMismatch(100, 50, 157)).toBeTrue();
  });

  it('maxOf ignores nulls', () => {
    expect(maxOf([])).toBeNull();
    expect(maxOf([null, null])).toBeNull();
    expect(maxOf([3, null, 9, 4])).toBe(9);
  });

  describe('roundRobin', () => {
    it('is empty for fewer than two teams', () => {
      expect(roundRobin([])).toEqual([]);
      expect(roundRobin(['a'])).toEqual([]);
    });

    it('uses the reference order for four teams', () => {
      expect(roundRobin(['a', 'b', 'c', 'd'])).toEqual([
        [
          { table: 1, homeId: 'a', awayId: 'b' },
          { table: 2, homeId: 'c', awayId: 'd' },
        ],
        [
          { table: 1, homeId: 'a', awayId: 'c' },
          { table: 2, homeId: 'b', awayId: 'd' },
        ],
        [
          { table: 1, homeId: 'd', awayId: 'a' },
          { table: 2, homeId: 'b', awayId: 'c' },
        ],
      ]);
    });

    it('uses the reference order for six teams', () => {
      const rounds = roundRobin(ids(6));
      expect(rounds.length).toBe(5);
      expect(rounds[0][0]).toEqual({ table: 1, homeId: 't3', awayId: 't1' });
    });

    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      it(`plays every pair exactly once with ${n} teams`, () => {
        const rounds = roundRobin(ids(n));
        const all = pairs(rounds);
        expect(all.length).toBe((n * (n - 1)) / 2);
        expect(new Set(all).size).toBe(all.length);
        expect(rounds.length).toBe(n % 2 === 0 ? n - 1 : n);
        for (const round of rounds) {
          const playing = round.flatMap((p) => [p.homeId, p.awayId]);
          expect(new Set(playing).size).withContext('nobody plays twice per round').toBe(playing.length);
          expect(round.map((p) => p.table)).toEqual(round.map((_, i) => i + 1));
        }
      });
    }
  });

  describe('computeStandings', () => {
    const teams = { a: team('a', 'Alpha'), b: team('b', 'Bravo'), c: team('c', 'Charlie') };

    it('drops the worst played round when enabled', () => {
      const [entry] = computeStandings(['a'], teams, { a: [500, 300, null] }, 3, true);
      expect(entry).toEqual({
        team: teams.a,
        rounds: [500, 300, null],
        sum: 800,
        total: 500,
        droppedRound: 1,
        rank: 1,
        playedRounds: 2,
      });
    });

    it('drops nothing with fewer than two played rounds or when disabled', () => {
      expect(computeStandings(['a'], teams, { a: [500] }, 3, true)[0].droppedRound).toBeNull();
      const [entry] = computeStandings(['a'], teams, { a: [500, 300] }, 2, false);
      expect(entry.total).toBe(800);
      expect(entry.droppedRound).toBeNull();
    });

    it('ranks by total, then raw sum, then name', () => {
      const standings = computeStandings(
        ['c', 'b', 'a'],
        teams,
        { a: [400, 100], b: [400, 200], c: [400, 200] },
        2,
        true,
      );
      expect(standings.map((e) => [e.team.id, e.rank])).toEqual([
        ['b', 1],
        ['c', 2],
        ['a', 3],
      ]);
    });

    it('skips unknown teams and treats missing scores as unplayed', () => {
      const standings = computeStandings(['a', 'ghost'], teams, {}, 2, true);
      expect(standings.length).toBe(1);
      expect(standings[0].rounds).toEqual([null, null]);
      expect(standings[0].total).toBe(0);
    });
  });

  it('normalizeRounds pads and truncates to the round count', () => {
    expect(normalizeRounds(undefined, 2)).toEqual([null, null]);
    expect(normalizeRounds([1], 3)).toEqual([1, null, null]);
    expect(normalizeRounds([1, 2, 3], 2)).toEqual([1, 2]);
  });

  it('stageComplete requires every round of every team', () => {
    expect(stageComplete(['a', 'b'], { a: [1, 2], b: [3, 4] }, 2)).toBeTrue();
    expect(stageComplete(['a', 'b'], { a: [1, 2], b: [3, null] }, 2)).toBeFalse();
    expect(stageComplete(['a'], { a: [1] }, 2)).toBeFalse();
    expect(stageComplete([], {}, 2)).withContext('a group without teams has not started').toBeFalse();
  });
});
