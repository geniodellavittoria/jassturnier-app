/** Fixed total pot of points in a single group-phase Jass match. */
export const MAX_MATCH_POINTS_GROUP = 1884;
/** Fixed total pot of points in a single Finalrunde or KO-phase Jass match. */
export const MAX_MATCH_POINTS_FINAL = 1256;

export interface Team {
  id: string;
  name: string;
  players: string[];
}

export interface Group {
  id: string;
  name: string;
  teamIds: string[];
}

/** Points per team, indexed by round (0-based). `null` = not yet played. */
export type ScoreMap = Record<string, (number | null)[]>;

export type KoId = 'hf1' | 'hf2' | 'kleinerFinal' | 'final';

export interface KoMatch {
  teamA: string | null;
  teamB: string | null;
  pointsA: number | null;
  pointsB: number | null;
}

/**
 * Which stage the presentation slideshow shows. 'auto' infers the current
 * stage from tournament progress (latest stage with data); the others pin
 * it regardless of progress.
 */
export type PresentationStage = 'auto' | 'group' | 'final' | 'ko';

export interface Tournament {
  name: string;
  year: number;
  /** Rounds in the group phase (Excel: 5). */
  groupRounds: number;
  /** Drop the worst round from the group-phase total (Streichresultat). */
  dropWorst: boolean;
  /** Teams advancing per group into the Finalrunde (Excel: 2). */
  qualifiersPerGroup: number;
  teams: Record<string, Team>;
  groups: Group[];
  groupScores: ScoreMap;
  /** Rounds in the Finalrunde groups (Excel: 3, no Streichresultat). */
  finalRounds: number;
  finalGroups: Group[];
  finalScores: ScoreMap;
  ko: Record<KoId, KoMatch>;
  presentationStage: PresentationStage;
}

export interface StandingsEntry {
  team: Team;
  rounds: (number | null)[];
  /** Raw sum of all played rounds. */
  sum: number;
  /** Ranking total: sum minus worst round if Streichresultat applies. */
  total: number;
  /** The round index that was dropped, or null. */
  droppedRound: number | null;
  rank: number;
  playedRounds: number;
}

export function emptyKo(): Record<KoId, KoMatch> {
  const empty = (): KoMatch => ({ teamA: null, teamB: null, pointsA: null, pointsB: null });
  return { hf1: empty(), hf2: empty(), kleinerFinal: empty(), final: empty() };
}

export function emptyTournament(): Tournament {
  return {
    name: 'Jassturnier',
    year: new Date().getFullYear(),
    groupRounds: 5,
    dropWorst: true,
    qualifiersPerGroup: 2,
    teams: {},
    groups: [],
    groupScores: {},
    finalRounds: 3,
    finalGroups: [],
    finalScores: {},
    ko: emptyKo(),
    presentationStage: 'auto',
  };
}
