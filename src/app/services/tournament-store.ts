import { computed, effect, inject, Injectable, signal } from '@angular/core';
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
import { applyOp, applyOps, diff, Path, PatchConflict } from './patch';
import { RegistrationApi } from './registration-api';

const STORAGE_KEY = 'jassturnier-state-v1';
const SERVER_PUSH_DEBOUNCE_MS = 600;
/** How often every open device pulls changes made on other devices. */
const SYNC_INTERVAL_MS = 5_000;

const KO_LABELS: Record<KoId, string> = {
  hf1: 'Halbfinal 1',
  hf2: 'Halbfinal 2',
  kleinerFinal: 'Kleiner Final',
  final: 'Final',
};

export interface GroupView {
  group: Group;
  standings: StandingsEntry[];
  schedule: ReturnType<typeof roundRobin>;
}

/** Merge a parsed blob (localStorage or server) onto tournament defaults, tolerating older/missing fields. */
function hydrateTournament(parsed: unknown): Tournament | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Partial<Tournament>;
  if (!Array.isArray(p.groups) || !p.teams) return null;
  return { ...emptyTournament(), ...p, ko: { ...emptyKo(), ...p.ko } };
}

@Injectable({ providedIn: 'root' })
export class TournamentStore {
  private readonly api = inject(RegistrationApi);
  private readonly state = signal<Tournament>(this.load());
  /** Last state the server confirmed; undefined until the first successful pull, null if the server has none yet. */
  private serverBase: Tournament | null | undefined = undefined;
  private serverVersion = 0;
  /** A pull or flush is in flight — they must not interleave, both rebase `state` onto the server copy. */
  private syncing = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly conflictList = signal<PatchConflict[]>([]);

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
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
      } catch {
        // Storage may be unavailable (private mode, quota); the app keeps working in memory.
      }
    });
    void this.pull();
    setInterval(() => {
      if (document.visibilityState === 'visible') void this.pull();
    }, SYNC_INTERVAL_MS);
  }

  // ── Cross-device sync ────────────────────────────────────────────────────
  //
  // The server (D1, via /api/tournament) holds the shared copy; several
  // admins enter results at once from different devices. `serverBase` is the
  // last state the server confirmed; `state` is that plus this device's
  // unsent edits. Only the difference (diff(serverBase, state)) is sent, each
  // op carrying the value it was based on — the server applies it only if
  // nobody changed that value meanwhile, else returns it as a conflict for
  // the admin to decide (see ConflictDialog). Never sending the whole state
  // means a stale device can't wipe other admins' entries.

  /** Pull the server copy (on load and every few seconds) and keep unsent local edits on top. */
  private async pull(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const remote = await this.api.getTournament();
      if (!remote) return; // offline — retry on the next tick
      if (this.serverBase === undefined) {
        // First contact: the server copy wins over whatever localStorage had.
        this.serverBase = hydrateTournament(remote.tournament);
        this.serverVersion = remote.version;
        if (this.serverBase) this.state.set(this.serverBase);
      } else if (remote.version > this.serverVersion) {
        const pending = diff(this.serverBase, this.state());
        this.serverBase = hydrateTournament(remote.tournament);
        this.serverVersion = remote.version;
        if (this.serverBase) this.state.set(applyOps(this.serverBase, pending));
      }
    } finally {
      this.syncing = false;
    }
    if (diff(this.serverBase, this.state()).length > 0) this.scheduleFlush();
  }

  /** Every store mutation goes through here so the change gets sent to the server. */
  private mutate(fn: (t: Tournament) => Tournament): void {
    this.state.update(fn);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), SERVER_PUSH_DEBOUNCE_MS);
  }

  private async flush(): Promise<void> {
    // Not before the first successful pull — otherwise a stale localStorage
    // snapshot would be diffed against nothing and sent as a full overwrite.
    if (this.serverBase === undefined || this.syncing) return;
    const sent = this.state();
    const ops = diff(this.serverBase, sent);
    if (ops.length === 0) return;
    this.syncing = true;
    try {
      const res = await this.api.patchTournament(ops);
      this.serverBase = hydrateTournament(res.tournament);
      this.serverVersion = res.version;
      // Edits made while the request was in flight stay on top.
      if (this.serverBase) this.state.set(applyOps(this.serverBase, diff(sent, this.state())));
      if (res.conflicts.length > 0) this.conflictList.update((list) => [...list, ...res.conflicts]);
    } catch {
      // Offline or not logged in: the edits stay pending and are retried on the next pull.
    } finally {
      this.syncing = false;
    }
  }

  /** Values another device changed while this one edited them — waiting for the admin's decision. */
  readonly conflicts = this.conflictList.asReadonly();

  /** Keep this device's value (overwrites the other device's) or accept the server's. */
  resolveConflict(conflict: PatchConflict, keepMine: boolean): void {
    this.conflictList.update((list) => list.filter((c) => c !== conflict));
    if (!keepMine) return; // state already holds the server's value
    const op =
      conflict.mine === undefined
        ? { path: conflict.path, prev: conflict.theirs, del: true as const }
        : { path: conflict.path, prev: conflict.theirs, value: conflict.mine };
    this.mutate((t) => applyOp(t, op) as Tournament);
  }

  /** Human-readable location of a conflicting value, e.g. "Gruppenphase · Gruppe A · Bock-Stars · Runde 3". */
  describeConflict(path: Path): string {
    const t = this.state();
    const [root, a, b] = path;
    if ((root === 'groupScores' || root === 'finalScores') && typeof a === 'string' && typeof b === 'number') {
      const groups = root === 'groupScores' ? t.groups : t.finalGroups;
      const group = groups.find((g) => g.teamIds.includes(a));
      const stage = root === 'groupScores' ? 'Gruppenphase' : 'Finalrunde';
      return [stage, group?.name, t.teams[a]?.name ?? 'Team', `Runde ${b + 1}`].filter(Boolean).join(' · ');
    }
    if (root === 'ko' && typeof a === 'string' && (b === 'pointsA' || b === 'pointsB')) {
      const match = t.ko[a as KoId];
      const teamId = b === 'pointsA' ? match?.teamA : match?.teamB;
      return ['KO', KO_LABELS[a as KoId] ?? a, this.team(teamId ?? null)?.name].filter(Boolean).join(' · ');
    }
    return 'Turnierdaten (Einrichtung)';
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

  updateMeta(
    patch: Partial<
      Pick<
        Tournament,
        'name' | 'year' | 'groupRounds' | 'finalRounds' | 'dropWorst' | 'qualifiersPerGroup' | 'presentationStage'
      >
    >,
  ): void {
    this.mutate((t) => ({ ...t, ...patch }));
  }

  addGroup(): void {
    this.mutate((t) => {
      const letter = String.fromCharCode(65 + t.groups.length);
      const group: Group = { id: `g-${crypto.randomUUID()}`, name: `Gruppe ${letter}`, teamIds: [] };
      return { ...t, groups: [...t.groups, group] };
    });
  }

  renameGroup(groupId: string, name: string): void {
    this.mutate((t) => ({
      ...t,
      groups: t.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
    }));
  }

  removeGroup(groupId: string): void {
    this.mutate((t) => {
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

  addTeam(groupId: string, name: string, players: string[], registrationId?: number): void {
    this.mutate((t) => {
      const id = `t-${crypto.randomUUID()}`;
      const team: Team = { id, name, players: players.filter((p) => p.trim().length > 0), registrationId };
      return {
        ...t,
        teams: { ...t.teams, [id]: team },
        groupScores: { ...t.groupScores, [id]: Array(t.groupRounds).fill(null) },
        groups: t.groups.map((g) => (g.id === groupId ? { ...g, teamIds: [...g.teamIds, id] } : g)),
      };
    });
  }

  updateTeam(teamId: string, patch: Partial<Pick<Team, 'name' | 'players'>>): void {
    this.mutate((t) => {
      const team = t.teams[teamId];
      if (!team) return t;
      return { ...t, teams: { ...t.teams, [teamId]: { ...team, ...patch } } };
    });
  }

  removeTeam(teamId: string): void {
    this.mutate((t) => {
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
    this.mutate(() => demoTournament2025());
  }

  resetAll(): void {
    this.mutate(() => emptyTournament());
  }

  /** Keep groups and teams, clear every score and the whole Finalrunde. */
  resetScores(): void {
    this.mutate((t) => {
      const groupScores = Object.fromEntries(
        Object.keys(t.teams).map((id) => [id, Array(t.groupRounds).fill(null)]),
      );
      return { ...t, groupScores, finalGroups: [], finalScores: {}, ko: emptyKo() };
    });
  }

  // ── Scores ───────────────────────────────────────────────────────────────

  setGroupScore(teamId: string, round: number, value: number | null): void {
    this.mutate((t) => {
      const rounds = [...(t.groupScores[teamId] ?? Array(t.groupRounds).fill(null))];
      while (rounds.length < t.groupRounds) rounds.push(null);
      rounds[round] = value;
      return { ...t, groupScores: { ...t.groupScores, [teamId]: rounds } };
    });
  }

  setFinalScore(teamId: string, round: number, value: number | null): void {
    this.mutate((t) => {
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
    this.mutate((t) => {
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

    this.mutate((t) => ({
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
    this.mutate((t) => {
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
    this.mutate((t) => ({
      ...t,
      ko: { ...t.ko, [id]: { ...t.ko[id], [side === 'A' ? 'teamA' : 'teamB']: teamId } },
    }));
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private load(): Tournament {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const hydrated = hydrateTournament(JSON.parse(raw));
        if (hydrated) return hydrated;
      }
    } catch {
      // Corrupt or unavailable storage: start fresh.
    }
    return emptyTournament();
  }
}
