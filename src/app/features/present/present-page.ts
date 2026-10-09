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
import { maxOf, normalizeRounds, roundRobin } from '../../services/schedule';
import { GroupView, TournamentStore } from '../../services/tournament-store';
import { SecretTap } from '../../shared/secret-tap';
import { StandingsTable } from '../../shared/standings-table';
import { SuitBadge } from '../../shared/suit-badge';

// Keep in sync with the `@media (max-width: 48rem)` breakpoint in present-page.scss.
const NARROW_BREAKPOINT_PX = 768;

interface TitleSlide {
  kind: 'title';
}
interface GroupsOverviewSlide {
  kind: 'groups-overview';
  stage: 'Gruppenphase' | 'Finalrunde';
  views: GroupView[];
  highlightTop: number;
  cols: number;
  rows: number;
  tableRowCount: number;
  /** Made-up groups shown while the stage has no data yet. */
  placeholder?: boolean;
}
interface KoSlide {
  kind: 'ko';
}
type Slide = TitleSlide | GroupsOverviewSlide | KoSlide;

const SLIDE_INTERVAL_MS = 12_000;

/** Layout preview shown while a tournament has no teams yet (2025 had 6 groups of 6 teams). */
const PLACEHOLDER_GROUPS = 6;
const PLACEHOLDER_TEAMS_PER_GROUP = 6;

/** Keeps the real group names when groups already exist, else invents `${fallbackPrefix} 1…n`. */
function placeholderGroupViews(groupNames: string[], fallbackPrefix: string, rounds: number): GroupView[] {
  const names =
    groupNames.length > 0
      ? groupNames
      : Array.from({ length: PLACEHOLDER_GROUPS }, (_, g) => `${fallbackPrefix} ${g + 1}`);
  return names.map((name, g) => {
    const teamIds = Array.from({ length: PLACEHOLDER_TEAMS_PER_GROUP }, (_, i) => `placeholder-${g}-${i}`);
    return {
      group: { id: `placeholder-${g}`, name, teamIds },
      standings: teamIds.map((id, i) => ({
        team: { id, name: `Team ${g * PLACEHOLDER_TEAMS_PER_GROUP + i + 1}`, players: [] },
        rounds: Array<number | null>(rounds).fill(null),
        sum: 0,
        total: 0,
        droppedRound: null,
        rank: i + 1,
        playedRounds: 0,
      })),
      schedule: roundRobin(teamIds),
    };
  });
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
  imports: [RouterLink, StandingsTable, SuitBadge, SecretTap],
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
    if (this.store.finalGroupViews().length > 0) return 'final';
    if (this.store.groupViews().length > 0) return 'group';
    return 'none';
  });

  /**
   * Only the configured/current stage's results — not every stage in
   * sequence — and no separate title slide once there's something to show,
   * so the standings/groups get the whole frame instead of sharing it with
   * an intro screen. Before any data exists, placeholder groups stand in so
   * the layout can be previewed.
   */
  protected readonly slides = computed<Slide[]>(() => {
    const t = this.store.tournament();
    const narrow = this.isNarrow();
    const stage = this.effectiveStage();
    if (stage === 'ko') return [{ kind: 'ko' }];

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
        )
      : realViews;
    const { cols, rows } = narrow ? { cols: 1, rows: views.length } : gridDims(views.length);
    return [
      {
        kind: 'groups-overview',
        stage: final ? 'Finalrunde' : 'Gruppenphase',
        views,
        highlightTop: final ? 1 : t.qualifiersPerGroup,
        cols,
        rows,
        tableRowCount: Math.max(...views.map((v) => v.standings.length)) + 1,
        placeholder,
      },
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

  protected readonly ko = computed(() => this.store.tournament().ko);

  protected readonly podium = computed(() => {
    const { final, kleinerFinal } = this.ko();
    return {
      first: this.store.team(this.store.winnerOf(final)),
      second: this.store.team(this.store.loserOf(final)),
      third: this.store.team(this.store.winnerOf(kleinerFinal)),
    };
  });

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
        return slide.stage;
      case 'ko':
        return 'KO-Phase';
    }
  }

  protected teamName(id: string | null): string {
    return this.store.team(id)?.name ?? '…';
  }
}
