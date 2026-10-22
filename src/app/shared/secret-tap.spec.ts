import { Component } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SecretTap } from './secret-tap';

@Component({
  imports: [SecretTap],
  template: `<p appSecretTap="/verwaltung" [taps]="3" [windowMs]="1000">Logo</p>`,
})
class Host {}

describe('SecretTap', () => {
  let fixture: ComponentFixture<Host>;
  let navigate: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  function tap(times: number) {
    for (let i = 0; i < times; i++) fixture.nativeElement.querySelector('p').click();
  }

  it('navigates after enough quick taps and starts counting again', fakeAsync(() => {
    tap(2);
    expect(navigate).not.toHaveBeenCalled();
    tap(1);
    expect(navigate).toHaveBeenCalledOnceWith('/verwaltung');
    tap(2);
    expect(navigate).toHaveBeenCalledTimes(1);
    tick(1000);
  }));

  it('forgets taps after the time window', fakeAsync(() => {
    tap(2);
    tick(1000);
    tap(2);
    expect(navigate).not.toHaveBeenCalled();
    tick(1000);
  }));
});
