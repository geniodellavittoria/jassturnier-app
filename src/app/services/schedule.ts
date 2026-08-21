import { ScoreMap, StandingsEntry, Team } from '../models/tournament';

export interface Pairing {
  /** 1-based table number within the round. */
  table: number;
  homeId: string;
  awayId: string;
}

/** True once both sides of a match have entered points that don't sum to `max`. */
export function matchPointsMismatch(a: number | null, b: number | null, max: number): boolean {
  return a !== null && b !== null && a + b !== max;
}

/** Count of mismatched pairings across a whole schedule, given the per-team-per-round scores. */
export function countMismatches(schedule: Pairing[][], scores: ScoreMap, max: number): number {
  let count = 0;
  schedule.forEach((round, r) => {
    round.forEach((pairing) => {
      const home = scores[pairing.homeId]?.[r] ?? null;
      const away = scores[pairing.awayId]?.[r] ?? null;
      if (matchPointsMismatch(home, away, max)) count++;
    });
  });
  return count;
}

// Fixed reference schedule for 6-team groups (matches the tournament's
// canonical Excel sheet) — a valid complete round-robin (all 15 pairs among
// 6 teams appear exactly once across 5 rounds), but a different pairing
// order than the generic circle-method algorithm below produces. Numbers
// are 1-based positions within the group's team list.
const SIX_TEAM_SCHEDULE: [number, number][][] = [
  [
    [3, 1],
    [2, 4],
    [5, 6],
  ],
  [
    [4, 6],
    [5, 3],
    [1, 2],
  ],
  [
    [3, 2],
    [6, 1],
    [5, 4],
  ],
  [
    [5, 2],
    [1, 4],
    [3, 6],
  ],
  [
    [1, 5],
    [2, 6],
    [3, 4],
  ],
];

/**
 * Round-robin schedule. Six-team groups use the fixed reference order above;
 * every other size uses the circle method, which for n teams yields n-1
 * rounds (n rounds if n is odd, with one team pausing per round).
 * Deterministic for a given team order.
 */
export function roundRobin(teamIds: string[]): Pairing[][] {
  const ids = [...teamIds];
  if (ids.length < 2) return [];
  if (ids.length === 6) {
    return SIX_TEAM_SCHEDULE.map((round) =>
      round.map(([home, away], i) => ({ table: i + 1, homeId: ids[home - 1], awayId: ids[away - 1] })),
    );
  }
  const bye = ids.length % 2 === 1;
  if (bye) ids.push('__bye__');
  const n = ids.length;
  const rounds: Pairing[][] = [];
  const rotating = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const order = [ids[0], ...rotating];
    const pairings: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i];
      const b = order[n - 1 - i];
      if (a === '__bye__' || b === '__bye__') continue;
      pairings.push({ table: pairings.length + 1, homeId: a, awayId: b });
    }
    rounds.push(pairings);
    rotating.unshift(rotating.pop()!);
  }
  return rounds;
}

/**
 * Standings for one group. Ranking total = sum of played rounds, minus the
 * worst round when `dropWorst` is set and at least two rounds were played
 * (Streichresultat, as in the original Excel).
 */
export function computeStandings(
  teamIds: string[],
  teams: Record<string, Team>,
  scores: ScoreMap,
  roundCount: number,
  dropWorst: boolean,
): StandingsEntry[] {
  const entries = teamIds
    .map((id) => {
      const team = teams[id];
      const rounds = normalizeRounds(scores[id], roundCount);
      const played = rounds.filter((v): v is number => v !== null);
      const sum = played.reduce((a, b) => a + b, 0);
      let droppedRound: number | null = null;
      let total = sum;
      if (dropWorst && played.length >= 2) {
        const worst = Math.min(...played);
        droppedRound = rounds.indexOf(worst);
        total = sum - worst;
      }
      return {
        team,
        rounds,
        sum,
        total,
        droppedRound,
        rank: 0,
        playedRounds: played.length,
      } satisfies StandingsEntry;
    })
    .filter((e) => !!e.team);

  entries.sort((a, b) => b.total - a.total || b.sum - a.sum || a.team.name.localeCompare(b.team.name));
  entries.forEach((e, i) => (e.rank = i + 1));
  return entries;
}

export function normalizeRounds(values: (number | null)[] | undefined, roundCount: number): (number | null)[] {
  const rounds = [...(values ?? [])];
  while (rounds.length < roundCount) rounds.push(null);
  return rounds.slice(0, roundCount);
}

export function stageComplete(teamIds: string[], scores: ScoreMap, roundCount: number): boolean {
  return teamIds.every((id) =>
    normalizeRounds(scores[id], roundCount).every((v) => v !== null),
  );
}
