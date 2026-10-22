import { ComponentFixture, discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { clearStoredTournament, provideFakeApi } from '../../../testing/fake-api';
import { emptyKo } from '../../models/tournament';
import { AdminAuth } from '../../services/admin-auth';
import { TournamentStore } from '../../services/tournament-store';
import { PresentPage } from './present-page';

describe('PresentPage', () => {
  let fixture: ComponentFixture<PresentPage>;
  let el: HTMLElement;
  let store: TournamentStore;
  let page: PresentPage;

  beforeEach(() => {
    clearStoredTournament();
    TestBed.configureTestingModule({ providers: [provideFakeApi(), provideRouter([])] });
    store = TestBed.inject(TournamentStore);
    spyOnProperty(window, 'innerWidth').and.returnValue(1600);
    spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
  });

  afterEach(clearStoredTournament);

  function render() {
    fixture = TestBed.createComponent(PresentPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  function slideButtons(): HTMLButtonElement[] {
    return [...el.querySelectorAll<HTMLButtonElement>('.slide-switch button')];
  }

  function groupNames(): string[] {
    return [...el.querySelectorAll('.group-card h2')].map((h) => h.textContent!.trim());
  }

  function key(key: string, target?: EventTarget) {
    const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
    (target ?? document).dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  /** Demo with group phase and Finalrunde, but no KO seeded yet. */
  function demoBeforeKo() {
    store.loadDemo();
    store['mutate']((t) => ({ ...t, ko: emptyKo() }));
  }

  describe('stage', () => {
    it('previews made-up groups before anything is set up', () => {
      render();
      expect(el.classList).toContain('slate');
      expect(el.querySelector('.preview-note')).not.toBeNull();
      expect(groupNames()).toEqual(['Gruppe 1', 'Gruppe 2', 'Gruppe 3', 'Gruppe 4', 'Gruppe 5', 'Gruppe 6']);
      expect(slideButtons().map((b) => b.textContent!.trim())).toEqual(['Rangliste', 'Spielplan']);
      expect(el.querySelectorAll('.group-card')[0].querySelectorAll('tbody tr').length).toBe(6);
      // Every other group is still in progress, and the top score is highlighted.
      expect(el.querySelectorAll('td.top-score').length).toBeGreaterThan(0);
    });

    it('keeps the real group names while the groups are empty', () => {
      store.addGroup();
      store.addGroup();
      render();
      expect(groupNames()).toEqual(['Gruppe A', 'Gruppe B']);
      expect(el.querySelector('.preview-note')).not.toBeNull();
    });

    it('shows the group phase standings with the qualifiers marked', () => {
      store.loadDemo();
      store.updateMeta({ presentationStage: 'group' });
      render();
      expect(el.querySelector('.preview-note')).toBeNull();
      expect(groupNames()).toEqual(['Gruppe A', 'Gruppe B', 'Gruppe C', 'Gruppe D', 'Gruppe E', 'Gruppe F']);
      expect(el.querySelectorAll('.group-card')[0].querySelectorAll('tr.qualified').length).toBe(2);
      expect(el.querySelector('td.top-score')?.textContent?.trim()).toBe('1237');
      const grid = el.querySelector<HTMLElement>('.groups-grid')!;
      expect(grid.style.getPropertyValue('--group-cols')).toBe('3');
      expect(grid.style.getPropertyValue('--group-rows')).toBe('2');
      expect(grid.style.getPropertyValue('--table-row-count')).toBe('7');
    });

    it('follows the tournament to the Finalrunde once it has teams', () => {
      demoBeforeKo();
      render();
      expect(groupNames()).toEqual(['Finalgruppe 1', 'Finalgruppe 2', 'Finalgruppe 3']);
      expect(el.querySelectorAll('.group-card')[0].querySelectorAll('tr.qualified').length).toBe(1);
      expect(el.querySelector('td.top-score')).toBeNull();
    });

    it('stays on the group phase while the Finalrunde groups are empty', () => {
      store.loadDemo();
      store['mutate']((t) => ({ ...t, ko: emptyKo(), finalGroups: t.finalGroups.map((g) => ({ ...g, teamIds: [] })) }));
      render();
      expect(groupNames()[0]).toBe('Gruppe A');
    });

    it('previews made-up final groups when pinned before the draw', () => {
      store.updateMeta({ presentationStage: 'final' });
      render();
      expect(groupNames()).toEqual(['Finalgruppe 1', 'Finalgruppe 2', 'Finalgruppe 3']);
      expect(el.querySelectorAll('.group-card')[0].querySelectorAll('tbody tr').length).toBe(4);
    });

    it('shows the KO bracket and podium once seeded', () => {
      store.loadDemo();
      store.setKoPoints('final', 'A', 700);
      store.setKoPoints('final', 'B', 556);
      store.setKoPoints('kleinerFinal', 'A', 500);
      store.setKoPoints('kleinerFinal', 'B', 756);
      render();
      expect(el.querySelector('.slide-switch')).toBeNull();
      expect(el.querySelector('.preview-note')).toBeNull();
      const winners = [...el.querySelectorAll('.tie-row.winner span:first-child')].map((s) => s.textContent);
      expect(winners).toEqual(['Nor do för de meter', 'Jhonnys', 'Rainer Wahnsinn', 'Nor do för de meter']);
      expect(el.querySelector('.podium .champion')?.textContent).toBe('Nor do för de meter');
      expect(el.querySelector('.podium .champion-players')?.textContent).toBe('Noe Durand · Pietro Di Berardino');
      expect([...el.querySelectorAll('.minor-places span')].map((s) => s.textContent)).toEqual([
        '2. Jhonnys',
        '3. Rainer Wahnsinn',
      ]);
    });

    it('shows open KO slots without a podium', () => {
      store.loadDemo();
      store.setKoTeam('hf1', 'A', null);
      render();
      const rows = [...el.querySelectorAll('.tie-row')].map((r) => [...r.querySelectorAll('span')].map((s) => s.textContent));
      expect(rows[0]).toEqual(['…', '651']);
      expect(rows[4]).toEqual(['Schoggistängeli & Schnäpsli', '–']);
      expect(el.querySelector('.podium')).toBeNull();
    });

    it('leaves out an unplayed kleiner Final and players on the podium', () => {
      store.loadDemo();
      store.updateTeam('t-c2', { players: [] });
      store.setKoPoints('final', 'A', 700);
      store.setKoPoints('final', 'B', 556);
      render();
      expect(el.querySelector('.podium .champion-players')).toBeNull();
      expect(el.querySelectorAll('.minor-places span').length).toBe(1);
    });

    it('shows a removed team as open in the bracket', () => {
      store.loadDemo();
      store.removeTeam('t-c2');
      render();
      expect(el.querySelector('.tie-row span')?.textContent).toBe('…');
    });

    it('shows KO teams that no longer exist as open (data saved before removals cleaned up the KO)', () => {
      store.loadDemo();
      store['mutate']((t) => ({ ...t, ko: { ...t.ko, hf1: { ...t.ko.hf1, teamA: 'gone' } } }));
      render();
      expect(el.querySelector('.tie-row span')?.textContent).toBe('…');
    });

    it('previews a made-up bracket when pinned to KO before seeding', () => {
      store.updateMeta({ presentationStage: 'ko' });
      render();
      expect(el.querySelector('.preview-note')).not.toBeNull();
      expect(el.querySelector('.podium .champion')?.textContent).toBe('Undenufe Ultras');
    });
  });

  describe('slides', () => {
    beforeEach(() => {
      store.loadDemo();
      store.updateMeta({ presentationStage: 'group' });
    });

    it('switches between standings and schedule', () => {
      render();
      expect(el.querySelector('app-standings-table')).not.toBeNull();
      slideButtons()[1].click();
      fixture.detectChanges();
      expect(slideButtons()[1].getAttribute('aria-current')).toBe('true');
      expect(el.querySelector('app-present-schedule')).not.toBeNull();
      expect(el.querySelector('app-standings-table')).toBeNull();
    });

    it('steps through the slides with the keyboard', () => {
      render();
      const index = () => page['index']();
      key('ArrowRight');
      expect(index()).toBe(1);
      key('PageDown');
      expect(index()).toBe(0);
      key('ArrowLeft');
      expect(index()).toBe(1);
      key('PageUp');
      expect(index()).toBe(0);
      key('x');
      expect(index()).toBe(0);
    });

    it('ignores keys typed into inputs', () => {
      render();
      const input = document.createElement('input');
      el.appendChild(input);
      key('ArrowRight', input);
      expect(page['index']()).toBe(0);
    });

    it('pauses with the space bar and the button', () => {
      render();
      expect(key(' ').defaultPrevented).toBeTrue();
      expect(page['paused']()).toBeTrue();
      const pause = el.querySelector<HTMLButtonElement>('.controls button')!;
      expect(pause.textContent!.trim()).toBe('Weiter');
      pause.click();
      fixture.detectChanges();
      expect(pause.textContent!.trim()).toBe('Pause');
    });

    it('advances automatically every 12 seconds unless paused', fakeAsync(() => {
      render();
      tick(12_000);
      expect(page['index']()).toBe(1);
      tick(12_000);
      expect(page['index']()).toBe(0);
      page['togglePause']();
      tick(12_000);
      expect(page['index']()).toBe(0);
      fixture.destroy();
      discardPeriodicTasks();
    }));

    it('does not advance with a single slide', fakeAsync(() => {
      store.updateMeta({ presentationStage: 'ko' });
      render();
      tick(12_000);
      expect(page['index']()).toBe(0);
      fixture.destroy();
      discardPeriodicTasks();
    }));

    it('stops its timer when destroyed', fakeAsync(() => {
      render();
      fixture.destroy();
      tick(12_000);
      expect(page['index']()).toBe(0);
      discardPeriodicTasks();
    }));

    it('starts paused for people who prefer reduced motion', () => {
      (window.matchMedia as jasmine.Spy).and.returnValue({ matches: true } as MediaQueryList);
      render();
      expect(page['paused']()).toBeTrue();
    });

    it('labels the KO slide', () => {
      // A lone KO slide has no slide switch, so the label isn't rendered anywhere yet.
      render();
      expect(page['slideLabel']({ kind: 'ko' })).toBe('KO-Phase');
    });
  });

  describe('narrow screens', () => {
    beforeEach(() => {
      (Object.getOwnPropertyDescriptor(window, 'innerWidth')!.get as jasmine.Spy).and.returnValue(600);
      store.loadDemo();
      store.updateMeta({ presentationStage: 'group' });
    });

    it('stacks the groups in one column and starts paused', () => {
      render();
      const grid = el.querySelector<HTMLElement>('.groups-grid')!;
      expect(grid.style.getPropertyValue('--group-cols')).toBe('1');
      expect(grid.style.getPropertyValue('--group-rows')).toBe('6');
      expect(page['paused']()).toBeTrue();
    });

    it('switches layout when the window is resized', () => {
      render();
      (Object.getOwnPropertyDescriptor(window, 'innerWidth')!.get as jasmine.Spy).and.returnValue(1600);
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      expect(el.querySelector<HTMLElement>('.groups-grid')!.style.getPropertyValue('--group-cols')).toBe('3');
    });

    it('jumps to a group below the sticky bar', () => {
      render();
      const scrollTo: jasmine.Spy = spyOn(window, 'scrollTo');
      const card = el.querySelector<HTMLElement>('#group-g-c')!;
      spyOn(card, 'getBoundingClientRect').and.returnValue({ top: 500 } as DOMRect);
      const bar = el.querySelector<HTMLElement>('.group-jump')!;
      spyOnProperty(bar, 'offsetHeight').and.returnValue(40);
      el.querySelectorAll<HTMLButtonElement>('.group-jump button')[2].click();
      expect(scrollTo).toHaveBeenCalledWith({ top: 500 + window.scrollY - 40 - 4 });

      bar.remove();
      page['jumpToGroup']('g-c');
      expect(scrollTo).toHaveBeenCalledWith({ top: 500 + window.scrollY - 0 - 4 });
    });

    it('ignores jumps to unknown groups', () => {
      render();
      const scrollTo: jasmine.Spy = spyOn(window, 'scrollTo');
      page['jumpToGroup']('nope');
      expect(scrollTo).not.toHaveBeenCalled();
    });
  });

  describe('fullscreen', () => {
    it('enters fullscreen with the button or F', () => {
      render();
      spyOnProperty(document, 'fullscreenElement').and.returnValue(null);
      const request = spyOn(el, 'requestFullscreen').and.resolveTo();
      el.querySelector<HTMLButtonElement>('.fullscreen-btn')!.click();
      key('f');
      expect(request).toHaveBeenCalledTimes(2);
    });

    it('leaves fullscreen when already in it', () => {
      render();
      spyOnProperty(document, 'fullscreenElement').and.returnValue(el);
      const exit = spyOn(document, 'exitFullscreen').and.resolveTo();
      key('f');
      expect(exit).toHaveBeenCalled();
    });

    it('does nothing where fullscreen is unsupported', () => {
      render();
      spyOnProperty(document, 'fullscreenElement').and.returnValue(null);
      Object.defineProperty(el, 'requestFullscreen', { value: undefined });
      expect(() => key('f')).not.toThrow();
    });
  });

  describe('admin link', () => {
    it('links back to score entry for admins only', () => {
      render();
      expect(el.querySelector('.chalk-link')).toBeNull();
      TestBed.inject(AdminAuth).authenticated.set(true);
      fixture.detectChanges();
      expect(el.querySelector('.chalk-link')?.getAttribute('href')).toBe('/gruppen');
    });
  });
});
