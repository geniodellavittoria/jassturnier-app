import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { fromEvent, map } from 'rxjs';
import { AdminAuth } from '../../services/admin-auth';
import { KoId, KoMatch, ScoreMap, Team } from '../../models/tournament';
import { computeStandings, maxOf, normalizeRounds, roundRobin } from '../../services/schedule';
import { GroupView, TournamentStore } from '../../services/tournament-store';
import { SecretTap } from '../../shared/secret-tap';
import { StandingsTable } from '../../shared/standings-table';
import { SuitBadge } from '../../shared/suit-badge';
import { PresentSchedule } from './present-schedule';

// Keep in sync with the `@media (max-width: 48rem)` breakpoint in present-page.scss.
const NARROW_BREAKPOINT_PX = 768;

interface TitleSlide {
  kind: 'title';
}
interface GroupsOverviewSlide {
  kind: 'groups-overview';
  stage: 'Gruppenphase' | 'Finalrunde';
  /** Each stage rotates between its Rangliste and its Spielplan. */
  content: 'standings' | 'schedule';
  views: GroupView[];
  highlightTop: number;
  cols: number;
  rows: number;
  tableRowCount: number;
  /** Highest single round score across the stage, highlighted in every group (group phase only). */
  topScore: number | null;
  /** Made-up groups shown while the stage has no data yet. */
  placeholder?: boolean;
}
interface KoSlide {
  kind: 'ko';
  /** Made-up bracket shown while no KO match has teams yet. */
  placeholder?: boolean;
}
type Slide = TitleSlide | GroupsOverviewSlide | KoSlide;

const SLIDE_INTERVAL_MS = 12_000;

/** Shape of the layout preview shown while a stage has no teams yet (modelled on 2025). */
interface PlaceholderShape {
  teamsPerGroup: number;
  /** Group count when not even empty groups exist yet. */
  fallbackGroups: number;
  minPoints: number;
  pointSpan: number;
  /** Leave the last round open in every other group, to preview partial tables. */
  openLastRoundInOddGroups: boolean;
  /** Offset into PLACEHOLDER_TEAM_NAMES, so stages don't all show the same teams. */
  nameOffset: number;
}
const GROUP_PLACEHOLDER: PlaceholderShape = {
  teamsPerGroup: 6,
  fallbackGroups: 6,
  minPoints: 620,
  pointSpan: 640,
  openLastRoundInOddGroups: true,
  nameOffset: 0,
};
/** Finalists really come from the groups, but mapping them across stages isn't worth it for a preview. */
const FINAL_PLACEHOLDER: PlaceholderShape = {
  teamsPerGroup: 4,
  fallbackGroups: 3,
  minPoints: 480,
  pointSpan: 300,
  openLastRoundInOddGroups: false,
  nameOffset: 2,
};

const PLACEHOLDER_TEAM_NAMES = [
  'Trumpf-Buur & Co.', 'Obenabe Express', 'Undenufe Ultras', 'Die Stöckjäger', 'Nell-Näll', 'Rosen-Kavaliere',
  'Schällen-Schreck', 'Eichle-Hörnli', 'Wyys-Wunder', 'Kreuz & Quer', 'Die Matschmacher', 'Bock-Stars',
  'Schilten-Bürger', 'Trumpf im Täschli', 'Die Kartenhäusler', 'Gwätt-Wätt', 'Ass-Asse', 'Stich-Fest',
  'Puur ohni Buur', 'Jass-Pfadi', 'Schieber-Bande', 'Die Sächsi-Sammler', 'Kontermatsch', 'Bierdeckel-Profis',
  'Differenzler-Diven', 'Coiffeur-Salon', 'Die Weis-Heiten', 'Zwätschge-Trumpf', 'Ober sticht Under', 'Sibni im Ärmel',
  'Chrüz-Fahrer', 'Die Nüni-Fänger', 'Stöck ab!', 'Kartegrüebler', 'Jassbrüeder', 'Letschte Stich',
];

/**
 * Deterministic point generator (seeded LCG) so placeholders don't reshuffle
 * on every sync. Uses the high bits — the LCG's low bits cycle quickly.
 */
function seededPoints(seed: number, min: number, span: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return min + ((seed >>> 16) % span);
  };
}

/** Made-up, but plausible, standings (incl. Streichresultat/top score where the stage has them). */
function placeholderGroupViews(
  groupNames: string[],
  fallbackPrefix: string,
  rounds: number,
  dropWorst: boolean,
  shape: PlaceholderShape,
): GroupView[] {
  const names =
    groupNames.length > 0
      ? groupNames
      : Array.from({ length: shape.fallbackGroups }, (_, g) => `${fallbackPrefix} ${g + 1}`);
  const nextPoints = seededPoints(2026, shape.minPoints, shape.pointSpan);
  const teams: Record<string, Team> = {};
  const scores: ScoreMap = {};
  return names.map((name, g) => {
    const teamIds = Array.from({ length: shape.teamsPerGroup }, (_, i) => {
      const id = `placeholder-${g}-${i}`;
      const n = shape.nameOffset + g * shape.teamsPerGroup + i;
      teams[id] = { id, name: PLACEHOLDER_TEAM_NAMES[n % PLACEHOLDER_TEAM_NAMES.length], players: [] };
      const played = shape.openLastRoundInOddGroups && g % 2 === 1 ? rounds - 1 : rounds;
      scores[id] = Array.from({ length: rounds }, (_, r) => (r < played ? nextPoints() : null));
      return id;
    });
    return {
      group: { id: `placeholder-${g}`, name, teamIds },
      standings: computeStandings(teamIds, teams, scores, rounds, dropWorst),
      schedule: roundRobin(teamIds),
    };
  });
}
interface KoData {
  ko: Record<KoId, KoMatch>;
  teams: Record<string, Team>;
}

/** A fully played KO bracket (semis → kleiner Final/Final) so the winner highlights and podium show. */
function placeholderKo(): KoData {
  const teams: Record<string, Team> = {};
  const [a, b, c, d] = ['Undenufe Ultras', 'Trumpf im Täschli', 'Ober sticht Under', 'Jassbrüeder'].map((name, i) => {
    const id = `placeholder-ko-${i}`;
    teams[id] = { id, name, players: [] };
    return id;
  });
  const match = (teamA: string, teamB: string, pointsA: number, pointsB: number): KoMatch => ({
    teamA,
    teamB,
    pointsA,
    pointsB,
  });
  return {
    ko: {
      hf1: match(a, b, 712, 598),
      hf2: match(c, d, 547, 663),
      kleinerFinal: match(b, c, 634, 689),
      final: match(a, d, 701, 655),
    },
    teams,
  };
}

/** Cross-device refresh — picks up scores entered on another device (e.g. admin's phone) into this display. */
const SYNC_INTERVAL_MS = 5_000;

/** Near-square grid biased toward a widescreen (~16:9) layout, minimizing empty cells. */
function gridDims(count: number): { cols: number; rows: number } {
  let cols = Math.max(1, Math.ceil(Math.sqrt(count * 1.6)));
  let rows = Math.ceil(count / cols);
  while (cols > 1 && (cols - 1) * rows >= count) {
    cols--;
    rows = Math.ceil(count / cols);
  }
  return { cols, rows };
}

@Component({
  selector: 'app-present-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, StandingsTable, PresentSchedule, SuitBadge, SecretTap],
  templateUrl: './present-page.html',
  styleUrl: './present-page.scss',
  host: {
    class: 'slate',
    '(document:keydown)': 'onKey($event)',
  },
})
export class PresentPage {
  protected readonly store = inject(TournamentStore);
  protected readonly auth = inject(AdminAuth);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly index = signal(0);
  protected readonly paused = signal(false);

  /** True below the mobile breakpoint — forces single-column slide layout and disables auto-advance. */
  protected readonly isNarrow = toSignal(
    fromEvent(window, 'resize').pipe(map(() => window.innerWidth <= NARROW_BREAKPOINT_PX)),
    { initialValue: window.innerWidth <= NARROW_BREAKPOINT_PX },
  );

  /**
   * Which stage's results to show. 'auto' follows tournament progress: KO
   * once seeded, else Finalrunde once drawn, else the group phase.
   */
  protected readonly effectiveStage = computed<'group' | 'final' | 'ko' | 'none'>(() => {
    const configured = this.store.tournament().presentationStage;
    if (configured !== 'auto') return configured;
    const t = this.store.tournament();
    if (t.ko.hf1.teamA || t.ko.hf2.teamA) return 'ko';
    // Finalrunde groups may be set up (empty) long before the group phase is done — only switch once they have teams.
    if (this.store.finalGroupViews().some((v) => v.standings.length > 0)) return 'final';
    if (this.store.groupViews().length > 0) return 'group';
    return 'none';
  });

  /**
   * Only the configured/current stage's results — not every stage in
   * sequence — and no separate title slide once there's something to show,
   * so the standings/groups get the whole frame instead of sharing it with
   * an intro screen. Before any teams exist, placeholder groups with made-up
   * teams and points stand in so the layout can be previewed.
   */
  protected readonly slides = computed<Slide[]>(() => {
    const t = this.store.tournament();
    const narrow = this.isNarrow();
    const stage = this.effectiveStage();
    if (stage === 'ko') return [{ kind: 'ko', placeholder: this.koIsPlaceholder() }];

    const final = stage === 'final';
    const realViews = final ? this.store.finalGroupViews() : this.store.groupViews();
    // No teams in any group yet (groups may already be set up empty): render
    // placeholder teams so the layout on the big screen can be checked before
    // the tournament starts.
    const placeholder = realViews.every((v) => v.standings.length === 0);
    const views = placeholder
      ? placeholderGroupViews(
          realViews.map((v) => v.group.name),
          final ? 'Finalgruppe' : 'Gruppe',
          final ? t.finalRounds : t.groupRounds,
          final ? false : t.dropWorst,
          final ? FINAL_PLACEHOLDER : GROUP_PLACEHOLDER,
        )
      : realViews;
    const topScore = final
      ? null
      : placeholder
        ? maxOf(views.flatMap((v) => v.standings.flatMap((e) => e.rounds)))
        : this.topGroupScore();
    const { cols, rows } = narrow ? { cols: 1, rows: views.length } : gridDims(views.length);
    const base = {
      kind: 'groups-overview',
      stage: final ? 'Finalrunde' : 'Gruppenphase',
      views,
      highlightTop: final ? 1 : t.qualifiersPerGroup,
      cols,
      rows,
      tableRowCount: Math.max(...views.map((v) => v.standings.length)) + 1,
      topScore,
      placeholder,
    } as const;
    return [
      { ...base, content: 'standings' },
      { ...base, content: 'schedule' },
    ];
  });

  protected readonly current = computed<Slide>(() => {
    const slides = this.slides();
    return slides[Math.min(this.index(), slides.length - 1)] ?? { kind: 'title' };
  });

  /** Highest single round score across the whole group phase (every group). Only shown on the Gruppenphase slide. */
  protected readonly topGroupScore = computed(() => {
    const t = this.store.tournament();
    const allTeamIds = t.groups.flatMap((g) => g.teamIds);
    return maxOf(allTeamIds.flatMap((id) => normalizeRounds(t.groupScores[id], t.groupRounds)));
  });

  protected readonly isPlaceholder = computed(() => {
    const slide = this.current();
    return slide.kind !== 'title' && !!slide.placeholder;
  });

  private readonly koIsPlaceholder = computed(() =>
    Object.values(this.store.tournament().ko).every((m) => !m.teamA && !m.teamB),
  );

  /** The real bracket, or a made-up one while no KO match has teams yet. */
  private readonly koData = computed<KoData>(() => {
    const t = this.store.tournament();
    return this.koIsPlaceholder() ? placeholderKo() : { ko: t.ko, teams: t.teams };
  });

  protected readonly ko = computed(() => this.koData().ko);

  protected readonly podium = computed(() => {
    const { final, kleinerFinal } = this.ko();
    return {
      first: this.koTeam(this.store.winnerOf(final)),
      second: this.koTeam(this.store.loserOf(final)),
      third: this.koTeam(this.store.winnerOf(kleinerFinal)),
    };
  });

  private koTeam(id: string | null): Team | null {
    return id ? (this.koData().teams[id] ?? null) : null;
  }

  constructor() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches || this.isNarrow()) this.paused.set(true);
    const timer = setInterval(() => {
      if (!this.paused() && this.slides().length > 1) this.next();
    }, SLIDE_INTERVAL_MS);
    // This display's tournament data otherwise only updates when someone
    // reloads it — poll so scores entered on another device (e.g. the
    // admin's phone) show up here without a manual refresh.
    const syncTimer = setInterval(() => void this.store.refreshFromServer(), SYNC_INTERVAL_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      clearInterval(syncTimer);
    });
  }

  protected next(): void {
    this.index.update((i) => (i + 1) % this.slides().length);
  }

  protected prev(): void {
    this.index.update((i) => (i - 1 + this.slides().length) % this.slides().length);
  }

  protected goTo(i: number): void {
    this.index.set(i);
  }

  /**
   * Mobile jump bar — a button rather than `href="#…"`, which would resolve
   * against `<base href="/">`. Offsets by the sticky bar's height so it
   * doesn't cover the group's heading (the bar wraps to a varying height).
   */
  protected jumpToGroup(groupId: string): void {
    const root = this.host.nativeElement;
    const card = root.querySelector<HTMLElement>(`#group-${CSS.escape(groupId)}`);
    if (!card) return;
    const barHeight = root.querySelector<HTMLElement>('.group-jump')?.offsetHeight ?? 0;
    window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - barHeight - 4 });
  }

  protected togglePause(): void {
    this.paused.update((p) => !p);
  }

  protected toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void this.host.nativeElement.requestFullscreen?.();
    }
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement) return;
    switch (event.key) {
      case 'ArrowRight':
      case 'PageDown':
        this.next();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        this.prev();
        break;
      case ' ':
        event.preventDefault();
        this.togglePause();
        break;
      case 'f':
        this.toggleFullscreen();
        break;
    }
  }

  protected slideLabel(slide: Slide): string {
    switch (slide.kind) {
      case 'title':
        return 'Titel';
      case 'groups-overview':
        return slide.content === 'schedule' ? 'Spielplan' : 'Rangliste';
      case 'ko':
        return 'KO-Phase';
    }
  }

  protected teamName(id: string | null): string {
    return this.koTeam(id)?.name ?? '…';
  }
}
