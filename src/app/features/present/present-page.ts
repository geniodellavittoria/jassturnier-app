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
}
interface KoSlide {
  kind: 'ko';
}
type Slide = TitleSlide | GroupsOverviewSlide | KoSlide;

const SLIDE_INTERVAL_MS = 12_000;

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

  /** Only the configured/current stage's results — not every stage in sequence. */
  protected readonly slides = computed<Slide[]>(() => {
    const t = this.store.tournament();
    const narrow = this.isNarrow();
    const stage = this.effectiveStage();
    const slides: Slide[] = [{ kind: 'title' }];

    if (stage === 'group') {
      const groupViews = this.store.groupViews();
      if (groupViews.length > 0) {
        const { cols, rows } = narrow ? { cols: 1, rows: groupViews.length } : gridDims(groupViews.length);
        slides.push({
          kind: 'groups-overview',
          stage: 'Gruppenphase',
          views: groupViews,
          highlightTop: t.qualifiersPerGroup,
          cols,
          rows,
          tableRowCount: Math.max(...groupViews.map((v) => v.standings.length)) + 1,
        });
      }
    } else if (stage === 'final') {
      const finalGroupViews = this.store.finalGroupViews();
      if (finalGroupViews.length > 0) {
        const { cols, rows } = narrow
          ? { cols: 1, rows: finalGroupViews.length }
          : gridDims(finalGroupViews.length);
        slides.push({
          kind: 'groups-overview',
          stage: 'Finalrunde',
          views: finalGroupViews,
          highlightTop: 1,
          cols,
          rows,
          tableRowCount: Math.max(...finalGroupViews.map((v) => v.standings.length)) + 1,
        });
      }
    } else if (stage === 'ko') {
      slides.push({ kind: 'ko' });
    }

    return slides;
  });

  protected readonly current = computed<Slide>(() => {
    const slides = this.slides();
    return slides[Math.min(this.index(), slides.length - 1)] ?? { kind: 'title' };
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
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
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
