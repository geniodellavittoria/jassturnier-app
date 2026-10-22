import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StandingsEntry } from '../models/tournament';
import { computeStandings } from '../services/schedule';
import { StandingsTable } from './standings-table';

describe('StandingsTable', () => {
  let fixture: ComponentFixture<StandingsTable>;
  let el: HTMLElement;

  const teams = {
    a: { id: 'a', name: 'Alpha', players: ['Anna', 'Beat'] },
    b: { id: 'b', name: 'Bravo', players: [] },
  };
  const entries = computeStandings(['a', 'b'], teams, { a: [900, 700, 800], b: [600, null, null] }, 3, true);

  function render(inputs: Partial<Record<keyof StandingsTable, unknown>> & { entries: StandingsEntry[] }) {
    fixture = TestBed.createComponent(StandingsTable);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  function rows(): string[][] {
    return [...el.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent!.trim().replace(/\s+/g, ' ')),
    );
  }

  it('renders rank, team with players, rounds and total', () => {
    render({ entries, caption: 'Gruppe A', highlightTop: 1 });
    expect([...el.querySelectorAll('thead th')].map((th) => th.textContent!.trim())).toEqual([
      'Rang',
      'Team',
      'R1',
      'R2',
      'R3',
      'Total',
    ]);
    expect(rows()).toEqual([
      ['1', 'AlphaAnna · Beat', '900', '700', '800', '1700'],
      ['2', 'Bravo', '600', '–', '–', '600'],
    ]);
    expect(el.querySelector('caption')?.textContent).toContain('Rangliste Gruppe A');
    expect(el.querySelectorAll('tr.qualified').length).toBe(1);
  });

  it('strikes the dropped round and explains it', () => {
    render({ entries });
    const dropped = el.querySelectorAll('td.dropped');
    expect(dropped.length).toBe(1);
    expect(dropped[0].textContent!.trim()).toBe('700');
    expect(el.querySelector('.drop-hint')).not.toBeNull();
  });

  it('has no hint without dropped rounds', () => {
    render({ entries: computeStandings(['b'], teams, { b: [600] }, 3, true) });
    expect(el.querySelector('.drop-hint')).toBeNull();
  });

  it('leaves empty player slots out', () => {
    const solo = { id: 's', name: 'Solo', players: ['', 'Beat'] };
    render({ entries: computeStandings(['s'], { s: solo }, {}, 1, false) });
    expect(el.querySelector('.players')?.textContent).toBe('Beat');
    render({ entries: computeStandings(['s'], { s: { ...solo, players: [''] } }, {}, 1, false) });
    expect(el.querySelector('.players')).toBeNull();
  });

  it('can hide players and highlight the top score', () => {
    render({ entries, showPlayers: false, topScore: 900 });
    expect(el.querySelector('.players')).toBeNull();
    const top = el.querySelectorAll('td.top-score');
    expect(top.length).toBe(1);
    expect(top[0].textContent!.trim()).toBe('900');
  });

  it('sizes columns in compact mode and leaves out the hint', () => {
    render({ entries, compact: true });
    expect(el.classList).toContain('compact');
    const widths = [...el.querySelectorAll('col')].map((c) => (c as HTMLElement).style.inlineSize);
    expect(widths).toEqual(['9%', '32%', '16%', '16%', '16%', '11%']);
    expect(el.querySelector('table')!.style.getPropertyValue('--table-num-col')).toBe('11');
    expect(el.querySelector('.drop-hint')).toBeNull();
  });

  it('renders an empty table without entries', () => {
    render({ entries: [], compact: true });
    expect(el.querySelectorAll('thead th').length).toBe(3);
    expect(el.querySelectorAll('col').length).toBe(3);
  });
});
