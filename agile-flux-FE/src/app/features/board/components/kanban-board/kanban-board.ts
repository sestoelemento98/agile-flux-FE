import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, CdkDragMove, CdkDragStart, DragDropModule } from '@angular/cdk/drag-drop';
import { finalize } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzMessageService } from 'ng-zorro-antd/message';
import { KanbanColumnComponent } from '../kanban-column/kanban-column';
import { KanbanCardComponent } from '../task-card/task-card';
import { BoardColumn } from '../../models/board-column.model';
import { IssueApi } from '../../../../core/api/issue-api';
import {
  BoardDragEvent,
  Epic,
  Issue,
  IssueStatus,
  IssueType,
} from '../../../../core/models/api.models';
import { ISSUE_STATUSES, ISSUE_TYPES, formatLocalDate } from '../../../../core/models/display';
import { Websocket } from '../../../../core/services/websocket';
import { AuthService } from '../../../../core/auth/auth';
import { apiErrorMessage } from '../../../../core/utils/api-error';
import { AvatarSrcPipe } from '../../../../core/utils/avatar';
import { ProjectContext } from '../../../project/project-context';
import { BoardDrag, DragPosition } from '../../services/board-drag';

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
    KanbanCardComponent,
    AvatarSrcPipe,
  ],
  templateUrl: './kanban-board.html',
  styleUrls: ['./kanban-board.scss'],
})
export class KanbanBoardComponent implements OnDestroy {
  protected ctx = inject(ProjectContext);
  protected drag = inject(BoardDrag);
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

  // ----- Kéo thả realtime (mục 8.3) -----
  /** Vùng nội dung board (phần tử bao 4 cột, có cuộn ngang) — gốc của toạ độ x, y */
  private columnsEl = viewChild.required<ElementRef<HTMLElement>>('columnsEl');
  /** Token lượt kéo của mình + vị trí card lúc bắt đầu kéo */
  private dragToken: number | null = null;
  private dragStartRect: DOMRect | null = null;

  /** Lượt kéo của người khác có issue đã tải → vẽ bản sao card */
  remoteGhosts = computed(() =>
    this.drag.remoteDrags().flatMap((d) => {
      const issue = this.ctx.findIssue(d.issueId);
      return issue && d.x !== null && d.y !== null
        ? [{ key: `${d.userId}:${d.issueId}`, drag: d, issue }]
        : [];
    }),
  );

  /** Cột → màu người khác đang kéo card lơ lửng trên cột đó */
  remoteOverColors = computed(() => {
    const map = new Map<IssueStatus, string>();
    for (const d of this.drag.remoteDrags()) {
      if (d.overStatus && !map.has(d.overStatus)) map.set(d.overStatus, d.color);
    }
    return map;
  });

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

  onDragStarted(event: CdkDragStart<Issue>): void {
    const issue = event.source.data;
    // Placeholder nằm đúng chỗ card gốc, cùng kích thước
    this.dragStartRect = event.source.getPlaceholderElement().getBoundingClientRect();
    this.dragToken = this.drag.start(
      issue.id,
      this.toBoardPosition(this.dragStartRect.left, this.dragStartRect.top, issue.status),
    );
  }

  onDragMoved(event: CdkDragMove<Issue>): void {
    const rect = this.dragStartRect;
    if (!rect) return;
    // Preview của CDK đi theo con trỏ → góc card = vị trí ban đầu + quãng chuột đã đi
    this.drag.move(
      this.toBoardPosition(
        rect.left + event.distance.x,
        rect.top + event.distance.y,
        this.statusAt(event.pointerPosition),
      ),
    );
  }

  /**
   * Kéo sang cột khác: cập nhật UI lạc quan → PATCH /issues/{id}/status → lỗi thì hoàn tác.
   * Kéo trong cùng cột: BE không lưu thứ tự → không gọi API.
   * Thả ra ngoài mọi cột: huỷ.
   * Realtime: gửi `end` SAU khi PATCH xong để người xem thấy card thật sang cột mới trước
   * khi bản sao biến mất (mục 8.3).
   */
  onCardDrop(event: CdkDragDrop<Issue[]>, target: BoardColumn): void {
    const token = this.dragToken;
    this.dragToken = null;
    this.dragStartRect = null;
    const original = event.item.data as Issue;

    if (!event.isPointerOverContainer) {
      this.drag.cancel(token);
      return;
    }
    if (event.previousContainer === event.container || original.status === target.key) {
      this.drag.end(token);
      return;
    }

    this.ctx.upsertIssue({ ...original, status: target.key });
    this.issueApi
      .changeStatus(original.id, target.key)
      .pipe(finalize(() => this.drag.end(token)))
      .subscribe({
        next: (updated) => this.ctx.upsertIssue(updated),
        error: (err) => {
          this.ctx.upsertIssue(original);
          this.message.error(apiErrorMessage(err, 'Không đổi được trạng thái'));
        },
      });
  }

  /**
   * Vị trí bản sao card trong overlay. Overlay phủ khung nhìn của vùng cột (không cuộn theo)
   * nên trừ scroll hiện tại; đọc kích thước mỗi lần vẽ (message đến ~20 lần/giây).
   */
  ghostTransform(d: BoardDragEvent): string {
    const el = this.columnsEl().nativeElement;
    const left = (d.x ?? 0) * el.scrollWidth - el.scrollLeft;
    const top = (d.y ?? 0) * el.scrollHeight - el.scrollTop;
    return `translate(${left}px, ${top}px)`;
  }

  /** Chiều rộng card trên màn hình NGƯỜI XEM (không dùng kích thước của người kéo). */
  ghostWidth(): number {
    return (
      this.columnsEl().nativeElement.querySelector('.af-kanban-column__list')?.clientWidth ?? 272
    );
  }

  ngOnDestroy(): void {
    // Rời board giữa lúc kéo
    this.drag.cancel(this.dragToken);
  }

  private toBoardPosition(
    cardLeft: number,
    cardTop: number,
    overStatus: IssueStatus | null,
  ): DragPosition {
    const el = this.columnsEl().nativeElement;
    const b = el.getBoundingClientRect();
    return {
      x: (cardLeft - b.left + el.scrollLeft) / el.scrollWidth,
      y: (cardTop - b.top + el.scrollTop) / el.scrollHeight,
      overStatus,
    };
  }

  /** Cột dưới con trỏ (preview của CDK có pointer-events: none nên không chắn). */
  private statusAt(point: { x: number; y: number }): IssueStatus | null {
    const col = document
      .elementFromPoint(point.x, point.y)
      ?.closest<HTMLElement>('[data-af-status]');
    return (col?.dataset['afStatus'] as IssueStatus | undefined) ?? null;
  }
}
