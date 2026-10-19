import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ProjectApi } from '../../../../core/api/project-api';
import { ProjectUpdateRequest } from '../../../../core/models/api.models';
import { apiErrorMessage, applyFieldErrors } from '../../../../core/utils/api-error';
import { ProjectContext } from '../../project-context';

@Component({
  selector: 'app-settings-page',
  imports: [
    ReactiveFormsModule,
    NzFormModule,
    NzInputModule,
    NzSelectModule,
    NzButtonModule,
    NzIconModule,
    NzAlertModule,
    NzPopconfirmModule,
  ],
  templateUrl: './settings-page.html',
  styles: `
    .settings {
      max-width: 640px;
    }
    .danger {
      border-color: #fecdca;
    }
    .danger h3 {
      margin: 0 0 4px;
      color: #b42318;
    }
    .danger-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    h3 {
      margin: 0 0 16px;
    }
  `,
})
export class SettingsPageComponent {
  protected ctx = inject(ProjectContext);
  private api = inject(ProjectApi);
  private fb = inject(NonNullableFormBuilder);
  private router = inject(Router);
  private message = inject(NzMessageService);

  canEdit = computed(() => this.ctx.isAdmin() && !this.ctx.readonly());
  saving = signal(false);
  busy = signal(false);

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    leadId: this.fb.control<string | null>(null),
  });

  constructor() {
    effect(() => {
      const p = this.ctx.project();
      const editable = this.canEdit();
      untracked(() => {
        if (!p) return;
        this.form.reset({ name: p.name, description: p.description ?? '', leadId: p.leaderId });
        if (editable) this.form.enable();
        else this.form.disable();
      });
    });
  }

  save(): void {
    const p = this.ctx.project();
    if (!p) return;
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((c) => {
        c.markAsDirty();
        c.updateValueAndValidity();
      });
      return;
    }
    const v = this.form.getRawValue();
    const body: ProjectUpdateRequest = { name: v.name.trim(), description: v.description.trim() };
    // leadId null nghĩa là "không đổi" → muốn bỏ lead phải gửi clearLead
    if (v.leadId) body.leadId = v.leadId;
    else if (p.leaderId) body.clearLead = true;

    this.saving.set(true);
    this.api.update(p.id, body).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.ctx.project.set(updated);
        this.message.success('Đã lưu cài đặt dự án');
      },
      error: (err) => {
        this.saving.set(false);
        if (!applyFieldErrors(this.form, err)) this.message.error(apiErrorMessage(err));
      },
    });
  }

  archive(): void {
    const p = this.ctx.project();
    if (!p) return;
    this.busy.set(true);
    this.api.archive(p.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.message.success('Đã archive dự án');
        this.router.navigate(['/projects']);
      },
      error: (err) => {
        this.busy.set(false);
        this.message.error(apiErrorMessage(err));
      },
    });
  }

  unarchive(): void {
    const p = this.ctx.project();
    if (!p) return;
    this.busy.set(true);
    this.api.unarchive(p.id).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.ctx.project.set(updated);
        this.message.success('Đã khôi phục dự án');
      },
      error: (err) => {
        this.busy.set(false);
        this.message.error(apiErrorMessage(err));
      },
    });
  }
}
