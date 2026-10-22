import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PatchConflict } from '../services/patch';
import { TournamentStore } from '../services/tournament-store';
import { ConflictDialog } from './conflict-dialog';

describe('ConflictDialog', () => {
  let fixture: ComponentFixture<ConflictDialog>;
  let el: HTMLElement;
  const conflicts = signal<PatchConflict[]>([]);
  let store: jasmine.SpyObj<Pick<TournamentStore, 'describeConflict' | 'resolveConflict'>> & {
    conflicts: typeof conflicts;
  };

  beforeEach(() => {
    conflicts.set([]);
    store = Object.assign(jasmine.createSpyObj('TournamentStore', ['describeConflict', 'resolveConflict']), { conflicts });
    store.describeConflict.and.returnValue('Gruppenphase · Gruppe A · Alpha · Runde 1');
    TestBed.configureTestingModule({ providers: [{ provide: TournamentStore, useValue: store }] });
    fixture = TestBed.createComponent(ConflictDialog);
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  function dialog(): HTMLDialogElement {
    return el.querySelector('dialog')!;
  }

  function show(list: PatchConflict[]) {
    conflicts.set(list);
    fixture.detectChanges();
  }

  it('stays closed without conflicts', () => {
    expect(dialog().open).toBeFalse();
  });

  it('shows the first conflict and how many follow', () => {
    show([
      { path: ['groupScores', 'a', 0], mine: 900, theirs: 800 },
      { path: ['name'], mine: 'X', theirs: 'Y' },
      { path: ['x'], mine: 1, theirs: 2 },
    ]);
    expect(dialog().open).toBeTrue();
    expect(el.querySelector('.where')?.textContent).toBe('Gruppenphase · Gruppe A · Alpha · Runde 1');
    expect(el.querySelector('p:not(.where):not(.more)')?.textContent).toContain('800');
    expect(el.querySelector('p:not(.where):not(.more)')?.textContent).toContain('Dein Wert: 900');
    expect(el.querySelector('.more')?.textContent).toContain('Noch 2 weitere Abweichungen.');

    show(conflicts().slice(1));
    expect(el.querySelector('.more')?.textContent).toContain('Noch 1 weitere Abweichung.');
    show(conflicts().slice(1));
    expect(el.querySelector('.more')).toBeNull();
  });

  it('describes empty and structured values', () => {
    show([{ path: ['ko'], mine: undefined, theirs: { hf1: {} } }]);
    expect(el.textContent).toContain('geänderte Daten');
    expect(el.textContent).toContain('Dein Wert: leer');
    show([{ path: ['name'], mine: null, theirs: 'Cup' }]);
    expect(el.textContent).toContain('Cup behalten');
  });

  it('resolves the shown conflict either way', () => {
    const conflict = { path: ['name'], mine: 'X', theirs: 'Y' };
    show([conflict]);
    const [keepMine, keepTheirs] = el.querySelectorAll<HTMLButtonElement>('.actions button');
    keepMine.click();
    expect(store.resolveConflict).toHaveBeenCalledWith(conflict, true);
    keepTheirs.click();
    expect(store.resolveConflict).toHaveBeenCalledWith(conflict, false);
  });

  it('ignores resolve clicks once nothing is left', () => {
    fixture.componentInstance['resolve'](true);
    expect(store.resolveConflict).not.toHaveBeenCalled();
  });

  it('closes when the last conflict is resolved and cannot be dismissed with Escape', () => {
    show([{ path: ['name'], mine: 'X', theirs: 'Y' }]);
    const cancel = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBeTrue();
    show([]);
    expect(dialog().open).toBeFalse();
  });
});
