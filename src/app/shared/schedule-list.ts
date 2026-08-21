import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MAX_MATCH_POINTS, ScoreMap, Team } from '../models/tournament';
import { matchPointsMismatch, Pairing } from '../services/schedule';

/** The Spielplan of one group: who plays whom in every round. */
@Component({
  selector: 'app-schedule-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="rounds">
      @for (round of schedule(); track $index; let roundIndex = $index) {
        <li class="round">
          <h4>Runde {{ roundIndex + 1 }}</h4>
          <ul class="pairings">
            @for (pairing of round; track pairing.table) {
              <li>
                <span class="table-no" aria-hidden="true">Tisch {{ pairing.table }}</span>
                <span class="pairing">
                  {{ teamName(pairing.homeId) }}
                  <span class="vs" aria-hidden="true">×</span>
                  <span class="visually-hidden">gegen</span>
                  {{ teamName(pairing.awayId) }}
                </span>
                @if (mismatch(pairing, roundIndex)) {
                  <span class="sum-warning">
                    ⚠ {{ pairSum(pairing, roundIndex) }} statt {{ maxPoints }}
                  </span>
                }
              </li>
            }
          </ul>
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: block;
    }
    .rounds {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
      gap: 1rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .round h4 {
      margin: 0 0 0.4rem;
      font-family: var(--font-display);
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-soft);
    }
    .pairings {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.35rem;
    }
    .pairings li {
      display: grid;
      gap: 0.05rem;
      padding: 0.4rem 0.55rem;
      background: var(--surface-raised);
      border: 1px solid var(--table-rule);
      border-radius: 0.5rem;
    }
    .table-no {
      font-size: 0.72rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-soft);
    }
    .pairing {
      font-weight: 600;
      font-size: 0.92rem;
    }
    .vs {
      color: var(--accent);
      padding-inline: 0.15rem;
    }
    .sum-warning {
      font-size: 0.72rem;
      color: var(--negative);
    }
  `,
})
export class ScheduleList {
  readonly schedule = input.required<Pairing[][]>();
  readonly teams = input.required<Record<string, Team>>();
  readonly scores = input.required<ScoreMap>();

  protected readonly maxPoints = MAX_MATCH_POINTS;

  protected teamName(id: string): string {
    return this.teams()[id]?.name ?? '?';
  }

  private pointsFor(teamId: string, round: number): number | null {
    return this.scores()[teamId]?.[round] ?? null;
  }

  protected pairSum(pairing: Pairing, round: number): number {
    return (this.pointsFor(pairing.homeId, round) ?? 0) + (this.pointsFor(pairing.awayId, round) ?? 0);
  }

  protected mismatch(pairing: Pairing, round: number): boolean {
    return matchPointsMismatch(this.pointsFor(pairing.homeId, round), this.pointsFor(pairing.awayId, round));
  }
}
