import { computed, effect, Injectable, signal } from '@angular/core';
import {
  emptyKo,
  emptyTournament,
  Group,
  KoId,
  StandingsEntry,
  Team,
  Tournament,
} from '../models/tournament';
import { computeStandings, roundRobin, stageComplete } from './schedule';
import { demoTournament2025 } from './demo-2025';

const STORAGE_KEY = 'jassturnier-state-v1';

export interface GroupView {
  group: Group;
  standings: StandingsEntry[];
  schedule: ReturnType<typeof roundRobin>;
}

@Injectable({ providedIn: 'root' })
export class TournamentStore {
  private readonly state = signal<Tournament>(this.load());

  readonly tournament = this.state.asReadonly();

  readonly groupViews = computed<GroupView[]>(() => {
    const t = this.state();
    return t.groups.map((group) => ({
      group,
      standings: computeStandings(group.teamIds, t.teams, t.groupScores, t.groupRounds, t.dropWorst),
      schedule: roundRobin(group.teamIds),
    }));
  });

  readonly finalGroupViews = computed<GroupView[]>(() => {
    const t = this.state();
    return t.finalGroups.map((group) => ({
      group,
      standings: computeStandings(group.teamIds, t.teams, t.finalScores, t.finalRounds, false),
      schedule: roundRobin(group.teamIds),
    }));
  });

  readonly groupPhaseComplete = computed(() => {
    const t = this.state();
    return (
      t.groups.length > 0 &&
      t.groups.every((g) => stageComplete(g.teamIds, t.groupScores, t.groupRounds))
    );
  });

  readonly finalGroupsComplete = computed(() => {
    const t = this.state();
    return (
      t.finalGroups.length > 0 &&
      t.finalGroups.every((g) => stageComplete(g.teamIds, t.finalScores, t.finalRounds))
    );
  });

  readonly champion = computed<Team | null>(() => {
    const { final } = this.state().ko;
    const winnerId = this.winnerOf(final);
    return winnerId ? (this.state().teams[winnerId] ?? null) : null;
  });

  constructor() {
    effect(() => {
      const t = this.state();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
      } catch {
        // Storage may be unavailable (private mode, quota); the app keeps working in memory.
      }
    });
  }

  team(id: string | null): Team | null {
    return id ? (this.state().teams[id] ?? null) : null;
  }

  winnerOf(match: { teamA: string | null; teamB: string | null; pointsA: number | null; pointsB: number | null }): string | null {
    if (match.pointsA === null || match.pointsB === null || match.pointsA === match.pointsB) return null;
    return match.pointsA > match.pointsB ? match.teamA : match.teamB;
  }

  loserOf(match: { teamA: string | null; teamB: string | null; pointsA: number | null; pointsB: number | null }): string | null {
    if (match.pointsA === null || match.pointsB === null || match.pointsA === match.pointsB) return null;
    return match.pointsA > match.pointsB ? match.teamB : match.teamA;
  }

  // ── Setup ────────────────────────────────────────────────────────────────

  updateMeta(patch: Partial<Pick<Tournament, 'name' | 'year' | 'groupRounds' | 'finalRounds' | 'dropWorst' | 'qualifiersPerGroup'>>): void {
    this.state.update((t) => ({ ...t, ...patch }));
  }

  addGroup(): void {
    this.state.update((t) => {
      const letter = String.fromCharCode(65 + t.groups.length);
      const group: Group = { id: `g-${crypto.randomUUID()}`, name: `Gruppe ${letter}`, teamIds: [] };
      return { ...t, groups: [...t.groups, group] };
    });
  }

  renameGroup(groupId: string, name: string): void {
    this.state.update((t) => ({
      ...t,
      groups: t.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
    }));
  }

  removeGroup(groupId: string): void {
    this.state.update((t) => {
      const group = t.groups.find((g) => g.id === groupId);
      if (!group) return t;
      const teams = { ...t.teams };
      const groupScores = { ...t.groupScores };
      for (const id of group.teamIds) {
        delete teams[id];
        delete groupScores[id];
      }
      return { ...t, teams, groupScores, groups: t.groups.filter((g) => g.id !== groupId) };
    });
  }

  addTeam(groupId: string, name: string, players: string[]): void {
    this.state.update((t) => {
      const id = `t-${crypto.randomUUID()}`;
      const team: Team = { id, name, players: players.filter((p) => p.trim().length > 0) };
      return {
        ...t,
        teams: { ...t.teams, [id]: team },
        groupScores: { ...t.groupScores, [id]: Array(t.groupRounds).fill(null) },
        groups: t.groups.map((g) => (g.id === groupId ? { ...g, teamIds: [...g.teamIds, id] } : g)),
      };
    });
  }

  updateTeam(teamId: string, patch: Partial<Pick<Team, 'name' | 'players'>>): void {
    this.state.update((t) => {
      const team = t.teams[teamId];
      if (!team) return t;
      return { ...t, teams: { ...t.teams, [teamId]: { ...team, ...patch } } };
    });
  }

  removeTeam(teamId: string): void {
    this.state.update((t) => {
      const teams = { ...t.teams };
      const groupScores = { ...t.groupScores };
      delete teams[teamId];
      delete groupScores[teamId];
      return {
        ...t,
        teams,
        groupScores,
        groups: t.groups.map((g) => ({ ...g, teamIds: g.teamIds.filter((id) => id !== teamId) })),
      };
    });
  }

  loadDemo(): void {
    this.state.set(demoTournament2025());
  }

  resetAll(): void {
    this.state.set(emptyTournament());
  }

  /** Keep groups and teams, clear every score and the whole Finalrunde. */
  resetScores(): void {
    this.state.update((t) => {
      const groupScores = Object.fromEntries(
        Object.keys(t.teams).map((id) => [id, Array(t.groupRounds).fill(null)]),
      );
      return { ...t, groupScores, finalGroups: [], finalScores: {}, ko: emptyKo() };
    });
  }

  // ── Scores ───────────────────────────────────────────────────────────────

  setGroupScore(teamId: string, round: number, value: number | null): void {
    this.state.update((t) => {
      const rounds = [...(t.groupScores[teamId] ?? Array(t.groupRounds).fill(null))];
      while (rounds.length < t.groupRounds) rounds.push(null);
      rounds[round] = value;
      return { ...t, groupScores: { ...t.groupScores, [teamId]: rounds } };
    });
  }

  setFinalScore(teamId: string, round: number, value: number | null): void {
    this.state.update((t) => {
      const rounds = [...(t.finalScores[teamId] ?? Array(t.finalRounds).fill(null))];
      while (rounds.length < t.finalRounds) rounds.push(null);
      rounds[round] = value;
      return { ...t, finalScores: { ...t.finalScores, [teamId]: rounds } };
    });
  }

  // ── Finalrunde ───────────────────────────────────────────────────────────

  /**
   * Seed the Finalrunde from the current group standings: the top
   * `qualifiersPerGroup` of every group, distributed serpentine-style across
   * `ceil(qualifiers / 4)` groups of four.
   */
  drawFinalGroups(): void {
    const views = this.groupViews();
    this.state.update((t) => {
      const pools: string[][] = [];
      for (let place = 0; place < t.qualifiersPerGroup; place++) {
        pools.push(
          views
            .map((v) => v.standings[place]?.team.id)
            .filter((id): id is string => !!id),
        );
      }
      const qualifierCount = pools.reduce((a, p) => a + p.length, 0);
      const groupCount = Math.max(1, Math.ceil(qualifierCount / 4));
      const finalGroups: Group[] = Array.from({ length: groupCount }, (_, i) => ({
        id: `fg-${i + 1}`,
        name: `Finalgruppe ${i + 1}`,
        teamIds: [],
      }));
      pools.forEach((pool, poolIndex) => {
        const order = poolIndex % 2 === 0 ? finalGroups : [...finalGroups].reverse();
        pool.forEach((teamId, i) => order[i % groupCount].teamIds.push(teamId));
      });
      const finalScores = Object.fromEntries(
        finalGroups.flatMap((g) => g.teamIds.map((id) => [id, Array(t.finalRounds).fill(null)])),
      );
      return { ...t, finalGroups, finalScores, ko: emptyKo() };
    });
  }

  /**
   * Seed the Halbfinals from the Finalrunde standings: every group winner
   * plus the best runner-up (2025 mode). W1 vs best runner-up, W2 vs W3.
   * With 2 groups: W1 vs R2, W2 vs R1. With 4+ groups: winners only, 1v4, 2v3.
   */
  seedSemifinals(): void {
    const views = this.finalGroupViews();
    const winners = views
      .map((v) => v.standings[0])
      .filter((e): e is StandingsEntry => !!e)
      .sort((a, b) => b.total - a.total);
    const runnersUp = views
      .map((v) => v.standings[1])
      .filter((e): e is StandingsEntry => !!e)
      .sort((a, b) => b.total - a.total);

    let four: (StandingsEntry | undefined)[] = [];
    if (winners.length >= 4) {
      four = winners.slice(0, 4);
    } else if (winners.length === 3) {
      four = [...winners, runnersUp[0]];
    } else if (winners.length === 2) {
      four = [winners[0], winners[1], runnersUp[0], runnersUp[1]];
    }
    const [s1, s2, s3, s4] = four;
    if (!s1 || !s2 || !s3 || !s4) return;

    this.state.update((t) => ({
      ...t,
      ko: {
        hf1: { teamA: s1.team.id, teamB: s4.team.id, pointsA: null, pointsB: null },
        hf2: { teamA: s2.team.id, teamB: s3.team.id, pointsA: null, pointsB: null },
        kleinerFinal: { teamA: null, teamB: null, pointsA: null, pointsB: null },
        final: { teamA: null, teamB: null, pointsA: null, pointsB: null },
      },
    }));
  }

  setKoPoints(id: KoId, side: 'A' | 'B', value: number | null): void {
    this.state.update((t) => {
      const ko = { ...t.ko, [id]: { ...t.ko[id], [side === 'A' ? 'pointsA' : 'pointsB']: value } };
      // Winners of the Halbfinals meet in the Final, losers in the Kleiner Final.
      if (id === 'hf1' || id === 'hf2') {
        const w1 = this.winnerOf(ko.hf1);
        const w2 = this.winnerOf(ko.hf2);
        const l1 = this.loserOf(ko.hf1);
        const l2 = this.loserOf(ko.hf2);
        ko.final = { ...ko.final, teamA: w1, teamB: w2 };
        ko.kleinerFinal = { ...ko.kleinerFinal, teamA: l1, teamB: l2 };
      }
      return { ...t, ko };
    });
  }

  setKoTeam(id: KoId, side: 'A' | 'B', teamId: string | null): void {
    this.state.update((t) => ({
      ...t,
      ko: { ...t.ko, [id]: { ...t.ko[id], [side === 'A' ? 'teamA' : 'teamB']: teamId } },
    }));
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private load(): Tournament {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Tournament;
        if (parsed && Array.isArray(parsed.groups) && parsed.teams) {
          return { ...emptyTournament(), ...parsed, ko: { ...emptyKo(), ...parsed.ko } };
        }
      }
    } catch {
      // Corrupt or unavailable storage: start fresh.
    }
    return emptyTournament();
  }
}
