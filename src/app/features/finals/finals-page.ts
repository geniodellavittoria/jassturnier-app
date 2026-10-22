import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MAX_MATCH_POINTS_FINAL, playerLine } from '../../models/tournament';
import { TournamentStore } from '../../services/tournament-store';
import { MatchEntry, ScoreChange } from '../../shared/match-entry';
import { StandingsTable } from '../../shared/standings-table';
import { KoMatchCard } from './ko-match-card';

@Component({
  selector: 'app-finals-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatchEntry, StandingsTable, KoMatchCard],
  templateUrl: './finals-page.html',
  styleUrl: './finals-page.scss',
})
export class FinalsPage {
  protected readonly store = inject(TournamentStore);

  protected readonly maxPoints = MAX_MATCH_POINTS_FINAL;
  protected readonly playerLine = playerLine;

  protected readonly views = this.store.finalGroupViews;

  /** Why the Halbfinals couldn't be seeded, if they couldn't. */
  protected readonly seedError = signal<string | null>(null);

  protected readonly hasKo = computed(() => {
    const ko = this.store.tournament().ko;
    return !!(ko.hf1.teamA || ko.hf2.teamA);
  });

  protected draw(): void {
    const redraw = this.views().length > 0;
    const incomplete = !this.store.groupPhaseComplete();
    let message: string | null = null;
    if (redraw) {
      message = 'Finalrunde neu auslosen? Bereits eingetragene Finalrunden-Punkte gehen verloren.';
    } else if (incomplete) {
      message = 'Die Gruppenphase ist noch nicht komplett. Trotzdem nach aktuellem Stand auslosen?';
    }
    if (message === null || confirm(message)) {
      this.store.drawFinalGroups();
    }
  }

  protected seedSemis(): void {
    const reseed = this.hasKo();
    const incomplete = !this.store.finalGroupsComplete();
    let message: string | null = null;
    if (reseed) {
      message = 'Halbfinals neu setzen? Eingetragene KO-Resultate gehen verloren.';
    } else if (incomplete) {
      message = 'Die Finalgruppen sind noch nicht komplett. Trotzdem nach aktuellem Stand setzen?';
    }
    if (message === null || confirm(message)) {
      const seeded = this.store.seedSemifinals();
      this.seedError.set(seeded ? null : 'Für die Halbfinals braucht es mindestens vier Teams in der Finalrunde.');
    }
  }

  protected onScore(change: ScoreChange): void {
    this.store.setFinalScore(change.teamId, change.round, change.value);
  }
}
