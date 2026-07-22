import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime } from 'rxjs';
import { TournamentStore } from '../../services/tournament-store';
import { GroupEditor } from './group-editor';

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

  protected readonly metaForm = this.fb.group({
    name: [this.store.tournament().name, [Validators.required, Validators.maxLength(60)]],
    year: [this.store.tournament().year, [Validators.required, Validators.min(2000), Validators.max(2100)]],
    groupRounds: [this.store.tournament().groupRounds, [Validators.required, Validators.min(1), Validators.max(12)]],
    finalRounds: [this.store.tournament().finalRounds, [Validators.required, Validators.min(1), Validators.max(12)]],
    qualifiersPerGroup: [this.store.tournament().qualifiersPerGroup, [Validators.required, Validators.min(1), Validators.max(4)]],
    dropWorst: [this.store.tournament().dropWorst],
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
  }

  protected loadDemo(): void {
    if (confirm('Demo-Daten (Jassturnier 2025) laden? Der aktuelle Stand wird überschrieben.')) {
      this.store.loadDemo();
      this.syncForm();
    }
  }

  protected resetAll(): void {
    if (confirm('Wirklich alles löschen? Gruppen, Teams und Punkte gehen verloren.')) {
      this.store.resetAll();
      this.syncForm();
    }
  }

  protected resetScores(): void {
    if (confirm('Alle Punkte und die Finalrunde löschen, Gruppen und Teams behalten?')) {
      this.store.resetScores();
    }
  }

  private syncForm(): void {
    const t = this.store.tournament();
    this.metaForm.setValue(
      {
        name: t.name,
        year: t.year,
        groupRounds: t.groupRounds,
        finalRounds: t.finalRounds,
        qualifiersPerGroup: t.qualifiersPerGroup,
        dropWorst: t.dropWorst,
      },
      { emitEvent: false },
    );
  }
}
