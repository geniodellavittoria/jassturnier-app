import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScoreMap, Team } from '../models/tournament';
import { roundRobin } from '../services/schedule';
import { MatchEntry, ScoreChange } from './match-entry';

describe('MatchEntry', () => {
  let fixture: ComponentFixture<MatchEntry>;
  let el: HTMLElement;
  let changes: ScoreChange[];

  const teams: Record<string, Team> = {
    a: { id: 'a', name: 'Alpha', players: [] },
    b: { id: 'b', name: 'Bravo', players: [] },
    c: { id: 'c', name: 'Charlie', players: [] },
    d: { id: 'd', name: 'Delta', players: [] },
  };

  function render(scores: ScoreMap, topScore: number | null = null, schedule = roundRobin(['a', 'b', 'c', 'd'])) {
    fixture = TestBed.createComponent(MatchEntry);
    fixture.componentRef.setInput('schedule', schedule);
    fixture.componentRef.setInput('teams', teams);
    fixture.componentRef.setInput('scores', scores);
    fixture.componentRef.setInput('maxPoints', 157);
    fixture.componentRef.setInput('topScore', topScore);
    changes = [];
    fixture.componentInstance.scoreChange.subscribe((c) => changes.push(c));
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  function rounds(): HTMLElement[] {
    return [...el.querySelectorAll<HTMLElement>('section.round')];
  }

  function inputs(): HTMLInputElement[] {
    return [...el.querySelectorAll('input')];
  }

  it('lists every round as "home [ ] : [ ] away"', () => {
    render({});
    expect(rounds().length).toBe(3);
    const firstMatch = rounds()[0].querySelector('li')!;
    expect([...firstMatch.querySelectorAll('.team')].map((t) => t.textContent!.trim())).toEqual(['Alpha', 'Bravo']);
    expect(inputs()[0].getAttribute('aria-label')).toBe('Punkte Alpha, Runde 1');
  });

  it('marks complete rounds and the current one', () => {
    render({ a: [100, null, null], b: [57, null, null], c: [80, 70], d: [77] });
    const [r1, r2, r3] = rounds();
    expect(r1.querySelector('.done')).not.toBeNull();
    expect(r1.classList).not.toContain('current');
    expect(r2.classList).toContain('current');
    expect(r2.querySelector('.badge')?.textContent).toBe('aktuell');
    expect(r3.querySelector('.badge')).toBeNull();
    expect(inputs()[0].value).toBe('100');
    expect(inputs()[4].value).toBe('');
  });

  it('warns when a match does not add up to the maximum', () => {
    render({ a: [100], b: [50] });
    const match = rounds()[0].querySelector('li')!;
    expect(match.classList).toContain('mismatch');
    expect(match.querySelector('.sum-warning')?.textContent).toContain('150 statt 157');
    expect(inputs()[0].getAttribute('aria-invalid')).toBe('true');
  });

  it('highlights the top score', () => {
    render({ a: [120], b: [37] }, 120);
    expect(inputs()[0].classList).toContain('top-score');
    expect(inputs()[1].classList).not.toContain('top-score');
  });

  it('shows "?" for unknown teams', () => {
    render({}, null, [[{ table: 1, homeId: 'a', awayId: 'ghost' }]]);
    expect(el.querySelector('.away')?.textContent).toBe('?');
  });

  function enter(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('change'));
  }

  it('emits cleaned-up scores per team and round', () => {
    render({});
    const all = inputs();
    enter(all[1], '57');
    enter(all[2], '12.6');
    enter(all[4], '-5');
    enter(all[0], '');
    expect(changes).toEqual([
      { teamId: 'b', round: 0, value: 57 },
      { teamId: 'c', round: 0, value: 13 },
      { teamId: 'a', round: 1, value: 0 },
      { teamId: 'a', round: 0, value: null },
    ]);
  });

  it('treats unparsable input as empty', () => {
    render({});
    const input = inputs()[0];
    spyOnProperty(input, 'value').and.returnValue('abc');
    input.dispatchEvent(new Event('change'));
    expect(changes).toEqual([{ teamId: 'a', round: 0, value: null }]);
  });
});
