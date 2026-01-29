import { Component, inject, effect } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private themeService = inject(ThemeService);

  constructor() {
    // Apply initial theme to body
    effect(() => {
      document.body.setAttribute('data-theme', this.themeService.theme());
    });
  }
}
