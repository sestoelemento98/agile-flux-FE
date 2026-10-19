import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzMessageService } from 'ng-zorro-antd/message';
import { EpicApi } from '../../../../core/api/planning-api';
import { Epic } from '../../../../core/models/api.models';
import { apiErrorMessage, applyFieldErrors } from '../../../../core/utils/api-error';
import { ProjectContext } from '../../project-context';

const HEX = /^#[0-9a-fA-F]{6}$/;

@Component({
  selector: 'app-epics-page',
  imports: [
    ReactiveFormsModule,
    NzTableModule,
    NzButtonModule,
    NzIconModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzPopconfirmModule,
    NzProgressModule,
  ],
  templateUrl: './epics-page.html',
})
export class EpicsPageComponent {
  protected ctx = inject(ProjectContext);
  private api = inject(EpicApi);
  private fb = inject(NonNullableFormBuilder);
  private message = inject(NzMessageService);

  rows = computed(() => {
    const issues = this.ctx.issues();
    return this.ctx.epics().map((epic) => {
      const list = issues.filter((i) => i.epicId === epic.id);
      const done = list.filter((i) => i.status === 'done').length;
      return {
        epic,
        total: list.length,
        done,
        percent: list.length ? Math.round((done / list.length) * 100) : 0,
      };
    });
  });

  modalOpen = signal(false);
  editing = signal<Epic | null>(null);
  saving = signal(false);
  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    color: ['#6366f1', Validators.pattern(HEX)],
  });

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '', description: '', color: '#6366f1' });
    this.modalOpen.set(true);
  }

  openEdit(epic: Epic): void {
    this.editing.set(epic);
    this.form.reset({ name: epic.name, description: epic.description ?? '', color: epic.color });
    this.modalOpen.set(true);
  }

  save(): void {
    const projectId = this.ctx.projectId();
    if (!projectId) return;
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((c) => {
        c.markAsDirty();
        c.updateValueAndValidity();
      });
      return;
    }
    const v = this.form.getRawValue();
    const body = {
      name: v.name.trim(),
      color: v.color,
      ...(v.description.trim() ? { description: v.description.trim() } : {}),
    };
    const editing = this.editing();
    const req = editing
      ? this.api.update(editing.id, body)
      : this.api.create({ projectId, ...body });
    this.saving.set(true);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.ctx.reloadEpics();
        this.message.success(editing ? 'Đã cập nhật epic' : 'Đã tạo epic');
      },
      error: (err) => {
        this.saving.set(false);
        if (!applyFieldErrors(this.form, err)) this.message.error(apiErrorMessage(err));
      },
    });
  }

  /** Còn issue gắn epic → BE trả 400, hiển thị detail. */
  remove(epic: Epic): void {
    this.api.delete(epic.id).subscribe({
      next: () => {
        this.ctx.reloadEpics();
        this.message.success('Đã xoá epic');
      },
      error: (err) => this.message.error(apiErrorMessage(err)),
    });
  }
}
