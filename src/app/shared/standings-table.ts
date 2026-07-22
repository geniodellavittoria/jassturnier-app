import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { StandingsEntry } from '../models/tournament';

/**
 * Ranked standings for one group. Renders in the surrounding theme
 * (paper in the admin views, chalk in the presentation view).
 */
@Component({
  selector: 'app-standings-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table class="standings">
      <caption class="visually-hidden">Rangliste {{ caption() }}</caption>
      <thead>
        <tr>
          <th scope="col" class="num">Rang</th>
          <th scope="col">Team</th>
          @for (r of roundIndexes(); track r) {
            <th scope="col" class="num">R{{ r + 1 }}</th>
          }
          <th scope="col" class="num total-col">Total</th>
        </tr>
      </thead>
      <tbody>
        @for (entry of entries(); track entry.team.id) {
          <tr [class.qualified]="entry.rank <= highlightTop()">
            <td class="num rank">{{ entry.rank }}</td>
            <td>
              <span class="team-name">{{ entry.team.name }}</span>
              @if (showPlayers() && entry.team.players.length > 0) {
                <span class="players">{{ entry.team.players.join(' · ') }}</span>
              }
            </td>
            @for (value of entry.rounds; track $index) {
              <td class="num" [class.dropped]="$index === entry.droppedRound">
                @if (value !== null) {
                  {{ value }}
                } @else {
                  <span aria-label="noch offen">–</span>
                }
              </td>
            }
            <td class="num total">{{ entry.total }}</td>
          </tr>
        }
      </tbody>
    </table>
    @if (hasDrop()) {
      <p class="drop-hint">Durchgestrichene Punkte = Streichresultat (schlechteste Runde zählt nicht).</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .standings {
      inline-size: 100%;
      border-collapse: collapse;
      font-variant-numeric: tabular-nums;
    }
    th,
    td {
      padding: 0.5rem 0.6rem;
      text-align: start;
      border-block-end: 1px solid var(--table-rule);
    }
    thead th {
      font-family: var(--font-display);
      font-size: 0.78rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-soft);
      border-block-end: 2px solid var(--table-rule-strong);
    }
    .num {
      text-align: end;
      white-space: nowrap;
    }
    .rank {
      font-family: var(--font-display);
      font-weight: 700;
    }
    .team-name {
      display: block;
      font-weight: 600;
    }
    .players {
      display: block;
      font-size: 0.82em;
      color: var(--text-soft);
    }
    .dropped {
      text-decoration: line-through;
      color: var(--text-soft);
    }
    .total {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 1.05em;
    }
    tr.qualified .rank {
      color: var(--accent);
    }
    tr.qualified .rank::after {
      content: ' ▸';
      font-size: 0.8em;
    }
    .drop-hint {
      margin-block-start: 0.5rem;
      font-size: 0.8rem;
      color: var(--text-soft);
    }
  `,
})
export class StandingsTable {
  readonly entries = input.required<StandingsEntry[]>();
  readonly caption = input('');
  /** Ranks 1..n marked as qualifying for the next stage (0 = none). */
  readonly highlightTop = input(0);
  readonly showPlayers = input(true);

  protected readonly roundIndexes = computed(() => {
    const first = this.entries()[0];
    return first ? first.rounds.map((_, i) => i) : [];
  });

  protected readonly hasDrop = computed(() => this.entries().some((e) => e.droppedRound !== null));
}
