import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { clearStoredTournament, provideFakeApi } from '../../../testing/fake-api';
import { TournamentStore } from '../../services/tournament-store';
import { GroupsPage } from './groups-page';

describe('GroupsPage', () => {
  let fixture: ComponentFixture<GroupsPage>;
  let el: HTMLElement;
  let store: TournamentStore;

  beforeEach(() => {
    clearStoredTournament();
    TestBed.configureTestingModule({ providers: [provideFakeApi(), provideRouter([])] });
    store = TestBed.inject(TournamentStore);
  });

  afterEach(clearStoredTournament);

  function render() {
    fixture = TestBed.createComponent(GroupsPage);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  function tabs(): HTMLButtonElement[] {
    return [...el.querySelectorAll<HTMLButtonElement>('.tab')];
  }

  it('points to the setup without groups', () => {
    render();
    expect(el.querySelector('.empty-state a')?.getAttribute('href')).toBe('/einrichtung');
    expect(fixture.componentInstance['currentView']()).toBeNull();
  });

  it('shows one tab per group and switches between them', () => {
    store.loadDemo();
    render();
    expect(tabs().map((t) => t.textContent!.trim())).toEqual([
      'Gruppe A',
      'Gruppe B',
      'Gruppe C',
      'Gruppe D',
      'Gruppe E',
      'Gruppe F',
    ]);
    expect(tabs()[0].getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('h2')?.textContent).toContain('Gruppe A');

    tabs()[2].click();
    fixture.detectChanges();
    expect(tabs()[2].getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('h2')?.textContent).toContain('Gruppe C');
    expect(el.querySelector('.hint')?.textContent).toContain('Die besten 2 Teams');
  });

  it('falls back to the last group when the selected one disappears', () => {
    store.loadDemo();
    render();
    tabs()[5].click();
    fixture.detectChanges();
    store.removeGroup('g-f');
    fixture.detectChanges();
    expect(el.querySelector('h2')?.textContent).toContain('Gruppe E');
    expect(tabs()[4].getAttribute('aria-pressed')).toBe('true');
  });

  it('highlights the best round score of the whole group phase', () => {
    store.loadDemo();
    render();
    expect(fixture.componentInstance['topScore']()).toBe(1237);
    expect(el.querySelectorAll('td.top-score').length).toBe(1); // Schällejäger is in Gruppe A
  });

  it('stores entered scores', () => {
    store.loadDemo();
    render();
    const input = el.querySelector<HTMLInputElement>('app-match-entry input')!;
    input.value = '1000';
    input.dispatchEvent(new Event('change'));
    // Gruppe A, round 1, first match: team 3 at home.
    expect(store.tournament().groupScores['t-a3'][0]).toBe(1000);
  });
});
