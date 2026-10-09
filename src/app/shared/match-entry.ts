import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ScoreMap, Team } from '../models/tournament';
import { matchPointsMismatch, Pairing } from '../services/schedule';

export interface ScoreChange {
  teamId: string;
  round: number;
  value: number | null;
}

/**
 * Result entry the way it's played: per round, one line per match —
 * "Team A [points] : [points] Team B". Scores are still stored per team and
 * round, so this is only a different view onto the same cells.
 */
@Component({
  selector: 'app-match-entry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (round of rounds(); track $index; let r = $index) {
      <section class="round" [class.current]="r === currentRound()" [attr.aria-label]="'Runde ' + (r + 1)">
        <h3>
          Runde {{ r + 1 }}
          @if (round.complete) {
            <span class="done" aria-label="vollständig">✓</span>
          } @else if (r === currentRound()) {
            <span class="badge">aktuell</span>
          }
        </h3>
        <ul class="matches">
          @for (m of round.matches; track m.pairing.table) {
            <li class="match" [class.mismatch]="m.mismatch">
              <span class="team home">{{ teamName(m.pairing.homeId) }}</span>
              <input
                type="number"
                inputmode="numeric"
                min="0"
                max="9999"
                [value]="m.home ?? ''"
                (change)="onChange(m.pairing.homeId, r, $event)"
                [attr.aria-label]="'Punkte ' + teamName(m.pairing.homeId) + ', Runde ' + (r + 1)"
                [attr.aria-invalid]="m.mismatch"
                [class.top-score]="isTopScore(m.home)"
              />
              <span class="colon" aria-hidden="true">:</span>
              <input
                type="number"
                inputmode="numeric"
                min="0"
                max="9999"
                [value]="m.away ?? ''"
                (change)="onChange(m.pairing.awayId, r, $event)"
                [attr.aria-label]="'Punkte ' + teamName(m.pairing.awayId) + ', Runde ' + (r + 1)"
                [attr.aria-invalid]="m.mismatch"
                [class.top-score]="isTopScore(m.away)"
              />
              <span class="team away">{{ teamName(m.pairing.awayId) }}</span>
              @if (m.mismatch) {
                <span class="sum-warning">⚠ {{ (m.home ?? 0) + (m.away ?? 0) }} statt {{ maxPoints() }}</span>
              }
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 1rem;
    }
    .round {
      padding-inline-start: 0.75rem;
      border-inline-start: 3px solid transparent;
    }
    .round.current {
      border-inline-start-color: var(--accent);
    }
    h3 {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0 0 0.5rem;
      font-family: var(--font-display);
      font-size: 0.85rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-soft);
    }
    .done {
      color: var(--accent);
    }
    .badge {
      padding: 0.1rem 0.5rem;
      font-size: 0.7rem;
      letter-spacing: 0.06em;
      color: var(--surface);
      background: var(--accent);
      border-radius: 999px;
    }
    .matches {
      display: grid;
      gap: 0.4rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .match {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto auto minmax(0, 1fr);
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.5rem;
      border-block-end: 1px solid var(--table-rule);
    }
    .team {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .home {
      text-align: end;
    }
    .colon {
      font-weight: 700;
      color: var(--text-soft);
    }
    .sum-warning {
      grid-column: 1 / -1;
      justify-self: center;
      font-size: 0.78rem;
      color: var(--negative);
    }
    input {
      inline-size: 5.5rem;
      padding: 0.6rem 0.5rem;
      font: inherit;
      font-variant-numeric: tabular-nums;
      text-align: center;
      color: var(--text);
      background: var(--surface);
      border: 1px solid var(--input-border);
      border-radius: 0.4rem;
    }
    input:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }
    input.top-score {
      border-color: var(--gold);
      background: color-mix(in srgb, var(--gold) 22%, var(--surface));
      font-weight: 700;
    }
    .match.mismatch input {
      border-color: var(--negative);
      background: color-mix(in srgb, var(--negative) 12%, var(--surface));
    }

    /* Phones: names above/below the inputs so the inputs keep a usable size. */
    @media (max-width: 30rem) {
      .match {
        grid-template-columns: 1fr auto 1fr;
        row-gap: 0.25rem;
      }
      .home {
        grid-column: 1 / -1;
        text-align: start;
      }
      .home + input {
        justify-self: end;
      }
      .away {
        grid-column: 1 / -1;
        grid-row: 3;
        text-align: end;
      }
      input {
        inline-size: 100%;
        max-inline-size: 7rem;
      }
    }
  `,
})
export class MatchEntry {
  readonly schedule = input.required<Pairing[][]>();
  readonly teams = input.required<Record<string, Team>>();
  readonly scores = input.required<ScoreMap>();
  readonly maxPoints = input.required<number>();
  /** The single highest score across the whole stage (not just this group) — highlighted wherever it appears. */
  readonly topScore = input<number | null>(null);
  readonly scoreChange = output<ScoreChange>();

  protected readonly rounds = computed(() => {
    const scores = this.scores();
    return this.schedule().map((pairings, r) => {
      const matches = pairings.map((pairing) => {
        const home = scores[pairing.homeId]?.[r] ?? null;
        const away = scores[pairing.awayId]?.[r] ?? null;
        return { pairing, home, away, mismatch: matchPointsMismatch(home, away, this.maxPoints()) };
      });
      return { matches, complete: matches.every((m) => m.home !== null && m.away !== null) };
    });
  });

  /** First round with a missing score — where the next results will come in. */
  protected readonly currentRound = computed(() => this.rounds().findIndex((r) => !r.complete));

  protected teamName(id: string): string {
    return this.teams()[id]?.name ?? '?';
  }

  protected isTopScore(value: number | null): boolean {
    const max = this.topScore();
    return max !== null && value === max;
  }

  protected onChange(teamId: string, round: number, event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const parsed = raw === '' ? null : Number(raw);
    const value = parsed === null || Number.isNaN(parsed) ? null : Math.max(0, Math.round(parsed));
    this.scoreChange.emit({ teamId, round, value });
  }
}
