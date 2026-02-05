import { Component, signal, inject, HostListener, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { HeaderComponent } from '../../components/header/header.component';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { ImpersonationToolbarComponent } from '../../components/impersonation-toolbar/impersonation-toolbar.component';
import { UpdateBannerComponent } from '../../components/update-banner/update-banner.component';
import { ToastService } from '../../../core/services/toast.service';
import { ElectronService } from '../../../core/services/electron.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, HeaderComponent, SidebarComponent, ImpersonationToolbarComponent, UpdateBannerComponent],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss'
})
export class AdminLayoutComponent implements OnInit, OnDestroy {
  private toastService = inject(ToastService);
  private electronService = inject(ElectronService);
  private destroy$ = new Subject<void>();

  // State
  sidebarCollapsed = signal(false);
  sidebarMobileOpen = signal(false);
  whatsappVisible = signal(false);

  // Responsive handling
  private readonly MOBILE_BREAKPOINT = 1024;

  constructor() {
    this.checkViewport();
  }

  ngOnInit(): void {
    // Listen for WhatsApp visibility changes from Electron
    if (this.electronService.isElectron) {
      this.electronService.whatsappVisible$
        .pipe(takeUntil(this.destroy$))
        .subscribe(visible => {
          this.whatsappVisible.set(visible);
        });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.checkViewport();
  }

  toggleSidebar(): void {
    if (window.innerWidth < this.MOBILE_BREAKPOINT) {
      this.sidebarMobileOpen.update(v => !v);
    } else {
      this.sidebarCollapsed.update(v => !v);
    }
  }

  toggleSidebarCollapse(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  closeMobileSidebar(): void {
    this.sidebarMobileOpen.set(false);
  }

  private checkViewport(): void {
    if (window.innerWidth < this.MOBILE_BREAKPOINT) {
      this.sidebarMobileOpen.set(false);
    }
  }

  // Toast service for template access
  get toasts() {
    return this.toastService.toasts;
  }

  dismissToast(id: number): void {
    this.toastService.dismiss(id);
  }

  getToastIcon(type: string): string {
    const icons: Record<string, string> = {
      success: 'ph-check-circle',
      error: 'ph-x-circle',
      warning: 'ph-warning',
      info: 'ph-info'
    };
    return icons[type] || 'ph-info';
  }

  get currentYear(): number {
    return new Date().getFullYear();
  }
}
