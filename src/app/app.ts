import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AdminAuth } from './services/admin-auth';
import { SecretTap } from './shared/secret-tap';
import { TournamentStore } from './services/tournament-store';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SecretTap],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly store = inject(TournamentStore);
  protected readonly auth = inject(AdminAuth);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** The presentation view brings its own chalk-slate chrome. */
  protected readonly presenting = computed(() => this.url().startsWith('/praesentation'));

  constructor() {
    void this.auth.ensureChecked();
  }
}
