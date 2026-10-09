import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GroupView } from '../../services/tournament-store';

/**
 * Compact Spielplan of one group for the presentation: the current and the
 * next round only, one match per line, "Team A vs Team B". (No Tisch numbers —
 * each group always plays at the same table.) Sized off the group-card container (cqh/cqw)
 * like the compact standings table, so every group fits on screen.
 */
@Component({
  selector: 'app-present-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shownRounds().length === 0) {
      <p class="done">Alle Runden gespielt</p>
    } @else {
      <table class="schedule" [style.--sched-rows]="matchCount() + shownRounds().length">
        <caption class="visually-hidden">Spielplan {{ view().group.name }}</caption>
        <colgroup>
          <col class="team-col" />
          <col class="vs-col" />
          <col class="team-col" />
        </colgroup>
        @for (round of shownRounds(); track round.index) {
          <tbody [class.played]="round.played" [class.next]="round.index === nextRound()">
            <tr class="round-head">
              <th scope="rowgroup" colspan="3">
                Runde {{ round.index + 1 }} · {{ round.index === nextRound() ? 'jetzt' : 'danach' }}
              </th>
            </tr>
            @for (match of round.matches; track $index) {
              <tr>
                <td class="home">{{ match.home }}</td>
                <td class="vs" aria-label="gegen">vs</td>
                <td class="away">{{ match.away }}</td>
              </tr>
            }
          </tbody>
        }
      </table>
    }
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
      /* Bound by the number of match lines (height) and by the team column's
         width (~18 chars of a typical name fit; longer ones ellipsize). */
      font-size: clamp(
        0.55rem,
        min(calc(100cqh / var(--sched-rows, 15) * 0.55), calc(47cqw / 10)),
        1.5rem
      );
    }
    .team-col {
      inline-size: 47.5%;
    }
    .vs-col {
      inline-size: 5%;
    }
    tbody + tbody {
      border-block-start: 1px solid var(--table-rule-strong);
    }
    th,
    td {
      padding: 0 clamp(0.1rem, 0.6cqw, 0.35rem);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .round-head th {
      font-family: var(--font-display);
      font-size: 0.65em;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      text-align: center;
      color: var(--text-soft);
    }
    .home {
      text-align: end;
      font-weight: 600;
    }
    .away {
      text-align: start;
      font-weight: 600;
    }
    .vs {
      text-align: center;
      font-size: 0.7em;
      letter-spacing: 0.04em;
      color: var(--accent);
      text-overflow: clip;
    }
    tbody.played {
      color: var(--text-soft);
    }
    tbody.played .home,
    tbody.played .away {
      font-weight: 400;
    }
    tbody.next .round-head th {
      color: var(--accent);
    }
    .done {
      display: grid;
      place-items: center;
      block-size: 100%;
      margin: 0;
      font-size: clamp(0.8rem, 6cqw, 1.4rem);
      color: var(--text-soft);
    }

    /* Mobile: the stacked group-card only has inline-size containment (no
       reliable cqh) — keep in sync with the breakpoint in present-page.scss. */
    @media (max-width: 48rem), (orientation: portrait) {
      .schedule {
        font-size: clamp(0.75rem, calc(47cqw / 10), 1.1rem);
      }
      td,
      th {
        padding-block: 0.2rem;
      }
    }
  `,
})
export class PresentSchedule {
  readonly view = input.required<GroupView>();

  /** Matches per round, plus whether every score of the round is in. */
  protected readonly rounds = computed(() => {
    const names: Record<string, string> = {};
    const scores: Record<string, (number | null)[]> = {};
    for (const e of this.view().standings) {
      names[e.team.id] = e.team.name;
      scores[e.team.id] = e.rounds;
    }
    return this.view().schedule.map((round, r) => ({
      index: r,
      matches: round.map((p) => ({ home: names[p.homeId] ?? '?', away: names[p.awayId] ?? '?' })),
      played: round.every((p) => scores[p.homeId]?.[r] != null && scores[p.awayId]?.[r] != null),
    }));
  });

  /** First round that isn't fully played yet (-1 once the group is done). */
  protected readonly nextRound = computed(() => this.rounds().findIndex((r) => !r.played));

  /** Only what matters at the tables right now: the current round and the one after it. */
  protected readonly shownRounds = computed(() => {
    const current = this.nextRound();
    return current < 0 ? [] : this.rounds().slice(current, current + 2);
  });

  protected readonly matchCount = computed(() => this.shownRounds().reduce((n, r) => n + r.matches.length, 0));
}
