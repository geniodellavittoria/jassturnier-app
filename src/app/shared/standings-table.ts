import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { StandingsEntry } from '../models/tournament';
import { maxOf } from '../services/schedule';

/**
 * Ranked standings for one group. Renders in the surrounding theme
 * (paper in the admin views, chalk in the presentation view).
 */
@Component({
  selector: 'app-standings-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.compact]': 'compact()',
  },
  template: `
    <div class="table-wrap">
    <table class="standings" [style.--table-num-col]="numColWidth()">
      <caption class="visually-hidden">Rangliste {{ caption() }}</caption>
      @if (compact()) {
        <colgroup>
          <col [style.inline-size.%]="colWidths().rank" />
          <col [style.inline-size.%]="colWidths().team" />
          @for (r of roundIndexes(); track r) {
            <col [style.inline-size.%]="colWidths().round" />
          }
          <col [style.inline-size.%]="colWidths().total" />
        </colgroup>
      }
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
              <td
                class="num"
                [class.dropped]="$index === entry.droppedRound"
                [class.top-score]="isTopScore(value)"
              >
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
    </div>
    @if (hasDrop() && !compact()) {
      <p class="drop-hint">Durchgestrichene Punkte = Streichresultat (schlechteste Runde zählt nicht).</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .table-wrap {
      overflow-x: auto;
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
    .top-score {
      background: color-mix(in srgb, var(--gold) 25%, var(--surface));
      font-weight: 700;
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

    /* Dense mode for the presentation overview: sized to the group-card's
       container height (via cqh) so every group fits on screen without
       scrolling, whatever the team/round count turns out to be. */
    :host.compact {
      block-size: 100%;

      .table-wrap {
        overflow-x: visible;
        block-size: 100%;
      }

      .standings {
        block-size: 100%;
        table-layout: fixed;
        /* Bound by both row count (height) and the narrowest numeric column's
           width — a group with few rows but many round columns would otherwise
           get a font sized for its height alone, overflowing the round/total
           cells and clipping the point values (they can run to 4+ digits,
           e.g. up to 1884). 0.28 keeps up to ~5-digit numbers inside their
           column at the resulting font-size. */
        font-size: clamp(
          0.5rem,
          min(
            calc(100cqh / var(--table-row-count, 7) * 0.42),
            calc(var(--table-num-col, 6) * 1cqw * 0.28)
          ),
          1.05rem
        );
      }
      th,
      td {
        padding: clamp(0rem, calc(100cqh / var(--table-row-count, 7) * 0.12), 0.35rem)
          clamp(0.12rem, 1cqw, 0.5rem);
      }
      thead th {
        font-size: clamp(0.42rem, calc(100cqh / var(--table-row-count, 7) * 0.26), 0.68rem);
      }
      .team-name {
        display: block;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        max-inline-size: 100%;
      }
      td:nth-child(2) {
        overflow: hidden;
      }
      .num {
        overflow: hidden;
      }
      .total {
        font-size: 1em;
      }
    }

    /* On the presentation page's mobile layout the group-card container only
       establishes inline-size containment (no reliable cqh), so drop the
       height-based term and size off cqw + a legible rem floor instead.
       Keep in sync with the breakpoint in present-page.scss / present-page.ts. */
    @media (max-width: 48rem), (orientation: portrait) {
      :host.compact .standings {
        /* Same column-width-aware formula as the desktop path (no cqh term
           here, since the mobile container only has inline-size containment) —
           a flat cqw value would ignore round count and clip just as easily. */
        font-size: clamp(0.6rem, calc(var(--table-num-col, 6) * 1cqw * 0.28), 1rem);
      }
      :host.compact th,
      :host.compact td {
        padding: 0.3rem 0.4rem;
      }
    }
  `,
})
export class StandingsTable {
  readonly entries = input.required<StandingsEntry[]>();
  readonly caption = input('');
  /** Ranks 1..n marked as qualifying for the next stage (0 = none). */
  readonly highlightTop = input(0);
  readonly showPlayers = input(true);
  /** Dense sizing for many-groups-at-once overviews (e.g. the presentation). */
  readonly compact = input(false);
  /** Highlight the single highest score entered so far (e.g. group-phase "top score"). */
  readonly highlightMax = input(false);

  private readonly maxScore = computed(() =>
    this.highlightMax() ? maxOf(this.entries().flatMap((e) => e.rounds)) : null,
  );

  protected isTopScore(value: number | null): boolean {
    const max = this.maxScore();
    return max !== null && value === max;
  }

  protected readonly roundIndexes = computed(() => {
    const first = this.entries()[0];
    return first ? first.rounds.map((_, i) => i) : [];
  });

  /** Column widths (%) for compact mode — Team gets the lion's share so names stay readable. */
  protected readonly colWidths = computed(() => {
    const rank = 6;
    const total = 10;
    const team = 52;
    const roundCount = Math.max(1, this.roundIndexes().length);
    const round = (100 - rank - total - team) / roundCount;
    return { rank, team, round, total };
  });

  /**
   * Narrowest numeric column (%, ≈ cqw since the table spans the container's
   * width) — bounds compact-mode font-size so point values fit their cell
   * instead of overflowing into the next column.
   */
  protected readonly numColWidth = computed(() => {
    const { round, total } = this.colWidths();
    return Math.min(round, total);
  });

  protected readonly hasDrop = computed(() => this.entries().some((e) => e.droppedRound !== null));
}
