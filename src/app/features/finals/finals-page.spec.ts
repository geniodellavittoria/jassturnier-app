import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { clearStoredTournament, provideFakeApi } from '../../../testing/fake-api';
import { emptyKo } from '../../models/tournament';
import { TournamentStore } from '../../services/tournament-store';
import { FinalsPage } from './finals-page';

describe('FinalsPage', () => {
  let fixture: ComponentFixture<FinalsPage>;
  let el: HTMLElement;
  let store: TournamentStore;
  let confirmSpy: jasmine.Spy;

  beforeEach(() => {
    clearStoredTournament();
    TestBed.configureTestingModule({ providers: [provideFakeApi(), provideRouter([])] });
    store = TestBed.inject(TournamentStore);
    confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
  });

  afterEach(clearStoredTournament);

  function render() {
    fixture = TestBed.createComponent(FinalsPage);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  function button(label: string): HTMLButtonElement {
    return [...el.querySelectorAll('button')].find((b) => b.textContent!.trim() === label)!;
  }

  function click(label: string) {
    button(label).click();
    fixture.detectChanges();
  }

  /** Demo groups with a complete group phase but no Finalrunde yet. */
  function groupPhaseOnly() {
    store.loadDemo();
    store.resetScores();
    for (const g of store.tournament().groups) {
      g.teamIds.forEach((id, i) => [0, 1, 2, 3, 4].forEach((r) => store.setGroupScore(id, r, 900 + i)));
    }
  }

  it('points to the setup without groups', () => {
    render();
    expect(el.querySelector('.empty-state a')?.getAttribute('href')).toBe('/einrichtung');
  });

  it('draws the Finalrunde without asking once the group phase is complete', () => {
    groupPhaseOnly();
    render();
    expect(el.querySelector('.actions .hint')).toBeNull();
    click('Finalrunde auslosen');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(el.querySelectorAll('section[aria-label^="Finalgruppe"]').length).toBe(3);
    expect(button('Finalrunde neu auslosen')).toBeDefined();
  });

  it('does not treat a group without teams as complete', () => {
    store.addGroup();
    render();
    expect(el.querySelector('.actions .hint')?.textContent).toContain('noch nicht vollständig');
  });

  it('asks before drawing from an incomplete group phase', () => {
    store.addGroup();
    store.addTeam(store.tournament().groups[0].id, 'T', []);
    render();
    expect(el.querySelector('.actions .hint')?.textContent).toContain('noch nicht vollständig');
    confirmSpy.and.returnValue(false);
    click('Finalrunde auslosen');
    expect(confirmSpy.calls.mostRecent().args[0]).toContain('noch nicht komplett');
    expect(store.tournament().finalGroups).toEqual([]);
    confirmSpy.and.returnValue(true);
    click('Finalrunde auslosen');
    expect(store.tournament().finalGroups.length).toBe(1);
  });

  it('asks before drawing again', () => {
    store.loadDemo();
    render();
    confirmSpy.and.returnValue(false);
    click('Finalrunde neu auslosen');
    expect(confirmSpy.calls.mostRecent().args[0]).toContain('neu auslosen');
    expect(store.tournament().finalScores['t-a4']).toEqual([542, 693, 703]);
  });

  it('stores Finalrunde scores', () => {
    store.loadDemo();
    render();
    const input = el.querySelector<HTMLInputElement>('app-match-entry input')!;
    input.value = '600';
    input.dispatchEvent(new Event('change'));
    expect(store.tournament().finalScores['t-a4'][0]).toBe(600);
  });

  it('seeds the semifinals without asking once the final groups are complete', () => {
    store.loadDemo();
    store['mutate']((t) => ({ ...t, ko: emptyKo() }));
    render();
    expect(el.querySelector('app-ko-match-card')).toBeNull();
    click('Halbfinals setzen');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(el.querySelectorAll('app-ko-match-card').length).toBe(4);
    expect(button('Halbfinals neu setzen')).toBeDefined();
  });

  it('asks before seeding from incomplete final groups', () => {
    store.loadDemo();
    store['mutate']((t) => ({ ...t, ko: emptyKo() }));
    store.setFinalScore('t-a4', 0, null);
    render();
    confirmSpy.and.returnValue(false);
    click('Halbfinals setzen');
    expect(confirmSpy.calls.mostRecent().args[0]).toContain('noch nicht komplett');
    expect(store.tournament().ko.hf1.teamA).toBeNull();
  });

  it('asks before seeding again', () => {
    store.loadDemo();
    render();
    click('Halbfinals neu setzen');
    expect(confirmSpy.calls.mostRecent().args[0]).toContain('neu setzen');
    expect(store.tournament().ko.hf1.pointsA).toBeNull();
  });

  it('explains when there are too few finalists to seed', () => {
    store.loadDemo();
    store['mutate']((t) => ({
      ...t,
      ko: emptyKo(),
      finalGroups: [{ ...t.finalGroups[0], teamIds: t.finalGroups[0].teamIds.slice(0, 3) }],
    }));
    render();
    click('Halbfinals setzen');
    expect(el.querySelector('.seed-error')?.textContent).toContain('mindestens vier Teams');
    expect(el.querySelector('app-ko-match-card')).toBeNull();

    store['mutate']((t) => ({ ...t, finalGroups: [{ ...t.finalGroups[0], teamIds: ['t-a4', 't-b4', 't-d1', 't-e5'] }] }));
    click('Halbfinals setzen');
    expect(el.querySelector('.seed-error')).toBeNull();
    expect(el.querySelectorAll('app-ko-match-card').length).toBe(4);
  });

  it('shows KO cards when only the second semifinal is set', () => {
    store.loadDemo();
    store.setKoTeam('hf1', 'A', null);
    render();
    expect(el.querySelectorAll('app-ko-match-card').length).toBe(4);
  });

  it('celebrates the champion with players', () => {
    store.loadDemo();
    store.setKoPoints('final', 'A', 700);
    store.setKoPoints('final', 'B', 556);
    render();
    expect(el.querySelector('.champion-name')?.textContent).toBe('Nor do för de meter');
    expect(el.querySelector('.champion-players')?.textContent).toBe('Noe Durand · Pietro Di Berardino');
    expect(el.querySelector('.champion-label')?.textContent).toBe('Turniersieger 2025');
  });

  it('celebrates a champion without players', () => {
    store.loadDemo();
    store.updateTeam('t-c2', { players: [] });
    store.setKoPoints('final', 'A', 700);
    store.setKoPoints('final', 'B', 556);
    render();
    expect(el.querySelector('.champion-players')).toBeNull();
  });
});
