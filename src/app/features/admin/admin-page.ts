import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMAIL_PATTERN, PaymentSettings, Registration, RegistrationStatus } from '../../models/registration';
import { PresentationStage } from '../../models/tournament';
import { AdminAuth } from '../../services/admin-auth';
import { RegistrationApi } from '../../services/registration-api';
import { TournamentStore } from '../../services/tournament-store';

const EMPTY_SETTINGS: PaymentSettings = {
  recipientName: null,
  bankName: null,
  iban: null,
  referenceNote: null,
  amount: null,
  currency: 'CHF',
  deadline: null,
  message: null,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_BADGE_DAYS = 3;

/** D1 `datetime('now')` is UTC without a zone marker: `YYYY-MM-DD HH:MM:SS`. */
function parseCreatedAt(createdAt: string): Date {
  return new Date(createdAt.replace(' ', 'T') + 'Z');
}

@Component({
  selector: 'app-admin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './admin-page.html',
  styleUrl: './admin-page.scss',
})
export class AdminPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(RegistrationApi);
  protected readonly store = inject(TournamentStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AdminAuth);

  protected readonly loginError = signal<string | null>(null);
  protected readonly loggingIn = signal(false);

  protected readonly registrations = signal<Registration[]>([]);
  protected readonly savingSettings = signal(false);
  protected readonly settingsSaved = signal(false);
  protected readonly settingsError = signal<string | null>(null);
  /** Last failed action on the registrations list (status, delete, copy). */
  protected readonly registrationsError = signal<string | null>(null);
  protected readonly copiedId = signal<number | null>(null);
  protected readonly editingId = signal<number | null>(null);
  protected readonly savingEdit = signal(false);
  protected readonly editError = signal<string | null>(null);

  /** registrationId → name of the group its team was added to. */
  protected readonly groupByRegistration = computed(() => {
    const t = this.store.tournament();
    const map = new Map<number, string>();
    for (const group of t.groups) {
      for (const teamId of group.teamIds) {
        const registrationId = t.teams[teamId]?.registrationId;
        if (registrationId !== undefined) map.set(registrationId, group.name);
      }
    }
    return map;
  });

  protected readonly stats = computed(() => {
    const now = Date.now();
    const all = this.registrations();
    const active = all.filter((r) => r.status !== 'cancelled');
    const within = (days: number) =>
      active.filter((r) => now - parseCreatedAt(r.createdAt).getTime() < days * DAY_MS).length;
    const count = (status: RegistrationStatus) => all.filter((r) => r.status === status).length;
    return {
      active: active.length,
      last24h: within(1),
      last7d: within(7),
      pending: count('pending'),
      contacted: count('contacted'),
      paid: count('paid'),
      cancelled: count('cancelled'),
    };
  });

  protected readonly loginForm = this.fb.group({
    password: ['', [Validators.required]],
  });

  protected readonly editForm = this.fb.group({
    teamName: ['', [Validators.required, Validators.maxLength(80)]],
    p1: ['', [Validators.maxLength(60)]],
    p2: ['', [Validators.maxLength(60)]],
    contactName: ['', [Validators.required, Validators.maxLength(80)]],
    contactEmail: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
    phone: ['', [Validators.maxLength(30)]],
    note: ['', [Validators.maxLength(400)]],
  });

  protected readonly settingsForm = this.fb.group({
    recipientName: [''],
    bankName: [''],
    iban: [''],
    referenceNote: [''],
    amount: [''],
    currency: ['CHF'],
    deadline: [''],
    message: [''],
  });

  constructor() {
    void this.checkSession();
  }

  private async checkSession(): Promise<void> {
    const ok = await this.auth.ensureChecked();
    if (!ok) return;
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrl) {
      void this.router.navigateByUrl(returnUrl);
      return;
    }
    const registrations = await this.api.listRegistrations();
    this.registrations.set(registrations ?? []);
    await this.loadSettings();
  }

  private async loadSettings(): Promise<void> {
    const settings = await this.api.getSettings();
    this.applySettings(settings ?? EMPTY_SETTINGS);
  }

  private applySettings(settings: PaymentSettings): void {
    this.settingsForm.setValue(
      {
        recipientName: settings.recipientName ?? '',
        bankName: settings.bankName ?? '',
        iban: settings.iban ?? '',
        referenceNote: settings.referenceNote ?? '',
        amount: settings.amount ?? '',
        currency: settings.currency || 'CHF',
        deadline: settings.deadline ?? '',
        message: settings.message ?? '',
      },
      { emitEvent: false },
    );
  }

  protected async login(): Promise<void> {
    if (this.loginForm.invalid || this.loggingIn()) return;
    this.loggingIn.set(true);
    this.loginError.set(null);
    const ok = await this.auth.login(this.loginForm.getRawValue().password);
    this.loggingIn.set(false);
    if (!ok) {
      this.loginError.set('Falsches Passwort.');
      return;
    }
    this.loginForm.reset();
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrl) {
      void this.router.navigateByUrl(returnUrl);
      return;
    }
    const registrations = await this.api.listRegistrations();
    this.registrations.set(registrations ?? []);
    await this.loadSettings();
  }

  protected setPresentationStage(stage: PresentationStage): void {
    this.store.updateMeta({ presentationStage: stage });
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    this.registrations.set([]);
  }

  protected async saveSettings(): Promise<void> {
    if (this.savingSettings()) return;
    this.savingSettings.set(true);
    this.settingsSaved.set(false);
    this.settingsError.set(null);
    const value = this.settingsForm.getRawValue();
    try {
      await this.api.saveSettings({
        recipientName: value.recipientName.trim() || null,
        bankName: value.bankName.trim() || null,
        iban: value.iban.trim() || null,
        referenceNote: value.referenceNote.trim() || null,
        amount: value.amount.trim() || null,
        currency: value.currency.trim() || 'CHF',
        deadline: value.deadline.trim() || null,
        message: value.message.trim() || null,
      });
      this.settingsSaved.set(true);
    } catch {
      this.settingsError.set('Zahlungsinformationen konnten nicht gespeichert werden.');
    } finally {
      this.savingSettings.set(false);
    }
  }

  protected async updateStatus(registration: Registration, select: HTMLSelectElement): Promise<void> {
    const next = select.value as RegistrationStatus;
    this.registrationsError.set(null);
    try {
      await this.api.updateStatus(registration.id, next);
    } catch {
      select.value = registration.status; // the [value] binding doesn't change, so reset the control by hand
      this.registrationsError.set(`Status von «${registration.teamName}» konnte nicht gespeichert werden.`);
      return;
    }
    this.registrations.update((list) => list.map((r) => (r.id === registration.id ? { ...r, status: next } : r)));
  }

  protected startEdit(registration: Registration): void {
    this.editForm.setValue({
      teamName: registration.teamName,
      p1: registration.players[0] ?? '',
      p2: registration.players[1] ?? '',
      contactName: registration.contactName,
      contactEmail: registration.contactEmail,
      phone: registration.phone ?? '',
      note: registration.note ?? '',
    });
    this.editError.set(null);
    this.editingId.set(registration.id);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected async saveEdit(registration: Registration): Promise<void> {
    if (this.editForm.invalid || this.savingEdit()) return;
    this.savingEdit.set(true);
    this.editError.set(null);
    const value = this.editForm.getRawValue();
    const players = [value.p1.trim(), value.p2.trim()].filter(Boolean);
    const updated: Registration = {
      ...registration,
      teamName: value.teamName.trim(),
      players,
      contactName: value.contactName.trim(),
      contactEmail: value.contactEmail.trim(),
      phone: value.phone.trim() || null,
      note: value.note.trim() || null,
    };
    try {
      await this.api.editRegistration(registration.id, {
        teamName: updated.teamName,
        players,
        contactName: updated.contactName,
        contactEmail: updated.contactEmail,
        phone: updated.phone ?? undefined,
        note: updated.note ?? undefined,
      });
    } catch {
      this.editError.set('Änderungen konnten nicht gespeichert werden.');
      return;
    } finally {
      this.savingEdit.set(false);
    }
    this.registrations.update((list) => list.map((r) => (r.id === registration.id ? updated : r)));
    // Keep the team already placed in a group in sync with its registration.
    const team = Object.values(this.store.tournament().teams).find((t) => t.registrationId === registration.id);
    if (team) this.store.updateTeam(team.id, { name: updated.teamName, players });
    this.editingId.set(null);
  }

  protected async deleteRegistration(registration: Registration): Promise<void> {
    if (!confirm(`Anmeldung «${registration.teamName}» endgültig löschen?`)) return;
    this.registrationsError.set(null);
    try {
      await this.api.deleteRegistration(registration.id);
    } catch {
      this.registrationsError.set(`«${registration.teamName}» konnte nicht gelöscht werden.`);
      return;
    }
    this.registrations.update((list) => list.filter((r) => r.id !== registration.id));
  }

  protected addToGroup(registration: Registration, groupId: string): void {
    if (!groupId) return;
    this.store.addTeam(groupId, registration.teamName, registration.players, registration.id);
  }

  protected createdAt(registration: Registration): Date {
    return parseCreatedAt(registration.createdAt);
  }

  protected isNew(registration: Registration): boolean {
    return Date.now() - parseCreatedAt(registration.createdAt).getTime() < NEW_BADGE_DAYS * DAY_MS;
  }

  protected emailSubject(registration: Registration): string {
    const t = this.store.tournament();
    return `Zahlungsinformationen – ${registration.teamName} – ${t.name} ${t.year}`;
  }

  protected emailBody(registration: Registration): string {
    const s = this.settingsForm.getRawValue();
    const lines = [
      `Hallo ${registration.contactName}`,
      '',
      `vielen Dank für die Anmeldung von «${registration.teamName}» zum ${this.store.tournament().name} ${this.store.tournament().year}.`,
      '',
    ];
    if (s.amount) lines.push(`Betrag: ${s.amount} ${s.currency}`);
    if (s.deadline) lines.push(`Zahlbar bis: ${s.deadline}`);
    if (s.recipientName) lines.push(`Empfänger: ${s.recipientName}`);
    if (s.bankName) lines.push(`Bank: ${s.bankName}`);
    if (s.iban) lines.push(`IBAN: ${s.iban}`);
    if (s.referenceNote) lines.push(`Referenz: ${s.referenceNote}`);
    if (s.message) lines.push('', s.message);
    lines.push('', 'Sportliche Grüsse');
    return lines.join('\n');
  }

  protected mailtoHref(registration: Registration): string {
    const subject = encodeURIComponent(this.emailSubject(registration));
    const body = encodeURIComponent(this.emailBody(registration));
    return `mailto:${registration.contactEmail}?subject=${subject}&body=${body}`;
  }

  protected async copyEmail(registration: Registration): Promise<void> {
    const text = `${this.emailSubject(registration)}\n\n${this.emailBody(registration)}`;
    this.registrationsError.set(null);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      this.registrationsError.set('Text konnte nicht kopiert werden — bitte «Mail öffnen» verwenden.');
      return;
    }
    this.copiedId.set(registration.id);
    setTimeout(() => this.copiedId.update((id) => (id === registration.id ? null : id)), 2000);
  }

  protected playersLabel(registration: Registration): string {
    return registration.players.join(' · ') || '–';
  }
}
