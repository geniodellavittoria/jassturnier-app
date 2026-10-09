import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { TournamentStore } from '../services/tournament-store';

/**
 * Asks the admin what to do when a value they changed was changed on another
 * device in the meantime (see TournamentStore sync). One conflict at a time.
 */
@Component({
  selector: 'app-conflict-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="conflict" aria-labelledby="conflict-title" (cancel)="$event.preventDefault()">
      @if (conflict(); as c) {
        <h2 id="conflict-title">Wert wurde inzwischen geändert</h2>
        <p class="where">{{ store.describeConflict(c.path) }}</p>
        <p>
          Auf einem anderen Gerät wurde <strong>{{ format(c.theirs) }}</strong> erfasst.
          Dein Wert: <strong>{{ format(c.mine) }}</strong>.
        </p>
        <div class="actions">
          <button type="button" class="btn" (click)="resolve(true)">Meinen Wert übernehmen</button>
          <button type="button" class="btn btn-quiet" (click)="resolve(false)">{{ format(c.theirs) }} behalten</button>
        </div>
        @if (remaining() > 0) {
          <p class="more">Noch {{ remaining() }} weitere Abweichung{{ remaining() === 1 ? '' : 'en' }}.</p>
        }
      }
    </dialog>
  `,
  styles: `
    .conflict {
      max-inline-size: min(30rem, calc(100vw - 2rem));
      padding: 1.4rem 1.5rem;
      color: var(--text);
      background: var(--surface);
      border: 1px solid var(--table-rule-strong);
      border-radius: 0.8rem;
    }
    .conflict::backdrop {
      background: rgba(0, 0, 0, 0.45);
    }
    h2 {
      margin: 0 0 0.4rem;
      font-family: var(--font-display);
      font-size: 1.2rem;
    }
    .where {
      margin: 0 0 0.8rem;
      font-weight: 600;
      color: var(--text-soft);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      margin-block-start: 1rem;
    }
    .more {
      margin: 0.8rem 0 0;
      font-size: 0.85rem;
      color: var(--text-soft);
    }
  `,
})
export class ConflictDialog {
  protected readonly store = inject(TournamentStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly conflict = computed(() => this.store.conflicts()[0] ?? null);
  protected readonly remaining = computed(() => Math.max(0, this.store.conflicts().length - 1));

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.conflict() && !el.open) el.showModal();
      else if (!this.conflict() && el.open) el.close();
    });
  }

  protected resolve(keepMine: boolean): void {
    const c = this.conflict();
    if (c) this.store.resolveConflict(c, keepMine);
  }

  protected format(value: unknown): string {
    if (value === null || value === undefined) return 'leer';
    if (typeof value === 'number' || typeof value === 'string') return String(value);
    return 'geänderte Daten';
  }
}
