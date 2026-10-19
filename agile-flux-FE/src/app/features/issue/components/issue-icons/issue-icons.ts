import { Component, computed, input, output } from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { IssuePriority, IssueStatus, IssueType, Label } from '../../../../core/models/api.models';
import { priorityMeta, statusMeta, typeMeta } from '../../../../core/models/display';

/** Icon loại issue (story/task/bug/sub_task). */
@Component({
  selector: 'app-issue-type-icon',
  imports: [NzIconModule, NzTooltipModule],
  template: `<span
    class="type-icon"
    [style.background]="meta().color"
    nz-tooltip
    [nzTooltipTitle]="meta().title"
    ><span nz-icon [nzType]="meta().icon"></span
  ></span>`,
  styles: `
    .type-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 4px;
      color: #fff;
      font-size: 11px;
      flex-shrink: 0;
    }
  `,
})
export class IssueTypeIconComponent {
  type = input.required<IssueType>();
  meta = computed(() => typeMeta(this.type()));
}

/** Icon độ ưu tiên (lowest → highest). */
@Component({
  selector: 'app-priority-icon',
  imports: [NzIconModule, NzTooltipModule],
  template: `<span
      nz-icon
      [nzType]="meta().icon"
      [nzRotate]="meta().rotate"
      [style.color]="meta().color"
      nz-tooltip
      [nzTooltipTitle]="'Ưu tiên: ' + meta().title"
    ></span>
    @if (showLabel()) {
      <span class="label">{{ meta().title }}</span>
    }`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
    }
    .label {
      font-weight: 400;
    }
  `,
})
export class PriorityIconComponent {
  priority = input.required<IssuePriority>();
  showLabel = input(false);
  meta = computed(() => priorityMeta(this.priority()));
}

/** Tag trạng thái issue (todo/in_progress/testing/done). */
@Component({
  selector: 'app-status-tag',
  imports: [NzTagModule],
  template: `<nz-tag [nzColor]="meta().color" class="status-tag">{{ meta().title }}</nz-tag>`,
  styles: `
    .status-tag {
      margin: 0;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
    }
  `,
})
export class StatusTagComponent {
  status = input.required<IssueStatus>();
  meta = computed(() => statusMeta(this.status()));
}

/** Tag nhãn, màu lấy từ label.color (hex) — không phải preset của nz-tag. */
@Component({
  selector: 'app-label-tag',
  imports: [NzTagModule],
  template: `<nz-tag
    class="label-tag"
    [nzColor]="label().color"
    [nzMode]="closable() ? 'closeable' : 'default'"
    (nzOnClose)="closed($event)"
    >{{ label().name }}</nz-tag
  >`,
  styles: `
    .label-tag {
      margin: 0;
      border: none;
      border-radius: 6px;
      font-size: 12px;
    }
  `,
})
export class LabelTagComponent {
  label = input.required<Label>();
  closable = input(false);
  removed = output<Label>();

  closed(event: MouseEvent): void {
    // Tag chỉ đóng sau khi BE gỡ thành công — danh sách sẽ render lại từ Issue mới.
    event.preventDefault();
    this.removed.emit(this.label());
  }
}
