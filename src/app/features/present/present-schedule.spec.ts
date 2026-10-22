import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScoreMap, Team } from '../../models/tournament';
import { computeStandings, roundRobin } from '../../services/schedule';
import { GroupView } from '../../services/tournament-store';
import { PresentSchedule } from './present-schedule';

describe('PresentSchedule', () => {
  let fixture: ComponentFixture<PresentSchedule>;
  let el: HTMLElement;

  const ids = ['a', 'b', 'c', 'd'];
  const teams: Record<string, Team> = Object.fromEntries(
    ids.map((id) => [id, { id, name: `Team ${id.toUpperCase()}`, players: [] }]),
  );

  function render(scores: ScoreMap, schedule = roundRobin(ids)) {
    const view: GroupView = {
      group: { id: 'g', name: 'Gruppe A', teamIds: ids },
      standings: computeStandings(ids, teams, scores, 3, false),
      schedule,
    };
    fixture = TestBed.createComponent(PresentSchedule);
    fixture.componentRef.setInput('view', view);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  function heads(): string[] {
    return [...el.querySelectorAll('.round-head th')].map((th) => th.textContent!.trim().replace(/\s+/g, ' '));
  }

  it('shows the current and the next round as "A vs B"', () => {
    render({});
    expect(heads()).toEqual(['Runde 1 · jetzt', 'Runde 2 · danach']);
    const firstMatch = [...el.querySelectorAll('tbody tr:not(.round-head)')][0];
    expect([...firstMatch.querySelectorAll('td')].map((td) => td.textContent)).toEqual(['Team A', 'vs', 'Team B']);
    expect(el.querySelector('table')!.style.getPropertyValue('--sched-rows')).toBe('6');
    expect(el.querySelector('tbody.next')).not.toBeNull();
  });

  it('moves on once a round is fully played', () => {
    render({ a: [1], b: [1], c: [1], d: [1, 1] });
    expect(heads()).toEqual(['Runde 2 · jetzt', 'Runde 3 · danach']);
  });

  it('shows only the last round when it is the current one', () => {
    render({ a: [1, 1], b: [1, 1], c: [1, 1], d: [1, 1] });
    expect(heads()).toEqual(['Runde 3 · jetzt']);
  });

  it('says when every round is played', () => {
    render({ a: [1, 1, 1], b: [1, 1, 1], c: [1, 1, 1], d: [1, 1, 1] });
    expect(el.querySelector('.done')?.textContent).toBe('Alle Runden gespielt');
    expect(el.querySelector('table')).toBeNull();
  });

  it('shows "?" for teams missing from the standings', () => {
    render({}, [[{ table: 1, homeId: 'ghost', awayId: 'a' }], [{ table: 1, homeId: 'a', awayId: 'ghost' }]]);
    expect([...el.querySelectorAll('td.home, td.away')].map((td) => td.textContent)).toEqual(['?', 'Team A', 'Team A', '?']);
  });
});
