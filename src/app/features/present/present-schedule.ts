import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GroupView } from '../../services/tournament-store';

/**
 * Compact Spielplan of one group for the presentation: one row per round,
 * one column per Tisch. Sized off the group-card container (cqh/cqw) like the
 * compact standings table, so every group fits on screen without scrolling.
 */
@Component({
  selector: 'app-present-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table
      class="schedule"
      [style.--sched-rows]="rows().length + 1"
      [style.--sched-col]="tischColWidth()"
    >
      <caption class="visually-hidden">Spielplan {{ view().group.name }}</caption>
      <colgroup>
        <col [style.inline-size.%]="roundColWidth" />
        @for (t of tischIndexes(); track t) {
          <col [style.inline-size.%]="tischColWidth()" />
        }
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Runde</th>
          @for (t of tischIndexes(); track t) {
            <th scope="col">Tisch {{ t + 1 }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track $index) {
          <tr [class.played]="row.played" [class.next]="$index === nextRound()">
            <th scope="row" class="round">R{{ $index + 1 }}</th>
            @for (t of tischIndexes(); track t) {
              <td>
                @if (row.pairings[t]; as p) {
                  <span class="team">{{ p.home }}</span>
                  <span class="team"><span class="vs" aria-hidden="true">×</span> {{ p.away }}</span>
                }
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
      block-size: 100%;
    }
    .schedule {
      inline-size: 100%;
      block-size: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      /* Bound by row height (two name lines per cell) and by the Tisch
         column's width (names ellipsize, but should stay readable). */
      font-size: clamp(
        0.55rem,
        min(calc(100cqh / var(--sched-rows, 6) * 0.3), calc(var(--sched-col, 30) * 1cqw / 9)),
        1.4rem
      );
    }
    th,
    td {
      padding: clamp(0rem, calc(100cqh / var(--sched-rows, 6) * 0.06), 0.25rem) clamp(0.1rem, 0.6cqw, 0.35rem);
      text-align: start;
      border-block-end: 1px solid var(--table-rule);
      overflow: hidden;
    }
    thead th {
      font-family: var(--font-display);
      font-size: clamp(0.36rem, calc(100cqh / var(--sched-rows, 6) * 0.16), 0.9rem);
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--text-soft);
      border-block-end: 2px solid var(--table-rule-strong);
    }
    .round {
      font-family: var(--font-display);
      font-weight: 700;
      white-space: nowrap;
    }
    .team {
      display: block;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-weight: 600;
    }
    .vs {
      color: var(--accent);
      font-size: 0.8em;
    }
    tr.played {
      color: var(--text-soft);
    }
    tr.played .team {
      font-weight: 400;
    }
    tr.next .round {
      color: var(--accent);
      box-shadow: inset 3px 0 0 var(--accent);
    }
    tr.next .round::after {
      content: ' ▸';
      font-size: 0.8em;
    }

    /* Mobile: the stacked group-card only has inline-size containment (no
       reliable cqh) — keep in sync with the breakpoint in present-page.scss. */
    @media (max-width: 48rem), (orientation: portrait) {
      .schedule {
        font-size: clamp(0.7rem, calc(var(--sched-col, 30) * 1cqw / 9), 1.1rem);
      }
      thead th {
        font-size: 0.6rem;
      }
      th,
      td {
        padding: 0.3rem 0.15rem;
      }
    }
  `,
})
export class PresentSchedule {
  readonly view = input.required<GroupView>();

  protected readonly roundColWidth = 10;

  private readonly names = computed(() => {
    const names: Record<string, string> = {};
    for (const e of this.view().standings) names[e.team.id] = e.team.name;
    return names;
  });

  private readonly roundsByTeam = computed(() => {
    const rounds: Record<string, (number | null)[]> = {};
    for (const e of this.view().standings) rounds[e.team.id] = e.rounds;
    return rounds;
  });

  /** Pairings per round, by Tisch index, plus whether every score of the round is in. */
  protected readonly rows = computed(() =>
    this.view().schedule.map((round, r) => {
      const scores = this.roundsByTeam();
      const names = this.names();
      const pairings: ({ home: string; away: string } | undefined)[] = [];
      for (const p of round) {
        pairings[p.table - 1] = { home: names[p.homeId] ?? '?', away: names[p.awayId] ?? '?' };
      }
      const played = round.every((p) => scores[p.homeId]?.[r] != null && scores[p.awayId]?.[r] != null);
      return { pairings, played };
    }),
  );

  /** First round that isn't fully played yet (-1 once the group is done). */
  protected readonly nextRound = computed(() => this.rows().findIndex((row) => !row.played));

  protected readonly tischIndexes = computed(() => {
    const count = Math.max(0, ...this.view().schedule.map((round) => round.length));
    return Array.from({ length: count }, (_, i) => i);
  });

  protected readonly tischColWidth = computed(() => (100 - this.roundColWidth) / Math.max(1, this.tischIndexes().length));
}
