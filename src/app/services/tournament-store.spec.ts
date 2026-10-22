import { discardPeriodicTasks, fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { clearStoredTournament, createFakeApi, FakeApi, provideFakeApi } from '../../testing/fake-api';
import { emptyTournament, Tournament } from '../models/tournament';
import { demoTournament2025 } from './demo-2025';
import { PatchConflict } from './patch';
import { TournamentStore } from './tournament-store';

const STORAGE_KEY = 'jassturnier-state-v1';

function createStore(api: FakeApi = createFakeApi()): TournamentStore {
  TestBed.configureTestingModule({ providers: [provideFakeApi(api)] });
  const store = TestBed.inject(TournamentStore);
  flushMicrotasks(); // initial pull
  return store;
}

/** Store tests run in fakeAsync because the store polls the server on an interval. */
function storeTest(fn: () => void): () => void {
  return fakeAsync(() => {
    fn();
    discardPeriodicTasks();
  });
}

function tournament(patch: Partial<Tournament> = {}): Tournament {
  return { ...emptyTournament(), name: 'Server', year: 2026, ...patch };
}

describe('TournamentStore', () => {
  beforeEach(clearStoredTournament);
  afterEach(clearStoredTournament);

  describe('persistence', () => {
    it(
      'starts empty without stored state',
      storeTest(() => {
        const store = createStore();
        expect(store.tournament()).toEqual(emptyTournament());
      }),
    );

    it(
      'restores stored state, filling in fields older versions lacked',
      storeTest(() => {
        const { presentationStage, ...old } = tournament({ name: 'Gespeichert' });
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...old, ko: { hf1: old.ko.hf1 } }));
        const store = createStore();
        expect(store.tournament().name).toBe('Gespeichert');
        expect(store.tournament().presentationStage).toBe(presentationStage);
        expect(Object.keys(store.tournament().ko)).toEqual(['hf1', 'hf2', 'kleinerFinal', 'final']);
      }),
    );

    for (const [label, raw] of [
      ['corrupt JSON', '{nope'],
      ['a non-tournament object', '{"name":"x"}'],
      ['groups without teams', '{"groups":[]}'],
      ['a primitive', '42'],
    ]) {
      it(
        `ignores ${label}`,
        storeTest(() => {
          localStorage.setItem(STORAGE_KEY, raw);
          expect(createStore().tournament()).toEqual(emptyTournament());
        }),
      );
    }

    it(
      'saves every change to localStorage',
      storeTest(() => {
        const store = createStore();
        store.updateMeta({ name: 'Neu' });
        TestBed.tick();
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).name).toBe('Neu');
      }),
    );

    it(
      'keeps working when localStorage is unavailable',
      storeTest(() => {
        spyOn(localStorage, 'getItem').and.throwError('denied');
        spyOn(localStorage, 'setItem').and.throwError('quota');
        const store = createStore();
        store.updateMeta({ name: 'Neu' });
        expect(() => TestBed.tick()).not.toThrow();
        expect(store.tournament().name).toBe('Neu');
      }),
    );
  });

  describe('server sync', () => {
    let api: FakeApi;

    beforeEach(() => {
      api = createFakeApi();
      api.patchTournament.and.callFake(async (ops) => ({ tournament: null, version: 0, conflicts: [], ops }));
    });

    it(
      'takes the server copy on first contact, over local state',
      storeTest(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament({ name: 'Lokal' })));
        api.getTournament.and.resolveTo({ tournament: tournament(), version: 3 });
        const store = createStore(api);
        expect(store.tournament().name).toBe('Server');
        tick(1000);
        expect(api.patchTournament).not.toHaveBeenCalled();
      }),
    );

    it(
      'uploads local state when the server has none yet',
      storeTest(() => {
        const local = tournament({ name: 'Lokal' });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
        api.getTournament.and.resolveTo({ tournament: null, version: 0 });
        api.patchTournament.and.resolveTo({ tournament: local, version: 1, conflicts: [] });
        const store = createStore(api);
        tick(600);
        expect(api.patchTournament).toHaveBeenCalledOnceWith([{ path: [], prev: null, value: local }]);
        flushMicrotasks();
        expect(store.tournament()).toEqual(local);
      }),
    );

    it(
      'does not send edits before the first successful pull',
      storeTest(() => {
        const store = createStore(api); // getTournament → null (offline)
        store.updateMeta({ name: 'Offline' });
        tick(600);
        expect(api.patchTournament).not.toHaveBeenCalled();
        expect(store.tournament().name).toBe('Offline');
      }),
    );

    it(
      'polls every 5 seconds while the page is visible',
      storeTest(() => {
        const visibility = spyOnProperty(document, 'visibilityState').and.returnValue('visible');
        createStore(api);
        expect(api.getTournament).toHaveBeenCalledTimes(1);
        tick(5000);
        expect(api.getTournament).toHaveBeenCalledTimes(2);
        visibility.and.returnValue('hidden');
        tick(5000);
        expect(api.getTournament).toHaveBeenCalledTimes(2);
      }),
    );

    it(
      'applies newer server versions and keeps unsent local edits on top',
      storeTest(() => {
        spyOnProperty(document, 'visibilityState').and.returnValue('visible');
        api.getTournament.and.resolveTo({ tournament: tournament(), version: 1 });
        const store = createStore(api);
        api.patchTournament.and.rejectWith(new Error('offline'));
        store.updateMeta({ year: 2030 });

        api.getTournament.and.resolveTo({ tournament: tournament({ name: 'Anderes Gerät' }), version: 2 });
        tick(5000);
        expect(store.tournament().name).toBe('Anderes Gerät');
        expect(store.tournament().year).toBe(2030);
      }),
    );

    it(
      'ignores a pull that brings no newer version',
      storeTest(() => {
        spyOnProperty(document, 'visibilityState').and.returnValue('visible');
        api.getTournament.and.resolveTo({ tournament: tournament(), version: 2 });
        const store = createStore(api);
        api.getTournament.and.resolveTo({ tournament: tournament({ name: 'Alt' }), version: 2 });
        tick(5000);
        expect(store.tournament().name).toBe('Server');
      }),
    );

    it(
      'keeps local state when a newer server copy is unreadable',
      storeTest(() => {
        spyOnProperty(document, 'visibilityState').and.returnValue('visible');
        api.getTournament.and.resolveTo({ tournament: tournament(), version: 1 });
        const store = createStore(api);
        api.getTournament.and.resolveTo({ tournament: 'garbage', version: 2 });
        tick(5000);
        expect(store.tournament().name).toBe('Server');
      }),
    );

    it(
      'never runs two syncs at once',
      storeTest(() => {
        spyOnProperty(document, 'visibilityState').and.returnValue('visible');
        let answer!: (value: { tournament: unknown; version: number }) => void;
        api.getTournament.and.returnValue(new Promise((resolve) => (answer = resolve)));
        const store = createStore(api);
        tick(5000); // second pull while the first is still in flight
        expect(api.getTournament).toHaveBeenCalledTimes(1);

        store.updateMeta({ name: 'Edit' });
        answer({ tournament: tournament(), version: 1 });
        flushMicrotasks();
        // The first-contact pull replaced local state; nothing left to flush.
        tick(600);
        expect(api.patchTournament).not.toHaveBeenCalled();
      }),
    );

    it(
      'sends only the changed values and adopts the server answer',
      storeTest(() => {
        const base = tournament();
        api.getTournament.and.resolveTo({ tournament: base, version: 1 });
        const store = createStore(api);
        api.patchTournament.and.resolveTo({ tournament: { ...base, name: 'Neu', year: 1999 }, version: 2, conflicts: [] });

        store.updateMeta({ name: 'Neu' });
        tick(600);
        expect(api.patchTournament).toHaveBeenCalledOnceWith([{ path: ['name'], prev: 'Server', value: 'Neu' }]);
        flushMicrotasks();
        expect(store.tournament().year).toBe(1999);
      }),
    );

    it(
      'debounces quick edits into one request',
      storeTest(() => {
        api.getTournament.and.resolveTo({ tournament: tournament(), version: 1 });
        const store = createStore(api);
        api.patchTournament.and.returnValue(new Promise(() => {}));
        store.updateMeta({ name: 'A' });
        tick(300);
        store.updateMeta({ name: 'AB' });
        tick(600);
        expect(api.patchTournament).toHaveBeenCalledOnceWith([{ path: ['name'], prev: 'Server', value: 'AB' }]);
      }),
    );

    it(
      'keeps edits made while a request is in flight',
      storeTest(() => {
        const base = tournament();
        api.getTournament.and.resolveTo({ tournament: base, version: 1 });
        const store = createStore(api);
        let answer!: (value: { tournament: unknown; version: number; conflicts: PatchConflict[] }) => void;
        api.patchTournament.and.returnValue(new Promise((resolve) => (answer = resolve)));

        store.updateMeta({ name: 'Erst' });
        tick(600);
        store.updateMeta({ year: 2031 });
        tick(600); // flush skipped: a request is in flight
        expect(api.patchTournament).toHaveBeenCalledTimes(1);

        answer({ tournament: { ...base, name: 'Erst' }, version: 2, conflicts: [] });
        flushMicrotasks();
        expect(store.tournament().name).toBe('Erst');
        expect(store.tournament().year).toBe(2031);
      }),
    );

    it(
      'does nothing when a flush finds no changes',
      storeTest(() => {
        api.getTournament.and.resolveTo({ tournament: tournament(), version: 1 });
        const store = createStore(api);
        store.updateMeta({ name: 'Server' });
        tick(600);
        expect(api.patchTournament).not.toHaveBeenCalled();
      }),
    );

    it(
      'keeps edits pending when sending fails and retries on the next pull',
      storeTest(() => {
        spyOnProperty(document, 'visibilityState').and.returnValue('visible');
        api.getTournament.and.resolveTo({ tournament: tournament(), version: 1 });
        const store = createStore(api);
        api.patchTournament.and.rejectWith(new Error('401'));
        store.updateMeta({ name: 'Später' });
        tick(600);
        flushMicrotasks();
        expect(store.tournament().name).toBe('Später');

        api.patchTournament.and.resolveTo({ tournament: tournament({ name: 'Später' }), version: 2, conflicts: [] });
        tick(5000 - 600); // next poll
        tick(600); // debounced flush
        expect(api.patchTournament).toHaveBeenCalledTimes(2);
      }),
    );

    it(
      'keeps local state when the server answers with an unreadable tournament',
      storeTest(() => {
        api.getTournament.and.resolveTo({ tournament: tournament(), version: 1 });
        const store = createStore(api);
        api.patchTournament.and.resolveTo({ tournament: null, version: 2, conflicts: [] });
        store.updateMeta({ name: 'Mine' });
        tick(600);
        flushMicrotasks();
        expect(store.tournament().name).toBe('Mine');
      }),
    );

    describe('conflicts', () => {
      const conflict: PatchConflict = { path: ['groupScores', 't1', 0], mine: 900, theirs: 800 };

      function storeWithConflict(): TournamentStore {
        const base = tournament({ groupScores: { t1: [null] } });
        api.getTournament.and.resolveTo({ tournament: base, version: 1 });
        const store = createStore(api);
        api.patchTournament.and.resolveTo({
          tournament: { ...base, groupScores: { t1: [800] } },
          version: 2,
          conflicts: [conflict],
        });
        store.setGroupScore('t1', 0, 900);
        tick(600);
        flushMicrotasks();
        return store;
      }

      it(
        'collects conflicts and shows the server value meanwhile',
        storeTest(() => {
          const store = storeWithConflict();
          expect(store.conflicts()).toEqual([conflict]);
          expect(store.tournament().groupScores['t1']).toEqual([800]);
        }),
      );

      it(
        'accepting the server value just dismisses the conflict',
        storeTest(() => {
          const store = storeWithConflict();
          store.resolveConflict(store.conflicts()[0], false);
          expect(store.conflicts()).toEqual([]);
          expect(store.tournament().groupScores['t1']).toEqual([800]);
        }),
      );

      it(
        'keeping my value writes it again',
        storeTest(() => {
          const store = storeWithConflict();
          store.resolveConflict(store.conflicts()[0], true);
          expect(store.tournament().groupScores['t1']).toEqual([900]);
        }),
      );

      it(
        'keeping my deletion deletes the value again',
        storeTest(() => {
          const store = createStore(api);
          store.updateMeta({ name: 'X' });
          store.resolveConflict({ path: ['name'], mine: undefined, theirs: 'X' }, true);
          expect('name' in store.tournament()).toBeFalse();
        }),
      );
    });
  });

  describe('describeConflict', () => {
    let store: TournamentStore;

    beforeEach(fakeAsync(() => {
      store = createStore();
      store.loadDemo();
      discardPeriodicTasks();
    }));

    it('names group and final score cells', () => {
      expect(store.describeConflict(['groupScores', 't-a1', 2])).toBe(
        'Gruppenphase · Gruppe A · s Znacht esch s Ziel · Runde 3',
      );
      expect(store.describeConflict(['finalScores', 't-a4', 0])).toBe('Finalrunde · Finalgruppe 1 · Schällejäger · Runde 1');
    });

    it('falls back when the team is gone', () => {
      expect(store.describeConflict(['groupScores', 'gone', 0])).toBe('Gruppenphase · Team · Runde 1');
    });

    it('names KO points', () => {
      expect(store.describeConflict(['ko', 'hf1', 'pointsA'])).toBe('KO · Halbfinal 1 · Nor do för de meter');
      expect(store.describeConflict(['ko', 'final', 'pointsB'])).toBe('KO · Final · Jhonnys');
      expect(store.describeConflict(['ko', 'quarter', 'pointsA'])).toBe('KO · quarter');
    });

    it('describes anything else as setup data', () => {
      expect(store.describeConflict(['name'])).toBe('Turnierdaten (Einrichtung)');
      expect(store.describeConflict(['groupScores', 't-a1'])).toBe('Turnierdaten (Einrichtung)');
      expect(store.describeConflict(['ko', 'hf1', 'teamA'])).toBe('Turnierdaten (Einrichtung)');
    });
  });

  describe('match helpers', () => {
    it(
      'team() looks up teams by id',
      storeTest(() => {
        const store = createStore();
        store.loadDemo();
        expect(store.team('t-a1')?.name).toBe('s Znacht esch s Ziel');
        expect(store.team('nope')).toBeNull();
        expect(store.team(null)).toBeNull();
      }),
    );

    it(
      'winnerOf / loserOf need two different scores',
      storeTest(() => {
        const store = createStore();
        const match = (pointsA: number | null, pointsB: number | null) => ({ teamA: 'a', teamB: 'b', pointsA, pointsB });
        expect(store.winnerOf(match(null, 5))).toBeNull();
        expect(store.winnerOf(match(5, null))).toBeNull();
        expect(store.winnerOf(match(5, 5))).toBeNull();
        expect(store.winnerOf(match(6, 5))).toBe('a');
        expect(store.winnerOf(match(5, 6))).toBe('b');
        expect(store.loserOf(match(null, 5))).toBeNull();
        expect(store.loserOf(match(5, null))).toBeNull();
        expect(store.loserOf(match(5, 5))).toBeNull();
        expect(store.loserOf(match(6, 5))).toBe('b');
        expect(store.loserOf(match(5, 6))).toBe('a');
      }),
    );
  });

  describe('setup', () => {
    let store: TournamentStore;

    beforeEach(fakeAsync(() => {
      store = createStore();
      discardPeriodicTasks();
    }));

    it('updates meta fields', () => {
      store.updateMeta({ name: 'Cup', dropWorst: false });
      expect(store.tournament().name).toBe('Cup');
      expect(store.tournament().dropWorst).toBeFalse();
    });

    it('names a new group after the first free letter', () => {
      store.addGroup();
      store.addGroup();
      store.addGroup();
      store.removeGroup(store.tournament().groups[1].id);
      store.addGroup();
      expect(store.tournament().groups.map((g) => g.name)).toEqual(['Gruppe A', 'Gruppe C', 'Gruppe B']);
    });

    it('removes a team from the Finalrunde and the KO phase too', () => {
      store.loadDemo();
      store.removeTeam('t-c2'); // Nor do för de meter: Finalgruppe 2, hf1 A, final A
      const t = store.tournament();
      expect(t.finalGroups[1].teamIds).not.toContain('t-c2');
      expect(t.finalScores['t-c2']).toBeUndefined();
      expect(t.ko.hf1).toEqual({ teamA: null, teamB: 't-f3', pointsA: null, pointsB: 605 });
      expect(t.ko.final.teamA).toBeNull();
      expect(t.ko.final.teamB).toBe('t-d1');
    });

    it('removes a whole group from the Finalrunde and the KO phase too', () => {
      store.loadDemo();
      store.removeGroup('g-d'); // includes Jhonnys (t-d1): hf2 B, final B
      const t = store.tournament();
      expect(t.finalGroups[0].teamIds).not.toContain('t-d1');
      expect(t.ko.hf2.teamB).toBeNull();
      expect(t.ko.final.teamB).toBeNull();
      expect(t.ko.final.teamA).toBe('t-c2');
    });

    it('adds lettered groups, renames and removes them', () => {
      store.addGroup();
      store.addGroup();
      const [a, b] = store.tournament().groups;
      expect([a.name, b.name]).toEqual(['Gruppe A', 'Gruppe B']);
      expect(a.id).toMatch(/^g-/);

      store.renameGroup(b.id, 'Tisch Ost');
      expect(store.tournament().groups.map((g) => g.name)).toEqual(['Gruppe A', 'Tisch Ost']);

      store.addTeam(a.id, 'Team 1', []);
      const teamId = store.tournament().groups[0].teamIds[0];
      store.removeGroup(a.id);
      expect(store.tournament().groups.map((g) => g.name)).toEqual(['Tisch Ost']);
      expect(store.tournament().teams[teamId]).toBeUndefined();
      expect(store.tournament().groupScores[teamId]).toBeUndefined();
    });

    it('ignores removing an unknown group', () => {
      store.addGroup();
      const before = store.tournament();
      store.removeGroup('nope');
      expect(store.tournament()).toBe(before);
    });

    it('adds, updates and removes teams', () => {
      store.addGroup();
      store.addGroup();
      const [a, b] = store.tournament().groups;
      store.addTeam(a.id, 'Bock-Stars', ['Anna', ' ', 'Beat'], 7);
      const id = store.tournament().groups[0].teamIds[0];
      expect(store.tournament().teams[id]).toEqual({ id, name: 'Bock-Stars', players: ['Anna', 'Beat'], registrationId: 7 });
      expect(store.tournament().groupScores[id]).toEqual([null, null, null, null, null]);
      expect(store.tournament().groups[1].teamIds).toEqual([]);

      store.updateTeam(id, { name: 'Bock-Stars II' });
      expect(store.team(id)?.name).toBe('Bock-Stars II');
      const before = store.tournament();
      store.updateTeam('nope', { name: 'x' });
      expect(store.tournament()).toBe(before);

      store.removeTeam(id);
      expect(store.team(id)).toBeNull();
      expect(store.tournament().groups.find((g) => g.id === a.id)?.teamIds).toEqual([]);
      expect(store.tournament().groups.find((g) => g.id === b.id)?.teamIds).toEqual([]);
    });

    it('loads the demo, resets scores and resets everything', () => {
      store.loadDemo();
      expect(store.tournament().name).toBe('Jassturnier 2025');

      store.resetScores();
      const t = store.tournament();
      expect(Object.keys(t.groupScores).length).toBe(36);
      expect(Object.values(t.groupScores).every((r) => r.length === 5 && r.every((v) => v === null))).toBeTrue();
      expect(t.finalGroups).toEqual([]);
      expect(t.finalScores).toEqual({});
      expect(t.ko.hf1.teamA).toBeNull();
      expect(t.groups.length).toBe(6);

      store.resetAll();
      expect(store.tournament()).toEqual(emptyTournament());
    });
  });

  describe('scores', () => {
    let store: TournamentStore;

    beforeEach(fakeAsync(() => {
      store = createStore();
      discardPeriodicTasks();
    }));

    it('sets group scores, padding missing rounds', () => {
      store.setGroupScore('x', 2, 800);
      expect(store.tournament().groupScores['x']).toEqual([null, null, 800, null, null]);
      store.updateMeta({ groupRounds: 6 });
      store.setGroupScore('x', 0, 700);
      expect(store.tournament().groupScores['x']).toEqual([700, null, 800, null, null, null]);
    });

    it('sets final scores, padding missing rounds', () => {
      store.setFinalScore('x', 1, 600);
      expect(store.tournament().finalScores['x']).toEqual([null, 600, null]);
      store.updateMeta({ finalRounds: 4 });
      store.setFinalScore('x', 1, null);
      expect(store.tournament().finalScores['x']).toEqual([null, null, null, null]);
    });

    it('computes standings and schedules per group', () => {
      store.loadDemo();
      const [a] = store.groupViews();
      expect(a.group.name).toBe('Gruppe A');
      expect(a.standings.map((e) => e.team.name)).toEqual([
        'Schällejäger',
        'Bier im Glas, Ass im Ärmel',
        's Znacht esch s Ziel',
        "D'Schieber",
        'Portberger/Sollmann', // 3622 after dropping 647 …
        'Magröndlis', // … beats 3621 after dropping 721
      ]);
      expect(a.schedule.length).toBe(5);

      const [fg1] = store.finalGroupViews();
      expect(fg1.standings[0].team.name).toBe('Jhonnys');
      expect(fg1.standings[0].droppedRound).toBeNull();
    });

    it('knows when the stages are complete', () => {
      expect(store.groupPhaseComplete()).toBeFalse();
      expect(store.finalGroupsComplete()).toBeFalse();
      store.loadDemo();
      expect(store.groupPhaseComplete()).toBeTrue();
      expect(store.finalGroupsComplete()).toBeTrue();
      store.setGroupScore('t-a1', 0, null);
      store.setFinalScore('t-a4', 0, null);
      expect(store.groupPhaseComplete()).toBeFalse();
      expect(store.finalGroupsComplete()).toBeFalse();
    });
  });

  describe('Finalrunde and KO', () => {
    let store: TournamentStore;

    beforeEach(fakeAsync(() => {
      store = createStore();
      discardPeriodicTasks();
    }));

    it('draws group winners and runners-up serpentine into groups of four', () => {
      store.loadDemo();
      store.drawFinalGroups();
      const t = store.tournament();
      const names = (ids: string[]) => ids.map((id) => t.teams[id].name);
      // Winners A–F go to groups 1,2,3,1,2,3; runners-up A–F would go to 3,2,1,3,2,1, but B's and
      // E's runner-up would meet their own group winner again — they swap places with A's and D's.
      expect(t.finalGroups.map((g) => g.name)).toEqual(['Finalgruppe 1', 'Finalgruppe 2', 'Finalgruppe 3']);
      expect(t.finalGroups.map((g) => g.teamIds)).toEqual([
        ['t-a4', 't-d1', 't-e5', 't-f3'],
        ['t-b1', 't-e1', 't-a5', 't-c1'],
        ['t-c2', 't-f6', 't-b4', 't-d6'],
      ]);
      expect(names(t.finalGroups[0].teamIds)).toEqual(['Schällejäger', 'Jhonnys', 'Kochi', 'Schoggistängeli & Schnäpsli']);
      for (const g of t.finalGroups) {
        const origins = g.teamIds.map((id) => t.groups.findIndex((group) => group.teamIds.includes(id)));
        expect(new Set(origins).size).withContext(g.name).toBe(4);
      }
      expect(t.finalGroups.every((g) => g.teamIds.length === 4)).toBeTrue();
      expect(Object.values(t.finalScores).every((r) => r.length === 3 && r.every((v) => v === null))).toBeTrue();
      expect(t.ko.hf1.teamA).toBeNull();
    });

    it('puts teams of the same group together only when it cannot be avoided', () => {
      store.addGroup();
      store.addGroup();
      const [a, b] = store.tournament().groups;
      for (const [group, prefix] of [
        [a, 'A'],
        [b, 'B'],
      ] as const) {
        for (const n of [1, 2]) store.addTeam(group.id, `${prefix}${n}`, []);
      }
      store.drawFinalGroups();
      const [only] = store.tournament().finalGroups;
      expect(only.teamIds.map((id) => store.team(id)!.name).sort()).toEqual(['A1', 'A2', 'B1', 'B2']);
    });

    it('draws one final group even without any teams', () => {
      store.addGroup();
      store.drawFinalGroups();
      expect(store.tournament().finalGroups).toEqual([{ id: 'fg-1', name: 'Finalgruppe 1', teamIds: [] }]);
    });

    it('seeds three group winners plus the best runner-up (2025 mode)', () => {
      store.loadDemo();
      store.seedSemifinals();
      const { ko } = store.tournament();
      const name = (id: string | null) => store.team(id)?.name;
      expect([name(ko.hf1.teamA), name(ko.hf1.teamB)]).toEqual(['Nor do för de meter', 'Schoggistängeli & Schnäpsli']);
      expect([name(ko.hf2.teamA), name(ko.hf2.teamB)]).toEqual(['Jhonnys', 'Rainer Wahnsinn']);
      expect(ko.hf1.pointsA).toBeNull();
      expect(ko.final).toEqual({ teamA: null, teamB: null, pointsA: null, pointsB: null });
    });

    function finalGroups(count: number, perGroup: number): void {
      store.loadDemo();
      const ids = Object.keys(store.tournament().teams);
      const groups = Array.from({ length: count }, (_, g) => ({
        id: `fg-${g + 1}`,
        name: `Finalgruppe ${g + 1}`,
        teamIds: ids.slice(g * perGroup, (g + 1) * perGroup),
      }));
      // Each team's points = 1000 − its index, so earlier teams rank higher.
      const finalScores = Object.fromEntries(ids.map((id, i) => [id, [1000 - i, 0, 0]]));
      store['mutate']((t) => ({ ...t, finalGroups: groups, finalScores }));
    }

    it('seeds two groups crosswise: W1–R2, W2–R1', () => {
      finalGroups(2, 4);
      store.seedSemifinals();
      const { hf1, hf2 } = store.tournament().ko;
      const [w1, r1] = store.finalGroupViews()[0].standings.map((e) => e.team.id);
      const [w2, r2] = store.finalGroupViews()[1].standings.map((e) => e.team.id);
      expect([hf1.teamA, hf1.teamB, hf2.teamA, hf2.teamB]).toEqual([w1, r2, w2, r1]);
    });

    it('seeds the four best winners with four or more groups', () => {
      finalGroups(5, 2);
      store.seedSemifinals();
      const winners = store.finalGroupViews().map((v) => v.standings[0].team.id);
      const { hf1, hf2 } = store.tournament().ko;
      expect([hf1.teamA, hf1.teamB, hf2.teamA, hf2.teamB]).toEqual([winners[0], winners[3], winners[1], winners[2]]);
    });

    it('seeds the top four of a single final group: 1–4, 2–3', () => {
      finalGroups(1, 4);
      expect(store.seedSemifinals()).toBeTrue();
      const ranked = store.finalGroupViews()[0].standings.map((e) => e.team.id);
      const { hf1, hf2 } = store.tournament().ko;
      expect([hf1.teamA, hf1.teamB, hf2.teamA, hf2.teamB]).toEqual([ranked[0], ranked[3], ranked[1], ranked[2]]);
    });

    it('does not seed with fewer than four finalists', () => {
      finalGroups(1, 3);
      const before = store.tournament();
      expect(store.seedSemifinals()).toBeFalse();
      expect(store.tournament()).toBe(before);
      store['mutate']((t) => ({ ...t, finalGroups: [] }));
      expect(store.seedSemifinals()).toBeFalse();
    });

    it('moves semifinal winners to the final and losers to the kleiner Final', () => {
      store.loadDemo();
      store.seedSemifinals();
      store.setKoPoints('hf1', 'A', 700);
      store.setKoPoints('hf1', 'B', 556);
      store.setKoPoints('hf2', 'B', 700);
      store.setKoPoints('hf2', 'A', 556);
      const { ko } = store.tournament();
      expect([ko.final.teamA, ko.final.teamB]).toEqual([ko.hf1.teamA, ko.hf2.teamB]);
      expect([ko.kleinerFinal.teamA, ko.kleinerFinal.teamB]).toEqual([ko.hf1.teamB, ko.hf2.teamA]);
    });

    it('voids Final and kleiner Final points when a corrected Halbfinal changes who plays', () => {
      store.loadDemo();
      store.setKoPoints('final', 'A', 700);
      store.setKoPoints('final', 'B', 556);
      store.setKoPoints('kleinerFinal', 'A', 600);
      store.setKoPoints('kleinerFinal', 'B', 656);

      store.setKoPoints('hf2', 'A', 688); // hf2 now a draw: no winner yet
      store.setKoPoints('hf2', 'A', 700); // Rainer Wahnsinn wins hf2 instead of Jhonnys
      const { ko } = store.tournament();
      expect(ko.final).toEqual({ teamA: 't-c2', teamB: 't-c1', pointsA: null, pointsB: null });
      expect(ko.kleinerFinal).toEqual({ teamA: 't-f3', teamB: 't-d1', pointsA: null, pointsB: null });
    });

    it('keeps Final points when a Halbfinal correction keeps the same teams', () => {
      store.loadDemo();
      store.setKoPoints('final', 'A', 700);
      store.setKoPoints('hf1', 'A', 660);
      expect(store.tournament().ko.final.pointsA).toBe(700);
    });

    it('crowns the final winner', () => {
      store.loadDemo();
      expect(store.champion()).toBeNull();
      store.setKoPoints('final', 'A', 700);
      store.setKoPoints('final', 'B', 556);
      expect(store.champion()?.name).toBe('Nor do för de meter');
      expect(store.tournament().ko.hf1.pointsA).toBe(651); // finals don't touch the semis
    });

    it('has no champion when the winner is not a known team', () => {
      store.setKoTeam('final', 'A', 'ghost');
      store.setKoTeam('final', 'B', 'other');
      store.setKoPoints('final', 'A', 700);
      store.setKoPoints('final', 'B', 556);
      expect(store.tournament().ko.final.teamA).toBe('ghost');
      expect(store.champion()).toBeNull();
    });
  });
});
