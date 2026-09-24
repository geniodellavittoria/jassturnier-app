import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PaymentSettings, Registration, RegistrationStatus } from '../../models/registration';
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
  protected readonly copiedId = signal<number | null>(null);

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
    const value = this.settingsForm.getRawValue();
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
    this.savingSettings.set(false);
    this.settingsSaved.set(true);
  }

  protected async updateStatus(registration: Registration, status: string): Promise<void> {
    const next = status as RegistrationStatus;
    await this.api.updateStatus(registration.id, next);
    this.registrations.update((list) => list.map((r) => (r.id === registration.id ? { ...r, status: next } : r)));
  }

  protected async deleteRegistration(registration: Registration): Promise<void> {
    if (!confirm(`Anmeldung «${registration.teamName}» endgültig löschen?`)) return;
    await this.api.deleteRegistration(registration.id);
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
    await navigator.clipboard.writeText(text);
    this.copiedId.set(registration.id);
    setTimeout(() => this.copiedId.update((id) => (id === registration.id ? null : id)), 2000);
  }

  protected playersLabel(registration: Registration): string {
    return registration.players.join(' · ') || '–';
  }
}
