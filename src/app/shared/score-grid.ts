import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Team, ScoreMap } from '../models/tournament';
import { matchPointsMismatch, normalizeRounds, Pairing } from '../services/schedule';

export interface ScoreChange {
  teamId: string;
  round: number;
  value: number | null;
}

/** Editable grid: one row per team, one points cell per round. */
@Component({
  selector: 'app-score-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table class="grid">
      <caption class="visually-hidden">Punkteeingabe {{ caption() }}</caption>
      <thead>
        <tr>
          <th scope="col">Team</th>
          @for (r of roundIndexes(); track r) {
            <th scope="col" class="num">Runde {{ r + 1 }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (team of teams(); track team.id) {
          <tr>
            <th scope="row">{{ team.name }}</th>
            @for (r of roundIndexes(); track r) {
              <td class="num">
                <input
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="9999"
                  [value]="valueFor(team.id, r)"
                  (change)="onChange(team.id, r, $event)"
                  [attr.aria-label]="'Punkte ' + team.name + ', Runde ' + (r + 1)"
                  [class.mismatch]="mismatch(team.id, r)"
                  [attr.aria-invalid]="mismatch(team.id, r)"
                />
              </td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    :host {
      display: block;
      overflow-x: auto;
    }
    .grid {
      border-collapse: collapse;
      inline-size: 100%;
    }
    th,
    td {
      padding: 0.35rem 0.4rem;
      text-align: start;
      border-block-end: 1px solid var(--table-rule);
    }
    thead th {
      font-family: var(--font-display);
      font-size: 0.78rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-soft);
    }
    .num {
      text-align: end;
    }
    tbody th {
      font-weight: 600;
      white-space: nowrap;
      padding-inline-end: 1rem;
    }
    input {
      inline-size: 5.5rem;
      padding: 0.6rem 0.5rem;
      font: inherit;
      font-variant-numeric: tabular-nums;
      text-align: end;
      color: var(--text);
      background: var(--surface);
      border: 1px solid var(--input-border);
      border-radius: 0.4rem;
    }
    input:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }
    input.mismatch {
      border-color: var(--negative);
      background: color-mix(in srgb, var(--negative) 12%, var(--surface));
    }
  `,
})
export class ScoreGrid {
  readonly teams = input.required<Team[]>();
  readonly scores = input.required<ScoreMap>();
  readonly roundCount = input.required<number>();
  readonly schedule = input.required<Pairing[][]>();
  readonly maxPoints = input.required<number>();
  readonly caption = input('');
  readonly scoreChange = output<ScoreChange>();

  protected readonly roundIndexes = computed(() =>
    Array.from({ length: this.roundCount() }, (_, i) => i),
  );

  protected valueFor(teamId: string, round: number): number | string {
    const value = normalizeRounds(this.scores()[teamId], this.roundCount())[round];
    return value ?? '';
  }

  private opponentFor(teamId: string, round: number): string | null {
    const pairings = this.schedule()[round] ?? [];
    const pairing = pairings.find((p) => p.homeId === teamId || p.awayId === teamId);
    if (!pairing) return null;
    return pairing.homeId === teamId ? pairing.awayId : pairing.homeId;
  }

  private scoreFor(teamId: string, round: number): number | null {
    return this.scores()[teamId]?.[round] ?? null;
  }

  protected mismatch(teamId: string, round: number): boolean {
    const opponentId = this.opponentFor(teamId, round);
    if (!opponentId) return false;
    return matchPointsMismatch(this.scoreFor(teamId, round), this.scoreFor(opponentId, round), this.maxPoints());
  }

  protected onChange(teamId: string, round: number, event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const parsed = raw === '' ? null : Number(raw);
    const value = parsed === null || Number.isNaN(parsed) ? null : Math.max(0, Math.round(parsed));
    this.scoreChange.emit({ teamId, round, value });
  }
}
