import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { GroupView, TournamentStore } from '../../services/tournament-store';
import { StandingsTable } from '../../shared/standings-table';
import { SuitBadge } from '../../shared/suit-badge';

interface TitleSlide {
  kind: 'title';
}
interface GroupsOverviewSlide {
  kind: 'groups-overview';
  stage: 'Gruppenphase' | 'Finalrunde';
  views: GroupView[];
  highlightTop: number;
}
interface KoSlide {
  kind: 'ko';
}
type Slide = TitleSlide | GroupsOverviewSlide | KoSlide;

const SLIDE_INTERVAL_MS = 12_000;

@Component({
  selector: 'app-present-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, StandingsTable, SuitBadge],
  templateUrl: './present-page.html',
  styleUrl: './present-page.scss',
  host: {
    class: 'slate',
    '(document:keydown)': 'onKey($event)',
  },
})
export class PresentPage {
  protected readonly store = inject(TournamentStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly index = signal(0);
  protected readonly paused = signal(false);

  protected readonly slides = computed<Slide[]>(() => {
    const t = this.store.tournament();
    const slides: Slide[] = [{ kind: 'title' }];
    const groupViews = this.store.groupViews();
    if (groupViews.length > 0) {
      slides.push({
        kind: 'groups-overview',
        stage: 'Gruppenphase',
        views: groupViews,
        highlightTop: t.qualifiersPerGroup,
      });
    }
    const finalGroupViews = this.store.finalGroupViews();
    if (finalGroupViews.length > 0) {
      slides.push({
        kind: 'groups-overview',
        stage: 'Finalrunde',
        views: finalGroupViews,
        highlightTop: 1,
      });
    }
    if (t.ko.hf1.teamA || t.ko.hf2.teamA) {
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
    if (reduced.matches) this.paused.set(true);
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
