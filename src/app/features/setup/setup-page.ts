import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime } from 'rxjs';
import { Tournament } from '../../models/tournament';
import { TournamentStore } from '../../services/tournament-store';
import { GroupEditor } from './group-editor';

const META_KEYS = ['name', 'year', 'groupRounds', 'finalRounds', 'qualifiersPerGroup', 'dropWorst'] as const;
type Meta = Pick<Tournament, (typeof META_KEYS)[number]>;

function pickMeta(t: Tournament): Meta {
  return Object.fromEntries(META_KEYS.map((key) => [key, t[key]])) as Meta;
}

@Component({
  selector: 'app-setup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, GroupEditor],
  templateUrl: './setup-page.html',
  styleUrl: './setup-page.scss',
})
export class SetupPage {
  protected readonly store = inject(TournamentStore);
  private readonly fb = inject(NonNullableFormBuilder);

  /** The store's rules — only changes when a rule does, not on every score. */
  private readonly meta = computed(() => pickMeta(this.store.tournament()), {
    equal: (a, b) => META_KEYS.every((key) => a[key] === b[key]),
  });

  protected readonly metaForm = this.fb.group({
    name: [this.meta().name, [Validators.required, Validators.maxLength(60)]],
    year: [this.meta().year, [Validators.required, Validators.min(2000), Validators.max(2100)]],
    groupRounds: [this.meta().groupRounds, [Validators.required, Validators.min(1), Validators.max(12)]],
    finalRounds: [this.meta().finalRounds, [Validators.required, Validators.min(1), Validators.max(12)]],
    qualifiersPerGroup: [this.meta().qualifiersPerGroup, [Validators.required, Validators.min(1), Validators.max(4)]],
    dropWorst: [this.meta().dropWorst],
  });

  constructor() {
    this.metaForm.valueChanges.pipe(debounceTime(250), takeUntilDestroyed()).subscribe(() => {
      if (this.metaForm.invalid) return;
      const value = this.metaForm.getRawValue();
      this.store.updateMeta({
        name: value.name.trim() || 'Jassturnier',
        year: value.year,
        groupRounds: value.groupRounds,
        finalRounds: value.finalRounds,
        qualifiersPerGroup: value.qualifiersPerGroup,
        dropWorst: value.dropWorst,
      });
    });

    // Rules can change after the page opened — the server copy arrives, another
    // admin edits them, the demo is loaded. Copy only the rules that changed in
    // the store (and differ from the form), so fields being edited stay as typed.
    let previous = this.meta();
    effect(() => {
      const meta = this.meta();
      const form = this.metaForm.getRawValue();
      const formValue = (key: keyof Meta) => (key === 'name' ? form.name.trim() || 'Jassturnier' : form[key]);
      const changed = META_KEYS.filter((key) => meta[key] !== previous[key] && formValue(key) !== meta[key]);
      previous = meta;
      if (changed.length > 0) {
        this.metaForm.patchValue(Object.fromEntries(changed.map((key) => [key, meta[key]])), { emitEvent: false });
      }
    });
  }

  protected loadDemo(): void {
    if (confirm('Demo-Daten (Jassturnier 2025) laden? Der aktuelle Stand wird überschrieben.')) {
      this.store.loadDemo();
    }
  }

  protected resetAll(): void {
    if (confirm('Wirklich alles löschen? Gruppen, Teams und Punkte gehen verloren.')) {
      this.store.resetAll();
    }
  }

  protected resetScores(): void {
    if (confirm('Alle Punkte und die Finalrunde löschen, Gruppen und Teams behalten?')) {
      this.store.resetScores();
    }
  }
}
