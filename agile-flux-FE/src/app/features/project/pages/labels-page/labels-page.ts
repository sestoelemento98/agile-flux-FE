import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzMessageService } from 'ng-zorro-antd/message';
import { LabelApi } from '../../../../core/api/planning-api';
import { Label } from '../../../../core/models/api.models';
import { apiErrorMessage, applyFieldErrors } from '../../../../core/utils/api-error';
import { ProjectContext } from '../../project-context';
import { LabelTagComponent } from '../../../issue/components/issue-icons/issue-icons';

const HEX = /^#[0-9a-fA-F]{6}$/;
const PRESETS = [
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#64748b',
];

@Component({
  selector: 'app-labels-page',
  imports: [
    ReactiveFormsModule,
    NzTableModule,
    NzButtonModule,
    NzIconModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzPopconfirmModule,
    LabelTagComponent,
  ],
  templateUrl: './labels-page.html',
  styles: `
    .presets {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    .preset {
      width: 22px;
      height: 22px;
      border: 2px solid #fff;
      border-radius: 50%;
      box-shadow: 0 0 0 1px #dfe3ea;
      cursor: pointer;
    }
  `,
})
export class LabelsPageComponent {
  protected ctx = inject(ProjectContext);
  private api = inject(LabelApi);
  private fb = inject(NonNullableFormBuilder);
  private message = inject(NzMessageService);

  readonly presets = PRESETS;

  rows = computed(() => {
    const issues = this.ctx.issues();
    return this.ctx.labels().map((label) => ({
      label,
      count: issues.filter((i) => i.labels.some((l) => l.id === label.id)).length,
    }));
  });

  modalOpen = signal(false);
  editing = signal<Label | null>(null);
  saving = signal(false);
  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(50)]],
    color: ['#6366f1', Validators.pattern(HEX)],
  });

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '', color: '#6366f1' });
    this.modalOpen.set(true);
  }

  openEdit(label: Label): void {
    this.editing.set(label);
    this.form.reset({ name: label.name, color: label.color });
    this.modalOpen.set(true);
  }

  pickPreset(color: string): void {
    this.form.controls.color.setValue(color);
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
    const body = { name: v.name.trim(), color: v.color };
    const editing = this.editing();
    const req = editing
      ? this.api.update(editing.id, body)
      : this.api.create({ projectId, ...body });
    this.saving.set(true);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.ctx.reloadLabels();
        // Issue nhúng bản sao label → tải lại để thẻ hiện tên/màu mới
        if (editing) this.ctx.reloadIssues();
        this.message.success(editing ? 'Đã cập nhật nhãn' : 'Đã tạo nhãn');
      },
      error: (err) => {
        this.saving.set(false);
        // Trùng tên trong project → 400 với detail
        if (!applyFieldErrors(this.form, err)) this.message.error(apiErrorMessage(err));
      },
    });
  }

  /** BE tự gỡ nhãn khỏi mọi issue. */
  remove(label: Label): void {
    this.api.delete(label.id).subscribe({
      next: () => {
        this.ctx.reloadLabels();
        this.ctx.reloadIssues();
        this.message.success('Đã xoá nhãn');
      },
      error: (err) => this.message.error(apiErrorMessage(err)),
    });
  }
}
