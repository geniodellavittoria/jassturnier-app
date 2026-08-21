import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TournamentStore } from '../../services/tournament-store';
import { ScoreGrid, ScoreChange } from '../../shared/score-grid';
import { StandingsTable } from '../../shared/standings-table';
import { ScheduleList } from '../../shared/schedule-list';
import { countMismatches, Pairing } from '../../services/schedule';
import { KoMatchCard } from './ko-match-card';

@Component({
  selector: 'app-finals-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ScoreGrid, StandingsTable, ScheduleList, KoMatchCard],
  templateUrl: './finals-page.html',
  styleUrl: './finals-page.scss',
})
export class FinalsPage {
  protected readonly store = inject(TournamentStore);

  protected readonly views = this.store.finalGroupViews;

  protected readonly hasKo = computed(() => {
    const ko = this.store.tournament().ko;
    return !!(ko.hf1.teamA || ko.hf2.teamA);
  });

  protected teamsOf(teamIds: string[]) {
    const teams = this.store.tournament().teams;
    return teamIds.map((id) => teams[id]).filter((t) => !!t);
  }

  protected mismatchCount(schedule: Pairing[][]): number {
    return countMismatches(schedule, this.store.tournament().finalScores);
  }

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
      this.store.seedSemifinals();
    }
  }

  protected onScore(change: ScoreChange): void {
    this.store.setFinalScore(change.teamId, change.round, change.value);
  }
}
