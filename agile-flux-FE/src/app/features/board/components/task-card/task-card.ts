import { Component, computed, input, output } from '@angular/core';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { Epic, Issue } from '../../../../core/models/api.models';
import { formatLocalDate, todayLocalDate } from '../../../../core/models/display';
import {
  IssueTypeIconComponent,
  LabelTagComponent,
  PriorityIconComponent,
} from '../../../issue/components/issue-icons/issue-icons';

@Component({
  selector: 'app-task-card',
  standalone: true,
  imports: [
    NzAvatarModule,
    NzIconModule,
    NzTooltipModule,
    IssueTypeIconComponent,
    PriorityIconComponent,
    LabelTagComponent,
  ],
  templateUrl: './task-card.html',
  styleUrls: ['./task-card.scss'],
})
export class KanbanCardComponent {
  issue = input.required<Issue>();
  epic = input<Epic | undefined>();

  /** Bắn ra khi người dùng click vào thẻ (mở chi tiết issue) */
  cardClick = output<Issue>();

  completed = computed(() => this.issue().status === 'done');
  dueLabel = computed(() => formatLocalDate(this.issue().dueDate, false));
  /** So sánh chuỗi "YYYY-MM-DD" trực tiếp — không parse Date */
  overdue = computed(() => {
    const due = this.issue().dueDate;
    return !!due && !this.completed() && due < todayLocalDate();
  });

  onClick(): void {
    this.cardClick.emit(this.issue());
  }
}
