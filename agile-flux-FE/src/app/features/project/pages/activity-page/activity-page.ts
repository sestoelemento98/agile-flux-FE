import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ProjectApi } from '../../../../core/api/project-api';
import { ActivityAction, ActivityLog } from '../../../../core/models/api.models';
import { describeActivity } from '../../../../core/models/display';
import { apiErrorMessage } from '../../../../core/utils/api-error';
import { ProjectContext } from '../../project-context';

const PAGE_SIZE = 50;

function actionColor(action: ActivityAction): string {
  if (action.endsWith('_deleted') || action.endsWith('_removed')) return 'red';
  if (action.endsWith('_created') || action.endsWith('_added')) return 'green';
  return 'blue';
}

@Component({
  selector: 'app-activity-page',
  imports: [DatePipe, NzTimelineModule, NzButtonModule, NzSpinModule, NzEmptyModule, NzIconModule],
  templateUrl: './activity-page.html',
  styles: `
    .issue-link {
      font-weight: 600;
      cursor: pointer;
    }
    .more {
      display: flex;
      justify-content: center;
    }
  `,
})
export class ActivityPageComponent {
  protected ctx = inject(ProjectContext);
  private api = inject(ProjectApi);
  private message = inject(NzMessageService);

  readonly describe = describeActivity;
  readonly color = actionColor;

  items = signal<ActivityLog[]>([]);
  loading = signal(false);
  hasMore = signal(false);
  private page = 0;

  constructor() {
    this.reload();
  }

  reload(): void {
    this.page = 0;
    this.items.set([]);
    this.fetch();
  }

  loadMore(): void {
    this.page++;
    this.fetch();
  }

  /** Issue đã xoá thì issueId = null → không mở được. */
  openIssue(a: ActivityLog): void {
    if (a.issueId && this.ctx.findIssue(a.issueId)) this.ctx.openIssue(a.issueId);
  }

  private fetch(): void {
    const id = this.ctx.projectId();
    if (!id) return;
    this.loading.set(true);
    this.api.activities(id, this.page, PAGE_SIZE).subscribe({
      next: (list) => {
        this.loading.set(false);
        this.items.update((cur) => [...cur, ...list]);
        // Mảng thuần, không có tổng số trang: hết khi trả về ít hơn size
        this.hasMore.set(list.length === PAGE_SIZE);
      },
      error: (err) => {
        this.loading.set(false);
        this.message.error(apiErrorMessage(err));
      },
    });
  }
}
