import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { BulkSendService, BulkSendRules } from '../../../../core/services/bulk-send.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-send-rules',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LoadingSpinnerComponent],
  template: `
    <div class="send-rules-container">
      <div class="page-header">
        <a routerLink="/app/bulk_sends" class="back-link">
          <i class="ph-arrow-left"></i> Volver a envíos masivos
        </a>
        <h1>Reglas de Envío Masivo</h1>
        <p class="subtitle">Configura límites y medidas anti-ban para los envíos masivos</p>
      </div>

      @if (isLoading()) {
        <app-loading-spinner message="Cargando reglas..." />
      } @else {
        <div class="rules-card">
          @if (errors().length > 0) {
            <div class="error-panel">
              @for (error of errors(); track error) {
                <p>{{ error }}</p>
              }
            </div>
          }

          <!-- Daily Limits -->
          <div class="section">
            <h3><i class="ph-calendar"></i> Límites Diarios</h3>
            <div class="form-group">
              <label for="maxDaily">Máximo de mensajes por día</label>
              <input type="number" id="maxDaily" [(ngModel)]="formData.max_daily_messages"
                     class="form-control" min="1" max="1000">
              <span class="help-text">Límite total de mensajes enviados por agente por día</span>
            </div>
          </div>

          <!-- Delay Settings -->
          <div class="section">
            <h3><i class="ph-clock"></i> Delays entre Mensajes</h3>
            <div class="form-row">
              <div class="form-group">
                <label for="minDelay">Delay mínimo (segundos)</label>
                <input type="number" id="minDelay" [(ngModel)]="formData.min_delay_seconds"
                       class="form-control" min="5" max="300">
              </div>
              <div class="form-group">
                <label for="maxDelay">Delay máximo (segundos)</label>
                <input type="number" id="maxDelay" [(ngModel)]="formData.max_delay_seconds"
                       class="form-control" min="10" max="600">
              </div>
            </div>
            <span class="help-text">Delay aleatorio entre estos valores para simular comportamiento humano</span>
          </div>

          <!-- Pause Settings -->
          <div class="section">
            <h3><i class="ph-pause-circle"></i> Pausas Periódicas</h3>
            <div class="form-row">
              <div class="form-group">
                <label for="pauseAfter">Pausar después de</label>
                <div class="input-suffix">
                  <input type="number" id="pauseAfter" [(ngModel)]="formData.pause_after_count"
                         class="form-control" min="5" max="100">
                  <span>mensajes</span>
                </div>
              </div>
              <div class="form-group">
                <label for="pauseDuration">Duración de pausa</label>
                <div class="input-suffix">
                  <input type="number" id="pauseDuration" [(ngModel)]="formData.pause_duration_minutes"
                         class="form-control" min="1" max="30">
                  <span>minutos</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Schedule -->
          <div class="section">
            <h3><i class="ph-timer"></i> Horario de Envío</h3>
            <div class="form-row">
              <div class="form-group">
                <label for="hourStart">Hora inicio</label>
                <div class="input-suffix">
                  <input type="number" id="hourStart" [(ngModel)]="formData.send_hour_start"
                         class="form-control" min="0" max="23">
                  <span>hrs (Lima)</span>
                </div>
              </div>
              <div class="form-group">
                <label for="hourEnd">Hora fin</label>
                <div class="input-suffix">
                  <input type="number" id="hourEnd" [(ngModel)]="formData.send_hour_end"
                         class="form-control" min="0" max="23">
                  <span>hrs (Lima)</span>
                </div>
              </div>
            </div>
            <span class="help-text">Solo se enviarán mensajes dentro de este horario</span>
          </div>

          <!-- Enable/Disable -->
          <div class="section">
            <div class="toggle-row">
              <div>
                <strong>Reglas activas</strong>
                <p class="help-text">Habilitar/deshabilitar todas las reglas de limitación</p>
              </div>
              <label class="toggle">
                <input type="checkbox" [(ngModel)]="formData.enabled">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- Actions -->
          <div class="form-actions">
            <a routerLink="/app/bulk_sends" class="btn btn-outline">Cancelar</a>
            <button class="btn btn-primary" (click)="save()" [disabled]="isSaving()">
              {{ isSaving() ? 'Guardando...' : 'Guardar Reglas' }}
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .send-rules-container { padding: 24px; max-width: 700px; margin: 0 auto; }
    .page-header { margin-bottom: 24px; }
    .back-link {
      display: inline-flex; align-items: center; gap: 4px;
      color: #6c757d; text-decoration: none; font-size: 14px; margin-bottom: 8px;
      &:hover { color: #4361ee; }
    }
    .page-header h1 { font-size: 24px; font-weight: 600; margin: 0; color: #1a1a2e; }
    .subtitle { font-size: 14px; color: #6c757d; margin: 4px 0 0; }
    .rules-card { background: white; border: 1px solid #e9ecef; border-radius: 12px; padding: 24px; }
    .section {
      margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #f0f0f0;
      &:last-of-type { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
      h3 {
        font-size: 16px; font-weight: 600; color: #1a1a2e; margin: 0 0 16px;
        display: flex; align-items: center; gap: 8px;
        i { font-size: 20px; color: #4361ee; }
      }
    }
    .form-group {
      margin-bottom: 12px;
      label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; color: #333; }
    }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .form-control {
      width: 100%; padding: 10px 14px; border: 1px solid #dee2e6; border-radius: 8px;
      font-size: 14px; box-sizing: border-box;
      &:focus { outline: none; border-color: #4361ee; box-shadow: 0 0 0 3px rgba(67,97,238,0.1); }
    }
    .input-suffix {
      display: flex; align-items: center; gap: 8px;
      .form-control { flex: 1; }
      span { font-size: 13px; color: #6c757d; white-space: nowrap; }
    }
    .help-text { font-size: 12px; color: #999; margin-top: 4px; display: block; }
    .toggle-row {
      display: flex; justify-content: space-between; align-items: center;
      strong { font-size: 14px; }
      p { margin: 2px 0 0; }
    }
    .toggle {
      position: relative; display: inline-block; width: 48px; height: 26px;
      input { opacity: 0; width: 0; height: 0; }
    }
    .toggle-slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background-color: #ccc; border-radius: 26px; transition: 0.3s;
      &::before {
        content: ''; position: absolute; height: 20px; width: 20px; left: 3px; bottom: 3px;
        background-color: white; border-radius: 50%; transition: 0.3s;
      }
    }
    .toggle input:checked + .toggle-slider {
      background-color: #4361ee;
      &::before { transform: translateX(22px); }
    }
    .form-actions {
      display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px;
      padding-top: 20px; border-top: 1px solid #e9ecef;
    }
    .btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px;
      border: none; border-radius: 8px; font-size: 14px; font-weight: 500;
      cursor: pointer; text-decoration: none; transition: all 0.2s;
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .btn-primary { background: #4361ee; color: white; &:hover:not(:disabled) { background: #3a56d4; } }
    .btn-outline { background: white; color: #4361ee; border: 1px solid #4361ee; &:hover { background: #f0f3ff; } }
    .error-panel {
      background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px;
      padding: 12px 16px; margin-bottom: 16px;
      p { margin: 0; font-size: 14px; color: #721c24; }
    }
    @media (max-width: 768px) { .form-row { grid-template-columns: 1fr; } }
  `]
})
export class SendRulesComponent implements OnInit, OnDestroy {
  private bulkSendService = inject(BulkSendService);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  isLoading = signal(false);
  isSaving = signal(false);
  errors = signal<string[]>([]);

  formData: Omit<BulkSendRules, 'id'> = {
    max_daily_messages: 200,
    min_delay_seconds: 30,
    max_delay_seconds: 90,
    pause_after_count: 20,
    pause_duration_minutes: 5,
    send_hour_start: 8,
    send_hour_end: 20,
    enabled: true
  };

  ngOnInit(): void {
    this.loadRules();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadRules(): void {
    this.isLoading.set(true);
    this.bulkSendService.getRules().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        const r = response.rules;
        this.formData = {
          max_daily_messages: r.max_daily_messages,
          min_delay_seconds: r.min_delay_seconds,
          max_delay_seconds: r.max_delay_seconds,
          pause_after_count: r.pause_after_count,
          pause_duration_minutes: r.pause_duration_minutes,
          send_hour_start: r.send_hour_start,
          send_hour_end: r.send_hour_end,
          enabled: r.enabled
        };
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading rules:', err);
        this.isLoading.set(false);
      }
    });
  }

  save(): void {
    this.errors.set([]);

    if (this.formData.min_delay_seconds >= this.formData.max_delay_seconds) {
      this.errors.set(['El delay mínimo debe ser menor que el máximo']);
      return;
    }
    if (this.formData.send_hour_start >= this.formData.send_hour_end) {
      this.errors.set(['La hora de inicio debe ser menor que la hora de fin']);
      return;
    }

    this.isSaving.set(true);

    this.bulkSendService.updateRules(this.formData).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.success('Reglas actualizadas');
      },
      error: (err) => {
        this.isSaving.set(false);
        this.errors.set([err.error?.message || 'Error al guardar reglas']);
      }
    });
  }
}
