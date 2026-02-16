import { Component, signal, inject, HostListener, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { HeaderComponent } from '../../components/header/header.component';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { ImpersonationToolbarComponent } from '../../components/impersonation-toolbar/impersonation-toolbar.component';
import { UpdateBannerComponent } from '../../components/update-banner/update-banner.component';
import { ToastService } from '../../../core/services/toast.service';
import { ElectronService, BulkSendState } from '../../../core/services/electron.service';

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
  bulkSendActive = signal(false);
  bulkSendState = signal<BulkSendState>({ state: 'idle', sentCount: 0, failedCount: 0, totalRecipients: 0, currentPhone: null });
  private bulkSendOverlayDismissed = signal(false);
  private completionTimeout: any = null;

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

      // Listen for bulk send state changes
      this.electronService.bulkSendState$
        .pipe(takeUntil(this.destroy$))
        .subscribe(state => {
          const prevState = this.bulkSendState().state;
          this.bulkSendState.set(state);

          if ((state.state === 'completed' || state.state === 'cancelled')
              && (prevState === 'running' || prevState === 'paused')) {
            // Keep overlay visible briefly to show completion
            this.bulkSendActive.set(true);

            // Show toast
            const msg = state.state === 'completed'
              ? `Envío completado: ${state.sentCount} enviados` + (state.failedCount > 0 ? `, ${state.failedCount} fallidos` : '')
              : 'Envío masivo cancelado';
            this.toastService[state.state === 'completed' ? 'success' : 'warning'](msg);

            // Auto-dismiss after 3 seconds
            clearTimeout(this.completionTimeout);
            this.completionTimeout = setTimeout(() => {
              this.bulkSendActive.set(false);
              this.bulkSendState.set({ state: 'idle', sentCount: 0, failedCount: 0, totalRecipients: 0, currentPhone: null });
            }, 3000);
          } else if (state.state === 'running') {
            this.bulkSendOverlayDismissed.set(false);
            this.bulkSendActive.set(true);
          } else if (state.state === 'paused') {
            if (!this.bulkSendOverlayDismissed()) {
              this.bulkSendActive.set(true);
            }
          } else {
            this.bulkSendOverlayDismissed.set(false);
            this.bulkSendActive.set(false);
          }
        });

      // Check for pending bulk send from previous session
      // Only update state info (for /app/bulk_sends to use), don't show overlay
      this.electronService.checkPendingBulkSend().then(state => {
        if (state) {
          this.bulkSendState.set({
            state: state.state === 'running' ? 'paused' : state.state,
            sentCount: state.sentCount || 0,
            failedCount: state.failedCount || 0,
            totalRecipients: state.totalRecipients || 0,
            currentPhone: null
          });
          // Don't show overlay for pending sends from previous sessions
          // User can resume from /app/bulk_sends
        }
      });
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.completionTimeout);
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

  pauseBulkSend(): void {
    this.electronService.pauseBulkSend();
  }

  dismissBulkSendOverlay(): void {
    this.bulkSendOverlayDismissed.set(true);
    this.bulkSendActive.set(false);
  }

  cancelBulkSend(): void {
    if (confirm('¿Estás seguro de cancelar el envío masivo?')) {
      this.electronService.cancelBulkSend();
    }
  }

  get bulkSendProgress(): number {
    const s = this.bulkSendState();
    if (!s.totalRecipients) return 0;
    return Math.round((s.sentCount / s.totalRecipients) * 100);
  }
}
