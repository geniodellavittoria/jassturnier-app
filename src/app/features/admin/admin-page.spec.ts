import { ComponentFixture, discardPeriodicTasks, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { clearStoredTournament, createFakeApi, FakeApi, provideFakeApi } from '../../../testing/fake-api';
import { PaymentSettings, Registration } from '../../models/registration';
import { TournamentStore } from '../../services/tournament-store';
import { AdminPage } from './admin-page';

const HOUR = 60 * 60 * 1000;

/** D1's `datetime('now')` format for a moment `ago` ms in the past. */
function d1Time(ago: number): string {
  return new Date(Date.now() - ago).toISOString().slice(0, 19).replace('T', ' ');
}

function registration(patch: Partial<Registration> = {}): Registration {
  return {
    id: 1,
    teamName: 'Bock-Stars',
    players: ['Anna', 'Beat'],
    contactName: 'Anna Muster',
    contactEmail: 'anna@example.com',
    phone: '079 123 45 67',
    note: 'vegetarisch',
    status: 'pending',
    createdAt: d1Time(HOUR),
    ...patch,
  };
}

const fullSettings: PaymentSettings = {
  recipientName: 'Jassclub',
  bankName: 'Raiffeisen',
  iban: 'CH00 1234',
  referenceNote: 'Teamname',
  amount: '40',
  currency: 'CHF',
  deadline: '15.09.2026',
  message: 'Bis bald!',
};

describe('AdminPage', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<AdminPage>;
  let el: HTMLElement;
  let store: TournamentStore;
  let router: Router;
  let returnUrl: string | null;

  beforeEach(() => {
    clearStoredTournament();
    api = createFakeApi();
    returnUrl = null;
    TestBed.configureTestingModule({
      providers: [
        provideFakeApi(api),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useFactory: () => ({
            snapshot: { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) },
          }),
        },
      ],
    });
    store = TestBed.inject(TournamentStore);
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
  });

  afterEach(clearStoredTournament);

  async function render() {
    fixture = TestBed.createComponent(AdminPage);
    el = fixture.nativeElement;
    await settle();
  }

  async function settle() {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  function button(label: string, root: ParentNode = el): HTMLButtonElement {
    return [...root.querySelectorAll('button')].find((b) => b.textContent!.trim() === label)!;
  }

  function type(selector: string, value: string) {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function select(selector: string, value: string) {
    const input = el.querySelector<HTMLSelectElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('change'));
  }

  function rows(): HTMLTableRowElement[] {
    return [...el.querySelectorAll<HTMLTableRowElement>('table.registrations tbody tr')];
  }

  describe('login', () => {
    beforeEach(() => api.checkSession.and.resolveTo(false));

    it('says it is loading until the session is known', async () => {
      api.checkSession.and.returnValue(new Promise(() => {}));
      fixture = TestBed.createComponent(AdminPage);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Lädt…');
    });

    it('rejects a wrong password', async () => {
      api.login.and.resolveTo(false);
      await render();
      expect(button('Anmelden').disabled).toBeTrue();
      type('#admin-password', 'falsch');
      fixture.detectChanges();
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
      expect(el.querySelector('.error')?.textContent).toBe('Falsches Passwort.');
      expect(api.listRegistrations).not.toHaveBeenCalled();
    });

    it('logs in and loads registrations and settings', async () => {
      api.listRegistrations.and.resolveTo([registration()]);
      await render();
      type('#admin-password', 'geheim');
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
      expect(api.login).toHaveBeenCalledWith('geheim');
      expect(rows().length).toBe(1);
      expect(api.getSettings).toHaveBeenCalled();
    });

    it('logs in even when the registrations cannot be loaded', async () => {
      api.listRegistrations.and.resolveTo(null);
      await render();
      type('#admin-password', 'geheim');
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
      expect(el.querySelector('.empty')?.textContent).toBe('Noch keine Anmeldungen.');
    });

    it('goes back to the page that required the login', async () => {
      returnUrl = '/gruppen';
      await render();
      type('#admin-password', 'geheim');
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/gruppen');
      expect(api.listRegistrations).not.toHaveBeenCalled();
    });

    it('ignores submits without a password or while checking', async () => {
      let answer!: (ok: boolean) => void;
      api.login.and.returnValue(new Promise((resolve) => (answer = resolve)));
      await render();
      const page = fixture.componentInstance;
      await page['login']();
      expect(api.login).not.toHaveBeenCalled();

      type('#admin-password', 'geheim');
      void page['login']();
      fixture.detectChanges();
      expect(button('Wird geprüft…')).toBeDefined();
      void page['login']();
      expect(api.login).toHaveBeenCalledTimes(1);
      answer(false);
      await settle();
    });
  });

  describe('when logged in', () => {
    it('loads registrations and settings, going on without them when unavailable', async () => {
      api.listRegistrations.and.resolveTo(null);
      await render();
      expect(el.querySelector('#regs-title')?.textContent).toBe('Anmeldungen (0)');
      expect(el.querySelector('.empty')?.textContent).toBe('Noch keine Anmeldungen.');
      expect(el.querySelector<HTMLInputElement>('#s-currency')!.value).toBe('CHF');
    });

    it('fills the settings form, defaulting the currency', async () => {
      api.getSettings.and.resolveTo({ ...fullSettings, currency: '' });
      await render();
      expect(el.querySelector<HTMLInputElement>('#s-iban')!.value).toBe('CH00 1234');
      expect(el.querySelector<HTMLInputElement>('#s-currency')!.value).toBe('CHF');
    });

    it('forwards to the page that required the login', async () => {
      returnUrl = '/finalrunde';
      await render();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/finalrunde');
      expect(api.listRegistrations).not.toHaveBeenCalled();
    });

    it('logs out', async () => {
      api.listRegistrations.and.resolveTo([registration()]);
      await render();
      button('Abmelden').click();
      await settle();
      expect(api.logout).toHaveBeenCalled();
      expect(el.querySelector('form.login')).not.toBeNull();
    });

    it('sets the presentation stage', async () => {
      await render();
      select('#presentation-stage', 'ko');
      expect(store.tournament().presentationStage).toBe('ko');
    });

    it('saves trimmed settings', async () => {
      await render();
      type('#s-iban', ' CH99 ');
      type('#s-currency', ' ');
      el.querySelectorAll('form')[0].dispatchEvent(new Event('submit'));
      fixture.detectChanges();
      expect(button('Wird gespeichert…')).toBeDefined();
      await settle();
      expect(api.saveSettings).toHaveBeenCalledOnceWith({
        recipientName: null,
        bankName: null,
        iban: 'CH99',
        referenceNote: null,
        amount: null,
        currency: 'CHF',
        deadline: null,
        message: null,
      });
      expect(el.querySelector('.saved-hint')?.textContent).toBe('Gespeichert.');
    });

    it('reports a failed save and allows saving again', async () => {
      api.saveSettings.and.rejectWith(new Error('500'));
      await render();
      el.querySelectorAll('form')[0].dispatchEvent(new Event('submit'));
      await settle();
      expect(el.querySelector('#settings-title')!.closest('section')!.querySelector('.error')?.textContent).toBe(
        'Zahlungsinformationen konnten nicht gespeichert werden.',
      );
      expect(el.querySelector('.saved-hint')).toBeNull();
      expect(button('Speichern').disabled).toBeFalse();

      api.saveSettings.and.resolveTo();
      el.querySelectorAll('form')[0].dispatchEvent(new Event('submit'));
      await settle();
      expect(el.querySelector('.saved-hint')).not.toBeNull();
      expect(el.querySelector('#settings-title')!.closest('section')!.querySelector('.error')).toBeNull();
    });

    it('ignores saving settings twice at once', async () => {
      api.saveSettings.and.returnValue(new Promise(() => {}));
      await render();
      void fixture.componentInstance['saveSettings']();
      void fixture.componentInstance['saveSettings']();
      expect(api.saveSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe('registrations', () => {
    it('lists registrations with contact details and a "new" badge', async () => {
      api.listRegistrations.and.resolveTo([
        registration(),
        registration({ id: 2, players: [], phone: null, note: null, createdAt: d1Time(5 * 24 * HOUR) }),
      ]);
      await render();
      const [first, second] = rows();
      expect(first.querySelector('.team-name')?.textContent).toBe('Bock-Stars');
      expect(first.querySelector('.badge-new')).not.toBeNull();
      expect(first.querySelector('.note')?.textContent).toBe('vegetarisch');
      expect(first.cells[1].textContent).toBe('Anna · Beat');
      expect(first.textContent).toContain('079 123 45 67');
      expect(second.querySelector('.badge-new')).toBeNull();
      expect(second.querySelector('.note')).toBeNull();
      expect(second.cells[1].textContent).toBe('–');
      expect(second.querySelectorAll('.contact-email').length).toBe(1);
      expect(first.querySelector('.received')?.textContent).toMatch(/\d\d\.\d\d\.\d{4} \d\d:\d\d/);
    });

    it('sums up the registrations', async () => {
      api.listRegistrations.and.resolveTo([
        registration({ id: 1, createdAt: d1Time(HOUR) }),
        registration({ id: 2, status: 'contacted', createdAt: d1Time(3 * 24 * HOUR) }),
        registration({ id: 3, status: 'paid', createdAt: d1Time(10 * 24 * HOUR) }),
        registration({ id: 4, status: 'cancelled', createdAt: d1Time(HOUR) }),
      ]);
      await render();
      const stats = [...el.querySelectorAll('.reg-stats > *')].map((s) => s.textContent!.trim());
      expect(stats).toEqual([
        '3 aktiv',
        '+1 in 24 h',
        '+2 in 7 Tagen',
        '1 ausstehend',
        '1 kontaktiert',
        '1 bezahlt',
        '1 abgemeldet',
      ]);
      expect(rows()[3].classList).toContain('is-cancelled');
      expect(rows()[3].querySelector('[id^="add-"]')).toBeNull();
    });

    it('omits the cancelled count when there are none', async () => {
      api.listRegistrations.and.resolveTo([registration()]);
      await render();
      expect(el.querySelector('.reg-stats')?.textContent).not.toContain('abgemeldet');
    });

    it('updates the status', async () => {
      api.listRegistrations.and.resolveTo([registration(), registration({ id: 2 })]);
      await render();
      select('tbody tr select', 'paid');
      await settle();
      expect(api.updateStatus).toHaveBeenCalledOnceWith(1, 'paid');
      expect(fixture.componentInstance['registrations']().map((r) => r.status)).toEqual(['paid', 'pending']);
    });

    it('puts the status back and explains when saving it fails', async () => {
      api.updateStatus.and.rejectWith(new Error('500'));
      api.listRegistrations.and.resolveTo([registration()]);
      await render();
      select('tbody tr select', 'paid');
      await settle();
      expect(el.querySelector<HTMLSelectElement>('tbody tr select')!.value).toBe('pending');
      expect(fixture.componentInstance['registrations']()[0].status).toBe('pending');
      expect(el.querySelector('[role="alert"]')?.textContent).toBe(
        'Status von «Bock-Stars» konnte nicht gespeichert werden.',
      );

      api.updateStatus.and.resolveTo();
      select('tbody tr select', 'contacted');
      await settle();
      expect(el.querySelector('[role="alert"]')).toBeNull();
    });

    it('keeps the registration and explains when deleting fails', async () => {
      spyOn(window, 'confirm').and.returnValue(true);
      api.deleteRegistration.and.rejectWith(new Error('500'));
      api.listRegistrations.and.resolveTo([registration()]);
      await render();
      button('Löschen', rows()[0]).click();
      await settle();
      expect(rows().length).toBe(1);
      expect(el.querySelector('[role="alert"]')?.textContent).toBe('«Bock-Stars» konnte nicht gelöscht werden.');
    });

    it('deletes after confirming', async () => {
      const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
      api.listRegistrations.and.resolveTo([registration(), registration({ id: 2, teamName: 'Zwei' })]);
      await render();
      button('Löschen', rows()[0]).click();
      await settle();
      expect(confirmSpy).toHaveBeenCalledWith('Anmeldung «Bock-Stars» endgültig löschen?');
      expect(api.deleteRegistration).not.toHaveBeenCalled();

      confirmSpy.and.returnValue(true);
      button('Löschen', rows()[0]).click();
      await settle();
      expect(api.deleteRegistration).toHaveBeenCalledOnceWith(1);
      expect(rows().map((r) => r.querySelector('.team-name')?.textContent)).toEqual(['Zwei']);
    });

    it('asks to create groups first', async () => {
      api.listRegistrations.and.resolveTo([registration()]);
      await render();
      expect(el.querySelector('.hint-link')?.getAttribute('href')).toBe('/einrichtung');
    });

    it('adds a registration to a group as a team', async () => {
      store.addGroup();
      api.listRegistrations.and.resolveTo([registration({ id: 9 })]);
      await render();
      select('#add-9', '');
      expect(Object.keys(store.tournament().teams)).toEqual([]);
      select('#add-9', store.tournament().groups[0].id);
      fixture.detectChanges();
      const team = Object.values(store.tournament().teams)[0];
      expect(team).toEqual(jasmine.objectContaining({ name: 'Bock-Stars', players: ['Anna', 'Beat'], registrationId: 9 }));
      expect(el.querySelector('.in-group')?.textContent).toBe('In Gruppe A');
    });

    describe('editing', () => {
      beforeEach(async () => {
        api.listRegistrations.and.resolveTo([registration(), registration({ id: 2, players: [], phone: null, note: null })]);
        await render();
      });

      function startEditing(row: number) {
        button('Bearbeiten', rows()[row]).click();
        fixture.detectChanges();
      }

      it('fills the form and can be cancelled', () => {
        startEditing(1);
        expect(el.querySelector('tr.is-editing')).not.toBeNull();
        expect(el.querySelector<HTMLInputElement>('#e-team-2')!.value).toBe('Bock-Stars');
        expect(el.querySelector<HTMLInputElement>('#e-p1-2')!.value).toBe('');
        expect(el.querySelector<HTMLInputElement>('#e-phone-2')!.value).toBe('');
        button('Abbrechen').click();
        fixture.detectChanges();
        expect(el.querySelector('tr.is-editing')).toBeNull();
      });

      it('saves trimmed changes and updates the team placed in a group', async () => {
        store.addGroup();
        store.addTeam(store.tournament().groups[0].id, 'Bock-Stars', ['Anna', 'Beat'], 1);
        startEditing(0);
        type('#e-team-1', ' Bock-Stars II ');
        type('#e-p2-1', ' ');
        type('#e-phone-1', '');
        el.querySelector('tr.is-editing form')!.dispatchEvent(new Event('submit'));
        fixture.detectChanges();
        expect(button('Wird gespeichert…')).toBeDefined();
        await settle();
        expect(api.editRegistration).toHaveBeenCalledOnceWith(1, {
          teamName: 'Bock-Stars II',
          players: ['Anna'],
          contactName: 'Anna Muster',
          contactEmail: 'anna@example.com',
          phone: undefined,
          note: 'vegetarisch',
        });
        expect(el.querySelector('tr.is-editing')).toBeNull();
        expect(rows()[0].querySelector('.team-name')?.textContent).toBe('Bock-Stars II');
        expect(Object.values(store.tournament().teams)[0]).toEqual(
          jasmine.objectContaining({ name: 'Bock-Stars II', players: ['Anna'] }),
        );
      });

      it('saves registrations that have no team yet', async () => {
        startEditing(1);
        el.querySelector('tr.is-editing form')!.dispatchEvent(new Event('submit'));
        await settle();
        expect(api.editRegistration).toHaveBeenCalledWith(2, jasmine.objectContaining({ note: undefined, players: [] }));
        expect(el.querySelector('tr.is-editing')).toBeNull();
      });

      it('keeps the form open with an error when saving fails', async () => {
        api.editRegistration.and.rejectWith(new Error('500'));
        startEditing(0);
        el.querySelector('tr.is-editing form')!.dispatchEvent(new Event('submit'));
        await settle();
        expect(el.querySelector('tr.is-editing .error')?.textContent).toBe('Änderungen konnten nicht gespeichert werden.');
        expect(button('Speichern', el.querySelector('tr.is-editing')!).disabled).toBeFalse();
      });

      it('does not save invalid input or twice at once', async () => {
        api.editRegistration.and.returnValue(new Promise(() => {}));
        startEditing(0);
        type('#e-email-1', 'kaputt');
        await fixture.componentInstance['saveEdit'](registration());
        expect(api.editRegistration).not.toHaveBeenCalled();

        type('#e-email-1', 'ok@example.com');
        void fixture.componentInstance['saveEdit'](registration());
        void fixture.componentInstance['saveEdit'](registration());
        expect(api.editRegistration).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('payment e-mail', () => {
    it('builds a mailto link with all payment details', async () => {
      api.getSettings.and.resolveTo(fullSettings);
      api.listRegistrations.and.resolveTo([registration()]);
      await render();
      const href = el.querySelector('a.btn[href^="mailto:"]')!.getAttribute('href')!;
      const [address, query] = href.slice('mailto:'.length).split('?');
      const params = new URLSearchParams(query.replace(/\+/g, '%2B'));
      expect(address).toBe('anna@example.com');
      expect(params.get('subject')).toBe('Zahlungsinformationen – Bock-Stars – Jassturnier ' + store.tournament().year);
      expect(params.get('body')!.split('\n')).toEqual([
        'Hallo Anna Muster',
        '',
        `vielen Dank für die Anmeldung von «Bock-Stars» zum Jassturnier ${store.tournament().year}.`,
        '',
        'Betrag: 40 CHF',
        'Zahlbar bis: 15.09.2026',
        'Empfänger: Jassclub',
        'Bank: Raiffeisen',
        'IBAN: CH00 1234',
        'Referenz: Teamname',
        '',
        'Bis bald!',
        '',
        'Sportliche Grüsse',
      ]);
    });

    it('leaves out payment details that are not configured', async () => {
      api.listRegistrations.and.resolveTo([registration()]);
      await render();
      const body = fixture.componentInstance['emailBody'](registration());
      expect(body.split('\n').slice(4)).toEqual(['', 'Sportliche Grüsse']);
    });

    it('explains when the text cannot be copied', async () => {
      spyOn(navigator.clipboard, 'writeText').and.rejectWith(new Error('denied'));
      api.listRegistrations.and.resolveTo([registration()]);
      await render();
      button('Text kopieren').click();
      await settle();
      expect(el.querySelector('[role="alert"]')?.textContent).toContain('Text konnte nicht kopiert werden');
      expect(button('Kopiert!')).toBeUndefined();
    });

    it('copies the e-mail text and confirms it briefly', fakeAsync(() => {
      const writeText = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
      api.listRegistrations.and.resolveTo([registration()]);
      fixture = TestBed.createComponent(AdminPage);
      el = fixture.nativeElement;
      fixture.detectChanges();
      flush();
      fixture.detectChanges();

      button('Text kopieren').click();
      tick();
      fixture.detectChanges();
      expect(writeText.calls.mostRecent().args[0]).toMatch(/^Zahlungsinformationen – Bock-Stars – .*\n\nHallo Anna Muster\n/);
      expect(button('Kopiert!')).toBeDefined();

      tick(1000);
      fixture.componentInstance['copiedId'].set(5); // another row was copied meanwhile
      tick(1000);
      fixture.detectChanges();
      expect(fixture.componentInstance['copiedId']()).toBe(5);

      button('Text kopieren').click();
      tick(2000);
      expect(fixture.componentInstance['copiedId']()).toBeNull();
      discardPeriodicTasks();
    }));
  });
});
