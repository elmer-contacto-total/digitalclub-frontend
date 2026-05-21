import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CurrentVersionService {
  private _version = signal<string>(environment.version ?? '1.0.0');
  readonly version = this._version.asReadonly();

  constructor() {
    this.loadVersion();
  }

  private async loadVersion(): Promise<void> {
    const api = (window as any).electronAPI;
    if (api?.getAppVersion) {
      const v: string | undefined = await api.getAppVersion();
      if (v) this._version.set(v);
    }
  }
}
