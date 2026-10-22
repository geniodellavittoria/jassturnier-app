import { ComponentFixture, discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { clearStoredTournament, provideFakeApi } from '../../../testing/fake-api';
import { TournamentStore } from '../../services/tournament-store';
import { SetupPage } from './setup-page';

describe('SetupPage', () => {
  let fixture: ComponentFixture<SetupPage>;
  let el: HTMLElement;
  let store: TournamentStore;
  let confirmSpy: jasmine.Spy;

  beforeEach(() => {
    clearStoredTournament();
    TestBed.configureTestingModule({ providers: [provideFakeApi()] });
    confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
  });

  afterEach(clearStoredTournament);

  function render() {
    store = TestBed.inject(TournamentStore);
    fixture = TestBed.createComponent(SetupPage);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  function input(id: string): HTMLInputElement {
    return el.querySelector<HTMLInputElement>(`#${id}`)!;
  }

  function type(id: string, value: string) {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input'));
  }

  function click(label: string) {
    const button = [...el.querySelectorAll('button')].find((b) => b.textContent!.trim() === label)!;
    button.click();
    fixture.detectChanges();
  }

  it('fills the rules form from the store', () => {
    render();
    expect(input('meta-name').value).toBe('Jassturnier');
    expect(input('meta-rounds').value).toBe('5');
    expect(input('meta-drop').checked).toBeTrue();
  });

  it('saves rule changes after a short pause', fakeAsync(() => {
    render();
    type('meta-name', 'Herbstjass');
    type('meta-rounds', '4');
    input('meta-drop').click();
    tick(100);
    expect(store.tournament().name).toBe('Jassturnier');
    tick(250);
    expect(store.tournament()).toEqual(jasmine.objectContaining({ name: 'Herbstjass', groupRounds: 4, dropWorst: false }));
    discardPeriodicTasks();
  }));

  it('falls back to the default name for a blank one and ignores invalid rules', fakeAsync(() => {
    render();
    type('meta-name', '   ');
    tick(250);
    expect(store.tournament().name).toBe('Jassturnier');
    type('meta-name', 'Cup');
    type('meta-rounds', '99');
    tick(250);
    expect(store.tournament().groupRounds).toBe(5);
    expect(store.tournament().name).toBe('Jassturnier');
    discardPeriodicTasks();
  }));

  it('picks up rules that change after the page opened', () => {
    render();
    type('meta-name', ''); // even into a field that was just cleared
    store.updateMeta({ name: 'Vom Server', groupRounds: 4 }); // e.g. the first server pull
    fixture.detectChanges();
    expect(input('meta-name').value).toBe('Vom Server');
    expect(input('meta-rounds').value).toBe('4');
  });

  it('ignores store changes that are not rules', () => {
    render();
    type('meta-name', 'Halb getippt');
    store.addGroup();
    fixture.detectChanges();
    expect(input('meta-name').value).toBe('Halb getippt');
  });

  it('keeps a field being edited when another admin changes a different rule', fakeAsync(() => {
    render();
    type('meta-name', 'Mein Name');
    store.updateMeta({ year: 2030 });
    fixture.detectChanges();
    expect(input('meta-name').value).toBe('Mein Name');
    expect(input('meta-year').value).toBe('2030');
    tick(250);
    expect(store.tournament()).toEqual(jasmine.objectContaining({ name: 'Mein Name', year: 2030 }));
    discardPeriodicTasks();
  }));

  it('does not rewrite what was typed once it is saved', fakeAsync(() => {
    render();
    type('meta-name', 'Herbst ');
    tick(250);
    fixture.detectChanges();
    expect(store.tournament().name).toBe('Herbst');
    expect(input('meta-name').value).toBe('Herbst ');
    discardPeriodicTasks();
  }));

  it('starts with an empty state that offers the demo', () => {
    render();
    expect(el.querySelector('.empty-state')).not.toBeNull();
    click('Neue Gruppe');
    expect(el.querySelector('.empty-state')).toBeNull();
    expect(el.querySelectorAll('app-group-editor').length).toBe(1);
  });

  it('loads the demo after confirming and updates the form', () => {
    render();
    confirmSpy.and.returnValue(false);
    click('Demo-Daten 2025 laden');
    expect(store.tournament().groups.length).toBe(0);
    confirmSpy.and.returnValue(true);
    el.querySelector<HTMLButtonElement>('.empty-state button')!.click();
    fixture.detectChanges();
    expect(store.tournament().groups.length).toBe(6);
    expect(input('meta-name').value).toBe('Jassturnier 2025');
    expect(el.querySelectorAll('app-group-editor').length).toBe(6);
  });

  it('resets scores or everything after confirming', () => {
    render();
    store.loadDemo();
    confirmSpy.and.returnValue(false);
    click('Nur Punkte zurücksetzen');
    click('Alles löschen');
    expect(store.tournament().finalGroups.length).toBe(3);

    confirmSpy.and.returnValue(true);
    click('Nur Punkte zurücksetzen');
    expect(store.tournament().finalGroups.length).toBe(0);
    expect(store.tournament().groups.length).toBe(6);

    click('Alles löschen');
    expect(store.tournament().groups.length).toBe(0);
    expect(input('meta-name').value).toBe('Jassturnier');
  });
});
