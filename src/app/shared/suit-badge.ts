import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type Suit = 'schellen' | 'rosen' | 'schilten' | 'eicheln';

const SUITS: Suit[] = ['schellen', 'rosen', 'schilten', 'eicheln'];

const SUIT_LABEL: Record<Suit, string> = {
  schellen: 'Schellen',
  rosen: 'Rosen',
  schilten: 'Schilten',
  eicheln: 'Eicheln',
};

/**
 * A stylized Swiss-deck suit (Schellen, Rosen, Schilten, Eicheln) used as a
 * group emblem. The suit is derived from the group's position, so groups
 * A–F cycle through the four suits.
 */
@Component({
  selector: 'app-suit-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'suit-badge', '[class]': '"suit-" + suit()' },
  template: `
    <svg viewBox="0 0 24 24" [attr.aria-label]="label()" role="img" fill="currentColor">
      @switch (suit()) {
        @case ('schellen') {
          <path d="M12 2.6c-3.4 0-5.5 2.7-5.7 6.2-.13 2.4-.7 4.3-1.9 5.7-.5.6-.2 1.5.6 1.5h14c.8 0 1.1-.9.6-1.5-1.2-1.4-1.77-3.3-1.9-5.7C17.5 5.3 15.4 2.6 12 2.6Z" />
          <path d="M9.6 18.2h4.8a2.4 2.4 0 0 1-4.8 0Z" />
        }
        @case ('rosen') {
          <path d="M12 3.2a3.2 3.2 0 0 1 3.1 2.4 3.2 3.2 0 0 1 3.3 5.3 3.2 3.2 0 0 1-2 6 3.2 3.2 0 0 1-4.4 1.6 3.2 3.2 0 0 1-4.4-1.6 3.2 3.2 0 0 1-2-6 3.2 3.2 0 0 1 3.3-5.3A3.2 3.2 0 0 1 12 3.2Z" />
          <circle cx="12" cy="11.6" r="2.5" fill="var(--surface, #fff)" opacity="0.85" />
        }
        @case ('schilten') {
          <path d="M12 2.4 19 5v6.2c0 4.6-2.9 8.1-7 10.4-4.1-2.3-7-5.8-7-10.4V5l7-2.6Z" />
          <path d="M12 5.2v13.6" stroke="var(--surface, #fff)" stroke-width="1.4" opacity="0.85" />
        }
        @case ('eicheln') {
          <path d="M12 2.8c3.3 0 5.6 1.9 5.6 4.4 0 1.3-.9 2.3-2.2 2.6-.6 3.9-1.7 6.7-3.4 8.9-1.7-2.2-2.8-5-3.4-8.9-1.3-.3-2.2-1.3-2.2-2.6 0-2.5 2.3-4.4 5.6-4.4Z" />
          <path d="M6.8 7.3h10.4" stroke="var(--surface, #fff)" stroke-width="1.3" opacity="0.85" />
          <path d="M12 19.2v2.4" stroke-linecap="round" stroke-width="1.6" stroke="currentColor" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--suit-size, 1.75rem);
      block-size: var(--suit-size, 1.75rem);
    }
    svg {
      inline-size: 100%;
      block-size: 100%;
    }
  `,
})
export class SuitBadge {
  /** Position of the group; suits cycle Schellen → Rosen → Schilten → Eicheln. */
  readonly index = input.required<number>();

  protected readonly suit = computed<Suit>(() => SUITS[((this.index() % 4) + 4) % 4]);
  protected readonly label = computed(() => SUIT_LABEL[this.suit()]);
}
