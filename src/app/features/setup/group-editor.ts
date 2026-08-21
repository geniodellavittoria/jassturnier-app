import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Group } from '../../models/tournament';
import { TournamentStore } from '../../services/tournament-store';
import { SuitBadge } from '../../shared/suit-badge';

/** Edit one group: name, its teams, and a form to register a new team. */
@Component({
  selector: 'app-group-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, SuitBadge],
  host: { class: 'card' },
  template: `
    <header class="group-head">
      <app-suit-badge [index]="index()" />
      <label class="visually-hidden" [for]="'group-name-' + group().id">Gruppenname</label>
      <input
        class="group-name"
        [id]="'group-name-' + group().id"
        type="text"
        [value]="group().name"
        (change)="rename($event)"
      />
      <button type="button" class="btn btn-quiet" (click)="removeGroup()">Gruppe entfernen</button>
    </header>

    @if (group().teamIds.length === 0) {
      <p class="empty">Noch keine Teams — unten das erste Team eintragen.</p>
    } @else {
      <ul class="team-list">
        @for (teamId of group().teamIds; track teamId) {
          @if (store.team(teamId); as team) {
            <li class="team-row">
              <label class="visually-hidden" [for]="'tn-' + team.id">Teamname</label>
              <input
                [id]="'tn-' + team.id"
                type="text"
                class="team-name"
                [value]="team.name"
                (change)="updateName(team.id, $event)"
              />
              <label class="visually-hidden" [for]="'p1-' + team.id">Erste Spielerin oder Spieler</label>
              <input
                [id]="'p1-' + team.id"
                type="text"
                placeholder="Spieler:in 1"
                [value]="playerValue(team, 0)"
                (change)="updatePlayer(team.id, 0, $event)"
              />
              <label class="visually-hidden" [for]="'p2-' + team.id">Zweite Spielerin oder Spieler</label>
              <input
                [id]="'p2-' + team.id"
                type="text"
                placeholder="Spieler:in 2"
                [value]="playerValue(team, 1)"
                (change)="updatePlayer(team.id, 1, $event)"
              />
              <button type="button" class="btn btn-quiet" (click)="store.removeTeam(team.id)">
                Entfernen<span class="visually-hidden">: {{ team.name }}</span>
              </button>
            </li>
          }
        }
      </ul>
    }

    <form class="add-team" [formGroup]="form" (ngSubmit)="addTeam()">
      <label class="visually-hidden" for="{{ 'add-name-' + group().id }}">Neuer Teamname</label>
      <input
        id="{{ 'add-name-' + group().id }}"
        type="text"
        formControlName="name"
        placeholder="Neues Team"
      />
      <label class="visually-hidden" for="{{ 'add-p1-' + group().id }}">Spieler:in 1</label>
      <input id="{{ 'add-p1-' + group().id }}" type="text" formControlName="p1" placeholder="Spieler:in 1" />
      <label class="visually-hidden" for="{{ 'add-p2-' + group().id }}">Spieler:in 2</label>
      <input id="{{ 'add-p2-' + group().id }}" type="text" formControlName="p2" placeholder="Spieler:in 2" />
      <button type="submit" class="btn" [disabled]="form.invalid">Team hinzufügen</button>
    </form>
  `,
  styles: `
    .group-head {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      margin-block-end: 0.9rem;
      color: var(--brand);
    }
    .group-name {
      flex: 1;
      min-inline-size: 8rem;
      font-family: var(--font-display);
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--text);
    }
    .empty {
      color: var(--text-soft);
      font-size: 0.9rem;
    }
    .team-list {
      margin: 0 0 1rem;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.5rem;
    }
    .team-row,
    .add-team {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr auto;
      gap: 0.5rem;
      align-items: center;
    }
    .add-team {
      padding-block-start: 0.8rem;
      border-block-start: 1px dashed var(--table-rule-strong);
    }
    input {
      padding: 0.6rem 0.6rem;
      font: inherit;
      color: var(--text);
      background: var(--surface);
      border: 1px solid var(--input-border);
      border-radius: 0.45rem;
      min-inline-size: 0;
    }
    input:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }
    @media (max-width: 40rem) {
      .team-row,
      .add-team {
        grid-template-columns: 1fr 1fr;
      }
      .team-row .team-name,
      .add-team input[formControlName='name'] {
        grid-column: 1 / -1;
      }
    }
    @media (max-width: 30rem) {
      .team-row,
      .add-team {
        grid-template-columns: 1fr;
      }
      .team-row .btn-quiet {
        justify-self: start;
      }
    }
  `,
})
export class GroupEditor {
  protected readonly store = inject(TournamentStore);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly group = input.required<Group>();
  readonly index = input.required<number>();

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    p1: [''],
    p2: [''],
  });

  protected readonly teamCount = computed(() => this.group().teamIds.length);

  protected rename(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    if (value) this.store.renameGroup(this.group().id, value);
  }

  protected removeGroup(): void {
    if (this.teamCount() === 0 || confirm(`«${this.group().name}» samt Teams und Punkten entfernen?`)) {
      this.store.removeGroup(this.group().id);
    }
  }

  protected updateName(teamId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    if (value) this.store.updateTeam(teamId, { name: value });
  }

  protected playerValue(team: { players: string[] }, slot: number): string {
    return team.players[slot] ?? '';
  }

  protected updatePlayer(teamId: string, slot: 0 | 1, event: Event): void {
    const team = this.store.team(teamId);
    if (!team) return;
    const players = [...team.players];
    players[slot] = (event.target as HTMLInputElement).value.trim();
    this.store.updateTeam(teamId, { players: players.filter((p, i) => p.length > 0 || i < 2) });
  }

  protected addTeam(): void {
    if (this.form.invalid) return;
    const { name, p1, p2 } = this.form.getRawValue();
    this.store.addTeam(this.group().id, name.trim(), [p1.trim(), p2.trim()]);
    this.form.reset();
  }
}
