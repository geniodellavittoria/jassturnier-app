import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RegistrationApi } from '../../services/registration-api';

@Component({
  selector: 'app-register-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './register-page.html',
  styleUrl: './register-page.scss',
})
export class RegisterPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(RegistrationApi);

  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    teamName: ['', [Validators.required, Validators.maxLength(80)]],
    p1: ['', [Validators.maxLength(60)]],
    p2: ['', [Validators.maxLength(60)]],
    contactName: ['', [Validators.required, Validators.maxLength(80)]],
    contactEmail: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.maxLength(30)]],
    note: ['', [Validators.maxLength(400)]],
    website: [''], // honeypot, kept empty by real users
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    const value = this.form.getRawValue();
    try {
      await this.api.register({
        teamName: value.teamName.trim(),
        players: [value.p1.trim(), value.p2.trim()].filter(Boolean),
        contactName: value.contactName.trim(),
        contactEmail: value.contactEmail.trim(),
        phone: value.phone.trim() || undefined,
        note: value.note.trim() || undefined,
        website: value.website,
      });
      this.submitted.set(true);
    } catch {
      this.error.set('Anmeldung konnte nicht gesendet werden. Bitte später erneut versuchen.');
    } finally {
      this.submitting.set(false);
    }
  }
}
