import { TestBed } from '@angular/core/testing';
import { SuitBadge } from './suit-badge';

describe('SuitBadge', () => {
  function render(index: number): HTMLElement {
    const fixture = TestBed.createComponent(SuitBadge);
    fixture.componentRef.setInput('index', index);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('cycles through the four Swiss suits', () => {
    const labels = [0, 1, 2, 3, 4, -1].map((i) => render(i).querySelector('svg')!.getAttribute('aria-label'));
    expect(labels).toEqual(['Schellen', 'Rosen', 'Schilten', 'Eicheln', 'Schellen', 'Eicheln']);
  });

  it('sets a suit class on the host', () => {
    const el = render(1);
    expect(el.classList).toContain('suit-badge');
    expect(el.classList).toContain('suit-rosen');
  });
});
