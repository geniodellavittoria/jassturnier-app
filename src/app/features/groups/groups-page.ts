import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TournamentStore } from '../../services/tournament-store';
import { ScoreGrid, ScoreChange } from '../../shared/score-grid';
import { StandingsTable } from '../../shared/standings-table';
import { ScheduleList } from '../../shared/schedule-list';
import { SuitBadge } from '../../shared/suit-badge';

@Component({
  selector: 'app-groups-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ScoreGrid, StandingsTable, ScheduleList, SuitBadge],
  templateUrl: './groups-page.html',
  styleUrl: './groups-page.scss',
})
export class GroupsPage {
  protected readonly store = inject(TournamentStore);

  protected readonly selectedIndex = signal(0);

  protected readonly views = this.store.groupViews;

  protected readonly currentView = computed(() => {
    const views = this.views();
    if (views.length === 0) return null;
    return views[Math.min(this.selectedIndex(), views.length - 1)];
  });

  protected readonly currentTeams = computed(() => {
    const view = this.currentView();
    if (!view) return [];
    const teams = this.store.tournament().teams;
    return view.group.teamIds.map((id) => teams[id]).filter((t) => !!t);
  });

  protected select(index: number): void {
    this.selectedIndex.set(index);
  }

  protected onScore(change: ScoreChange): void {
    this.store.setGroupScore(change.teamId, change.round, change.value);
  }
}
