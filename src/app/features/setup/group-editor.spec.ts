import { ComponentFixture, TestBed } from '@angular/core/testing';
import { clearStoredTournament, provideFakeApi } from '../../../testing/fake-api';
import { Group } from '../../models/tournament';
import { TournamentStore } from '../../services/tournament-store';
import { GroupEditor } from './group-editor';

describe('GroupEditor', () => {
  let fixture: ComponentFixture<GroupEditor>;
  let el: HTMLElement;
  let store: TournamentStore;
  let confirmSpy: jasmine.Spy;

  beforeEach(() => {
    clearStoredTournament();
    TestBed.configureTestingModule({ providers: [provideFakeApi()] });
    store = TestBed.inject(TournamentStore);
    confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
    store.addGroup();
  });

  afterEach(clearStoredTournament);

  function group(): Group {
    return store.tournament().groups[0];
  }

  function render() {
    fixture = TestBed.createComponent(GroupEditor);
    fixture.componentRef.setInput('group', group());
    fixture.componentRef.setInput('index', 0);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  /** Re-feed the group input like the parent page does after a store change. */
  function refresh() {
    fixture.componentRef.setInput('group', group());
    fixture.detectChanges();
  }

  function change(selector: string, value: string) {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('change'));
  }

  function addTeam(name: string, p1 = '', p2 = '') {
    for (const [id, value] of [
      ['name', name],
      ['p1', p1],
      ['p2', p2],
    ]) {
      const input = el.querySelector<HTMLInputElement>(`#add-${id}-${group().id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    refresh();
  }

  function teamId(): string {
    return group().teamIds[0];
  }

  it('shows an empty group', () => {
    render();
    expect(el.classList).toContain('card');
    expect(el.querySelector('.empty')).not.toBeNull();
    expect(el.querySelector<HTMLInputElement>('.group-name')!.value).toBe('Gruppe A');
  });

  it('renames the group, ignoring blank names', () => {
    render();
    change('.group-name', '  ');
    expect(group().name).toBe('Gruppe A');
    change('.group-name', ' Ost ');
    expect(group().name).toBe('Ost');
  });

  it('adds teams with trimmed names and players', () => {
    render();
    const submit = el.querySelector<HTMLButtonElement>('.add-team button')!;
    expect(submit.disabled).toBeTrue();
    addTeam(' Bock-Stars ', ' Anna ', '');
    expect(store.team(teamId())).toEqual(jasmine.objectContaining({ name: 'Bock-Stars', players: ['Anna'] }));
    expect(el.querySelectorAll('.team-row').length).toBe(1);
    expect(el.querySelector<HTMLInputElement>(`#add-name-${group().id}`)!.value).toBe('');
  });

  it('does not add a team without a name', () => {
    render();
    fixture.componentInstance['addTeam']();
    expect(group().teamIds).toEqual([]);
  });

  it('edits team names, ignoring blank ones', () => {
    render();
    addTeam('Alt');
    change(`#tn-${teamId()}`, ' ');
    expect(store.team(teamId())?.name).toBe('Alt');
    change(`#tn-${teamId()}`, 'Neu');
    expect(store.team(teamId())?.name).toBe('Neu');
  });

  it('edits players per slot', () => {
    render();
    addTeam('T', 'Anna', 'Beat');
    expect(el.querySelector<HTMLInputElement>(`#p2-${teamId()}`)!.value).toBe('Beat');
    change(`#p1-${teamId()}`, ' Carla ');
    expect(store.team(teamId())?.players).toEqual(['Carla', 'Beat']);
    change(`#p1-${teamId()}`, '');
    expect(store.team(teamId())?.players).toEqual(['', 'Beat']);
  });

  it('keeps a second player in the second slot when the first is empty', () => {
    render();
    addTeam('T');
    change(`#p2-${teamId()}`, 'Beat');
    expect(store.team(teamId())?.players).toEqual(['', 'Beat']);
    refresh();
    expect(el.querySelector<HTMLInputElement>(`#p1-${teamId()}`)!.value).toBe('');
    expect(el.querySelector<HTMLInputElement>(`#p2-${teamId()}`)!.value).toBe('Beat');
  });

  it('drops trailing empty slots', () => {
    render();
    addTeam('T', 'Anna', 'Beat');
    change(`#p2-${teamId()}`, '');
    expect(store.team(teamId())?.players).toEqual(['Anna']);
    change(`#p1-${teamId()}`, '');
    expect(store.team(teamId())?.players).toEqual([]);
  });

  it('ignores player edits for teams that no longer exist', () => {
    render();
    const before = store.tournament();
    fixture.componentInstance['updatePlayer']('ghost', 0, { target: { value: 'x' } } as unknown as Event);
    expect(store.tournament()).toBe(before);
  });

  it('removes teams', () => {
    render();
    addTeam('Weg');
    el.querySelector<HTMLButtonElement>('.team-row button')!.click();
    refresh();
    expect(group().teamIds).toEqual([]);
    expect(el.querySelector('.empty')).not.toBeNull();
  });

  it('skips team ids without a team', () => {
    store['mutate']((t) => ({ ...t, groups: [{ ...t.groups[0], teamIds: ['ghost'] }] }));
    render();
    expect(el.querySelectorAll('.team-row').length).toBe(0);
  });

  it('removes an empty group without asking', () => {
    render();
    el.querySelector<HTMLButtonElement>('.group-head button')!.click();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(store.tournament().groups).toEqual([]);
  });

  it('asks before removing a group with teams', () => {
    render();
    addTeam('T');
    confirmSpy.and.returnValue(false);
    el.querySelector<HTMLButtonElement>('.group-head button')!.click();
    expect(store.tournament().groups.length).toBe(1);
    confirmSpy.and.returnValue(true);
    el.querySelector<HTMLButtonElement>('.group-head button')!.click();
    expect(store.tournament().groups).toEqual([]);
  });
});
