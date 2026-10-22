import { ComponentFixture, TestBed } from '@angular/core/testing';
import { clearStoredTournament, provideFakeApi } from '../../../testing/fake-api';
import { KoId } from '../../models/tournament';
import { TournamentStore } from '../../services/tournament-store';
import { KoMatchCard } from './ko-match-card';

describe('KoMatchCard', () => {
  let fixture: ComponentFixture<KoMatchCard>;
  let el: HTMLElement;
  let store: TournamentStore;

  beforeEach(() => {
    clearStoredTournament();
    TestBed.configureTestingModule({ providers: [provideFakeApi()] });
    store = TestBed.inject(TournamentStore);
    store.loadDemo();
  });

  afterEach(clearStoredTournament);

  function render(matchId: KoId, pendingText?: string) {
    fixture = TestBed.createComponent(KoMatchCard);
    fixture.componentRef.setInput('matchId', matchId);
    fixture.componentRef.setInput('label', 'Testspiel');
    if (pendingText) fixture.componentRef.setInput('pendingText', pendingText);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  function inputs(): HTMLInputElement[] {
    return [...el.querySelectorAll('input')];
  }

  function enter(side: 0 | 1, value: string) {
    inputs()[side].value = value;
    inputs()[side].dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('shows a pending note until teams are known', () => {
    store.setKoTeam('final', 'A', null);
    store.setKoTeam('final', 'B', null);
    render('final');
    expect(el.querySelector('h3')?.textContent).toBe('Testspiel');
    expect(el.querySelector('.pending')?.textContent).toBe('Wird nach den Halbfinals automatisch besetzt.');
    render('final', 'Bald');
    expect(el.querySelector('.pending')?.textContent).toBe('Bald');
  });

  it('shows both teams and marks the winner', () => {
    render('hf1');
    const sides = [...el.querySelectorAll('.side')];
    expect(sides.map((s) => s.querySelector('.name')!.textContent!.trim())).toEqual([
      'Nor do för de meter Sieg',
      'Schoggistängeli & Schnäpsli',
    ]);
    expect(sides[0].classList).toContain('winner');
    expect(inputs().map((i) => i.value)).toEqual(['651', '605']);
    expect(inputs()[0].id).toBe('ko-hf1-A');
    expect(el.querySelector('.draw-note')).toBeNull();
  });

  it('shows "Offen" and disables input for a missing team', () => {
    store.setKoTeam('final', 'B', null);
    render('final');
    expect(el.querySelectorAll('.name')[1].textContent!.trim()).toBe('Offen');
    expect(inputs()[1].disabled).toBeTrue();
    expect(inputs()[0].value).toBe('');
  });

  it('flags draws and point sums that do not add up', () => {
    render('final');
    enter(0, '600');
    enter(1, '600');
    const notes = [...el.querySelectorAll('.draw-note')].map((n) => n.textContent!.trim());
    expect(notes[0]).toContain('Gleichstand');
    expect(notes[1]).toBe('Die Punkte ergeben zusammen 1200 statt 1256.');
    expect(inputs()[0].classList).toContain('mismatch');
    expect(el.querySelector('.winner')).toBeNull();
  });

  it('counts missing points as zero in the sum', () => {
    store.setKoPoints('final', 'A', null);
    render('final');
    expect(fixture.componentInstance['pointsSum']()).toBe(0);
  });

  it('stores cleaned-up points', () => {
    render('final');
    enter(0, '700.4');
    enter(1, '-3');
    expect(store.tournament().ko.final.pointsA).toBe(700);
    expect(store.tournament().ko.final.pointsB).toBe(0);
    enter(0, '');
    expect(store.tournament().ko.final.pointsA).toBeNull();

    spyOnProperty(inputs()[1], 'value').and.returnValue('abc');
    inputs()[1].dispatchEvent(new Event('change'));
    expect(store.tournament().ko.final.pointsB).toBeNull();
  });
});
