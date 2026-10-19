import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzMessageService } from 'ng-zorro-antd/message';
import { KanbanColumnComponent } from '../kanban-column/kanban-column';
import { BoardColumn } from '../../models/board-column.model';
import { IssueApi } from '../../../../core/api/issue-api';
import { Epic, Issue, IssueStatus, IssueType } from '../../../../core/models/api.models';
import { ISSUE_STATUSES, ISSUE_TYPES, formatLocalDate } from '../../../../core/models/display';
import { Websocket } from '../../../../core/services/websocket';
import { AuthService } from '../../../../core/auth/auth';
import { apiErrorMessage } from '../../../../core/utils/api-error';
import { ProjectContext } from '../../../project/project-context';

type Scope = 'active' | 'all';
/** 'me' | 'none' | 'all' | userId */
type AssigneeFilter = string;

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [
    FormsModule,
    DragDropModule,
    NzButtonModule,
    NzIconModule,
    NzSelectModule,
    NzSegmentedModule,
    NzBadgeModule,
    KanbanColumnComponent,
  ],
  templateUrl: './kanban-board.html',
  styleUrls: ['./kanban-board.scss'],
})
export class KanbanBoardComponent {
  protected ctx = inject(ProjectContext);
  private issueApi = inject(IssueApi);
  private auth = inject(AuthService);
  private message = inject(NzMessageService);
  private ws = inject(Websocket);

  readonly types = ISSUE_TYPES;
  readonly isConnected = toSignal(this.ws.onConnected(), { initialValue: false });

  /** Mặc định chỉ hiện sprint đang chạy (nếu có). */
  private scopeOverride = signal<Scope | null>(null);
  scope = computed<Scope>(
    () => this.scopeOverride() ?? (this.ctx.activeSprint() ? 'active' : 'all'),
  );
  assigneeFilter = signal<AssigneeFilter>('all');
  typeFilter = signal<IssueType | null>(null);

  scopeOptions = computed(() => [
    {
      label: this.ctx.activeSprint()
        ? `Sprint: ${this.ctx.activeSprint()!.name}`
        : 'Chưa có sprint chạy',
      value: 'active',
      disabled: !this.ctx.activeSprint(),
    },
    { label: 'Tất cả issue', value: 'all' },
  ]);

  sprintRange = computed(() => {
    const s = this.ctx.activeSprint();
    if (!s || (!s.startDate && !s.endDate)) return '';
    return `${formatLocalDate(s.startDate)} → ${formatLocalDate(s.endDate)}`;
  });

  epicsById = computed(() => new Map<string, Epic>(this.ctx.epics().map((e) => [e.id, e])));

  private visibleIssues = computed(() => {
    const active = this.ctx.activeSprint();
    const scope = this.scope();
    const assignee = this.assigneeFilter();
    const type = this.typeFilter();
    const me = this.auth.userId();
    return this.ctx.issues().filter((i) => {
      if (scope === 'active' && active && i.sprintId !== active.id) return false;
      if (type && i.type !== type) return false;
      if (assignee === 'me' && i.assigneeId !== me) return false;
      if (assignee === 'none' && i.assigneeId !== null) return false;
      if (
        assignee !== 'all' &&
        assignee !== 'me' &&
        assignee !== 'none' &&
        i.assigneeId !== assignee
      )
        return false;
      return this.ctx.matchesSearch(i);
    });
  });

  columns = computed<BoardColumn[]>(() => {
    const issues = this.visibleIssues();
    return ISSUE_STATUSES.map((s) => ({
      key: s.key,
      title: s.title,
      accentColor: s.color,
      backgroundTint: s.tint,
      issues: issues
        .filter((i) => i.status === s.key)
        .sort((a, b) => a.issueNumber - b.issueNumber),
    }));
  });

  connectedListIds = computed(() => this.columns().map((c) => this.dropListId(c.key)));

  setScope(value: string | number): void {
    this.scopeOverride.set(value as Scope);
  }

  dropListId(status: IssueStatus): string {
    return 'af-kanban-col-' + status;
  }

  onCardClick(issue: Issue): void {
    this.ctx.openIssue(issue.id);
  }

  addIssue(status: IssueStatus = 'todo'): void {
    const active = this.ctx.activeSprint();
    this.ctx.openCreateIssue({
      status,
      sprintId: this.scope() === 'active' && active ? active.id : null,
    });
  }

  /**
   * Kéo sang cột khác: cập nhật UI lạc quan → PATCH /issues/{id}/status → lỗi thì hoàn tác.
   * Kéo trong cùng cột: BE không lưu thứ tự → không gọi API.
   */
  onCardDrop(event: CdkDragDrop<Issue[]>, target: BoardColumn): void {
    if (event.previousContainer === event.container) return;
    const original = event.item.data as Issue;
    if (original.status === target.key) return;

    this.ctx.upsertIssue({ ...original, status: target.key });
    this.issueApi.changeStatus(original.id, target.key).subscribe({
      next: (updated) => this.ctx.upsertIssue(updated),
      error: (err) => {
        this.ctx.upsertIssue(original);
        this.message.error(apiErrorMessage(err, 'Không đổi được trạng thái'));
      },
    });
  }
}
