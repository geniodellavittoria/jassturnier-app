import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { KoId, KoMatch, MAX_MATCH_POINTS_FINAL } from '../../models/tournament';
import { matchPointsMismatch } from '../../services/schedule';
import { TournamentStore } from '../../services/tournament-store';

/** One KO tie: two teams, one points field each, winner highlighted. */
@Component({
  selector: 'app-ko-match-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  template: `
    <h3>{{ label() }}</h3>
    @if (!match().teamA && !match().teamB) {
      <p class="pending">{{ pendingText() }}</p>
    } @else {
      <div class="tie">
        @for (side of sides; track side) {
          <div class="side" [class.winner]="winnerId() !== null && winnerId() === teamId(side)">
            <span class="name">
              {{ teamName(side) }}
              @if (winnerId() !== null && winnerId() === teamId(side)) {
                <span class="win-tag">Sieg</span>
              }
            </span>
            <label class="visually-hidden" [for]="inputId(side)">Punkte {{ teamName(side) }}</label>
            <input
              [id]="inputId(side)"
              type="number"
              inputmode="numeric"
              min="0"
              max="9999"
              [value]="points(side) ?? ''"
              [disabled]="teamId(side) === null"
              [class.mismatch]="pointsMismatch()"
              [attr.aria-invalid]="pointsMismatch()"
              (change)="onPoints(side, $event)"
            />
          </div>
        }
      </div>
      @if (isDraw()) {
        <p class="draw-note">Gleichstand — bitte Stechen spielen und das Resultat anpassen.</p>
      }
      @if (pointsMismatch()) {
        <p class="draw-note">
          Die Punkte ergeben zusammen {{ pointsSum() }} statt {{ maxPoints }}.
        </p>
      }
    }
  `,
  styles: `
    h3 {
      margin: 0 0 0.8rem;
    }
    .pending {
      margin: 0;
      color: var(--text-soft);
      font-size: 0.9rem;
    }
    .tie {
      display: grid;
      gap: 0.55rem;
    }
    .side {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.8rem;
      padding: 0.55rem 0.7rem;
      border: 1px solid var(--table-rule);
      border-radius: 0.55rem;
      background: var(--surface-raised);
    }
    .side.winner {
      border-color: var(--accent);
      box-shadow: inset 3px 0 0 var(--accent);
    }
    .name {
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }
    .win-tag {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--surface);
      background: var(--accent);
      padding: 0.12rem 0.45rem;
      border-radius: 999px;
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
    input:disabled {
      opacity: 0.5;
    }
    input:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }
    input.mismatch {
      border-color: var(--negative);
      background: color-mix(in srgb, var(--negative) 12%, var(--surface));
    }
    .draw-note {
      margin: 0.6rem 0 0;
      font-size: 0.82rem;
      color: var(--negative);
    }
    @media (max-width: 30rem) {
      .side {
        flex-wrap: wrap;
      }
      input {
        inline-size: 100%;
      }
    }
  `,
})
export class KoMatchCard {
  protected readonly store = inject(TournamentStore);

  readonly matchId = input.required<KoId>();
  readonly label = input.required<string>();
  readonly pendingText = input('Wird nach den Halbfinals automatisch besetzt.');

  protected readonly sides = ['A', 'B'] as const;

  protected readonly match = computed<KoMatch>(() => this.store.tournament().ko[this.matchId()]);

  protected readonly winnerId = computed(() => this.store.winnerOf(this.match()));

  protected readonly isDraw = computed(() => {
    const m = this.match();
    return m.pointsA !== null && m.pointsB !== null && m.pointsA === m.pointsB;
  });

  protected readonly maxPoints = MAX_MATCH_POINTS_FINAL;

  protected readonly pointsSum = computed(() => {
    const m = this.match();
    return (m.pointsA ?? 0) + (m.pointsB ?? 0);
  });

  protected readonly pointsMismatch = computed(() => {
    const m = this.match();
    return matchPointsMismatch(m.pointsA, m.pointsB, MAX_MATCH_POINTS_FINAL);
  });

  protected teamId(side: 'A' | 'B'): string | null {
    return side === 'A' ? this.match().teamA : this.match().teamB;
  }

  protected teamName(side: 'A' | 'B'): string {
    return this.store.team(this.teamId(side))?.name ?? 'Offen';
  }

  protected points(side: 'A' | 'B'): number | null {
    return side === 'A' ? this.match().pointsA : this.match().pointsB;
  }

  protected inputId(side: 'A' | 'B'): string {
    return `ko-${this.matchId()}-${side}`;
  }

  protected onPoints(side: 'A' | 'B', event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const parsed = raw === '' ? null : Number(raw);
    const value = parsed === null || Number.isNaN(parsed) ? null : Math.max(0, Math.round(parsed));
    this.store.setKoPoints(this.matchId(), side, value);
  }
}
