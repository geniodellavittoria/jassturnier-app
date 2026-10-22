import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { createFakeApi, FakeApi, provideFakeApi } from '../../../testing/fake-api';
import { RegisterPage } from './register-page';

describe('RegisterPage', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<RegisterPage>;
  let el: HTMLElement;

  beforeEach(() => {
    api = createFakeApi();
    TestBed.configureTestingModule({ providers: [provideFakeApi(api)] });
    fixture = TestBed.createComponent(RegisterPage);
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  function fill(id: string, value: string) {
    const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function fillValid() {
    fill('reg-team', ' Bock-Stars ');
    fill('reg-p1', ' Anna ');
    fill('reg-p2', '');
    fill('reg-name', ' Anna Muster ');
    fill('reg-email', 'anna@example.com');
    fixture.detectChanges();
  }

  async function submit() {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function button(): HTMLButtonElement {
    return el.querySelector('button[type="submit"]')!;
  }

  it('only enables sending once the required fields are valid', () => {
    expect(button().disabled).toBeTrue();
    fillValid();
    expect(button().disabled).toBeFalse();
    fill('reg-email', 'kein-mail');
    fixture.detectChanges();
    expect(button().disabled).toBeTrue();
    fill('reg-email', 'anna@example'); // the server wants a dot in the domain, so the form does too
    fixture.detectChanges();
    expect(button().disabled).toBeTrue();
  });

  it('does not send an invalid form', async () => {
    await submit();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('sends a trimmed registration and thanks the team', async () => {
    fillValid();
    fill('reg-phone', ' 079 ');
    fill('reg-note', '  ');
    await submit();
    expect(api.register).toHaveBeenCalledOnceWith({
      teamName: 'Bock-Stars',
      players: ['Anna'],
      contactName: 'Anna Muster',
      contactEmail: 'anna@example.com',
      phone: '079',
      note: undefined,
      website: '',
    });
    expect(el.querySelector('.success h2')?.textContent).toBe('Danke für die Anmeldung!');
  });

  it('passes the honeypot along for the server to discard', async () => {
    fillValid();
    fill('reg-website', 'spam');
    await submit();
    expect(api.register.calls.mostRecent().args[0].website).toBe('spam');
  });

  it('shows an error when sending fails and allows retrying', async () => {
    api.register.and.rejectWith(new Error('500'));
    fillValid();
    await submit();
    expect(el.querySelector('.error')?.textContent).toContain('Anmeldung konnte nicht gesendet werden');
    expect(button().disabled).toBeFalse();
  });

  it('shows the reason when the server rejects the input', async () => {
    api.register.and.rejectWith(
      new HttpErrorResponse({ status: 400, error: { error: 'Gültige Kontakt-E-Mail fehlt.' } }),
    );
    fillValid();
    await submit();
    expect(el.querySelector('.error')?.textContent).toBe('Gültige Kontakt-E-Mail fehlt.');
  });

  it('falls back to the generic message for a 400 without a reason', async () => {
    api.register.and.rejectWith(new HttpErrorResponse({ status: 400, error: 'Bad Request' }));
    fillValid();
    await submit();
    expect(el.querySelector('.error')?.textContent).toContain('Bitte später erneut versuchen');
  });

  it('shows progress and ignores double submits', async () => {
    let finish!: () => void;
    api.register.and.returnValue(new Promise((resolve) => (finish = resolve)));
    fillValid();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(button().textContent).toContain('Wird gesendet…');
    expect(api.register).toHaveBeenCalledTimes(1);
    finish();
    await fixture.whenStable();
  });
});
