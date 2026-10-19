import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../../core/auth/auth';
import { IssueApi, MAX_ATTACHMENT_SIZE } from '../../../../core/api/issue-api';
import {
  ActivityLog,
  Attachment,
  Comment,
  Issue,
  IssuePriority,
  IssueStatus,
  IssueType,
  IssueWatcher,
  Label,
  toIssueUpdateRequest,
} from '../../../../core/models/api.models';
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  describeActivity,
  formatFileSize,
  formatLocalDate,
} from '../../../../core/models/display';
import { apiErrorMessage, applyFieldErrors } from '../../../../core/utils/api-error';
import { AvatarSrcPipe } from '../../../../core/utils/avatar';
import { ProjectContext } from '../../../project/project-context';
import {
  IssueTypeIconComponent,
  LabelTagComponent,
  PriorityIconComponent,
  StatusTagComponent,
} from '../issue-icons/issue-icons';

const ACTIVITY_PAGE_SIZE = 50;

@Component({
  selector: 'app-issue-detail-drawer',
  imports: [
    DatePipe,
    AvatarSrcPipe,
    FormsModule,
    ReactiveFormsModule,
    NzDrawerModule,
    NzInputModule,
    NzSelectModule,
    NzInputNumberModule,
    NzButtonModule,
    NzIconModule,
    NzTabsModule,
    NzAvatarModule,
    NzPopconfirmModule,
    NzTooltipModule,
    NzEmptyModule,
    NzSpinModule,
    IssueTypeIconComponent,
    PriorityIconComponent,
    StatusTagComponent,
    LabelTagComponent,
  ],
  templateUrl: './issue-detail-drawer.html',
  styleUrl: './issue-detail-drawer.scss',
})
export class IssueDetailDrawerComponent {
  protected ctx = inject(ProjectContext);
  private api = inject(IssueApi);
  private auth = inject(AuthService);
  private fb = inject(NonNullableFormBuilder);
  private message = inject(NzMessageService);

  readonly statuses = ISSUE_STATUSES;
  readonly types = ISSUE_TYPES;
  readonly priorities = ISSUE_PRIORITIES;
  readonly formatDate = formatLocalDate;
  readonly formatSize = formatFileSize;
  readonly describe = describeActivity;
  readonly meId = this.auth.userId;

  issue = computed(() => this.ctx.findIssue(this.ctx.openIssueId()));
  readonly = this.ctx.readonly;

  // ----- Form sửa (PUT) -----
  form = this.fb.group({
    type: this.fb.control<IssueType>('task', Validators.required),
    title: ['', [Validators.required, Validators.maxLength(500)]],
    description: [''],
    priority: this.fb.control<IssuePriority>('medium', Validators.required),
    storyPoints: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(999.9)]),
    dueDate: [''],
    epicId: this.fb.control<string | null>(null),
    sprintId: this.fb.control<string | null>(null),
    parentIssueId: this.fb.control<string | null>(null),
    assigneeId: this.fb.control<string | null>(null),
  });
  private formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  private formValue = toSignal(this.form.valueChanges);
  dirty = computed(() => {
    this.formValue();
    this.formStatus();
    return this.form.dirty;
  });
  isSubTask = computed(() => (this.formValue()?.type ?? this.issue()?.type) === 'sub_task');
  saving = signal(false);
  statusSaving = signal(false);

  subTasks = computed(() => {
    const id = this.ctx.openIssueId();
    return this.ctx.issues().filter((i) => i.parentIssueId === id);
  });
  parentIssue = computed(() => this.ctx.findIssue(this.issue()?.parentIssueId ?? null));
  parentOptions = computed(() =>
    this.ctx.issues().filter((i) => i.type !== 'sub_task' && i.id !== this.ctx.openIssueId()),
  );
  /** Sprint planned/active + sprint hiện tại (giữ nguyên sprint đã completed vẫn hợp lệ). */
  sprintOptions = computed(() => {
    const current = this.issue()?.sprintId;
    return this.ctx
      .sprints()
      .filter((s) => s.status === 'planned' || s.status === 'active' || s.id === current);
  });
  availableLabels = computed(() => {
    const attached = new Set((this.issue()?.labels ?? []).map((l) => l.id));
    return this.ctx.labels().filter((l) => !attached.has(l.id));
  });
  labelToAdd: string | null = null;

  // ----- Watcher -----
  watchers = signal<IssueWatcher[]>([]);
  watching = computed(() => this.watchers().some((w) => w.userId === this.meId()));

  // ----- Comment -----
  comments = signal<Comment[]>([]);
  commentsLoading = signal(false);
  newComment = '';
  postingComment = signal(false);
  editingCommentId = signal<string | null>(null);
  editingContent = '';

  // ----- Attachment -----
  attachments = signal<Attachment[]>([]);
  uploading = signal(false);

  // ----- Activity -----
  activities = signal<ActivityLog[]>([]);
  activityPage = 0;
  activityHasMore = signal(false);
  activityLoading = signal(false);

  private loadedFor: string | null = null;
  private patchedFor: string | null = null;

  constructor() {
    // Mở issue khác → tải dữ liệu phụ
    effect(() => {
      const id = this.ctx.openIssueId();
      untracked(() => {
        if (id && id !== this.loadedFor) this.loadExtras(id);
        if (!id) this.loadedFor = null;
      });
    });

    // Mở issue khác, hoặc issue thay đổi (REST/WebSocket) khi người dùng chưa sửa gì → đồng bộ form
    effect(() => {
      const issue = this.issue();
      untracked(() => {
        if (issue && (issue.id !== this.patchedFor || !this.form.dirty)) this.patchForm(issue);
      });
    });

    // Đóng drawer nếu issue không còn (bị xoá)
    effect(() => {
      if (this.ctx.openIssueId() && !this.ctx.loading() && !this.issue()) {
        untracked(() => this.ctx.openIssueId.set(null));
      }
    });

    this.form.controls.type.valueChanges.subscribe((type) => {
      const parent = this.form.controls.parentIssueId;
      parent.setValidators(type === 'sub_task' ? Validators.required : null);
      if (type !== 'sub_task') parent.setValue(null);
      parent.updateValueAndValidity({ emitEvent: false });
    });
  }

  close(): void {
    this.ctx.openIssueId.set(null);
  }

  open(issue: Issue): void {
    this.form.markAsPristine();
    this.ctx.openIssue(issue.id);
  }

  // ===== Field =====
  private patchForm(issue: Issue): void {
    this.patchedFor = issue.id;
    this.form.reset(
      {
        type: issue.type,
        title: issue.title,
        description: issue.description ?? '',
        priority: issue.priority,
        storyPoints: issue.storyPoints,
        dueDate: issue.dueDate ?? '',
        epicId: issue.epicId,
        sprintId: issue.sprintId,
        parentIssueId: issue.parentIssueId,
        assigneeId: issue.assigneeId,
      },
      { emitEvent: true },
    );
    if (this.readonly()) this.form.disable({ emitEvent: false });
    else this.form.enable({ emitEvent: false });
  }

  discardChanges(): void {
    const issue = this.issue();
    if (issue) this.patchForm(issue);
  }

  save(): void {
    const issue = this.issue();
    if (!issue) return;
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((c) => {
        c.markAsDirty();
        c.updateValueAndValidity();
      });
      return;
    }
    const v = this.form.getRawValue();
    // PUT = thay toàn bộ: dựng từ issue hiện có rồi ghi đè field trên form
    const body = toIssueUpdateRequest(issue, {
      type: v.type,
      title: v.title.trim(),
      priority: v.priority,
      description: v.description.trim() || null,
      storyPoints: v.storyPoints,
      dueDate: v.dueDate || null,
      epicId: v.epicId,
      sprintId: v.sprintId,
      parentIssueId: v.type === 'sub_task' ? v.parentIssueId : null,
      assigneeId: v.assigneeId,
    });
    this.saving.set(true);
    this.api.update(issue.id, body).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.ctx.upsertIssue(updated);
        this.patchForm(updated);
        this.refreshSideData(updated.id);
        this.message.success('Đã lưu');
      },
      error: (err) => {
        this.saving.set(false);
        if (!applyFieldErrors(this.form, err)) this.message.error(apiErrorMessage(err));
      },
    });
  }

  changeStatus(status: IssueStatus): void {
    const issue = this.issue();
    if (!issue || issue.status === status) return;
    this.statusSaving.set(true);
    this.api.changeStatus(issue.id, status).subscribe({
      next: (updated) => {
        this.statusSaving.set(false);
        this.ctx.upsertIssue(updated);
        this.refreshSideData(updated.id);
      },
      error: (err) => {
        this.statusSaving.set(false);
        this.message.error(apiErrorMessage(err));
      },
    });
  }

  deleteIssue(): void {
    const issue = this.issue();
    if (!issue) return;
    this.api.delete(issue.id).subscribe({
      next: () => {
        this.message.success(`Đã xoá ${issue.issueKey}`);
        this.ctx.removeIssue(issue.id);
      },
      error: (err) => this.message.error(apiErrorMessage(err)),
    });
  }

  addSubTask(): void {
    const issue = this.issue();
    if (!issue) return;
    this.ctx.openCreateIssue({
      type: 'sub_task',
      parentIssueId: issue.id,
      sprintId: issue.sprintId,
      epicId: issue.epicId,
    });
  }

  // ===== Label =====
  addLabel(labelId: string | null): void {
    const issue = this.issue();
    if (!issue || !labelId) return;
    this.api.addLabel(issue.id, labelId).subscribe({
      next: (updated) => {
        this.labelToAdd = null;
        this.ctx.upsertIssue(updated);
        this.refreshSideData(updated.id);
      },
      error: (err) => {
        this.labelToAdd = null;
        this.message.error(apiErrorMessage(err));
      },
    });
  }

  removeLabel(label: Label): void {
    const issue = this.issue();
    if (!issue) return;
    this.api.removeLabel(issue.id, label.id).subscribe({
      next: (updated) => {
        this.ctx.upsertIssue(updated);
        this.refreshSideData(updated.id);
      },
      error: (err) => this.message.error(apiErrorMessage(err)),
    });
  }

  // ===== Watcher =====
  toggleWatch(): void {
    const issue = this.issue();
    if (!issue) return;
    const req = this.watching() ? this.api.unwatch(issue.id) : this.api.watch(issue.id);
    req.subscribe({
      next: (list) => this.watchers.set(list),
      error: (err) => this.message.error(apiErrorMessage(err)),
    });
  }

  // ===== Comment =====
  postComment(): void {
    const issue = this.issue();
    const content = this.newComment.trim();
    if (!issue || !content) return;
    this.postingComment.set(true);
    this.api.addComment(issue.id, content).subscribe({
      next: (c) => {
        this.postingComment.set(false);
        this.newComment = '';
        this.comments.update((list) => [...list, c]);
        this.reloadActivities(issue.id);
      },
      error: (err) => {
        this.postingComment.set(false);
        this.message.error(apiErrorMessage(err));
      },
    });
  }

  startEditComment(c: Comment): void {
    this.editingCommentId.set(c.id);
    this.editingContent = c.content;
  }

  cancelEditComment(): void {
    this.editingCommentId.set(null);
  }

  saveComment(c: Comment): void {
    const content = this.editingContent.trim();
    if (!content) return;
    this.api.updateComment(c.id, content).subscribe({
      next: (updated) => {
        this.editingCommentId.set(null);
        this.comments.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      },
      error: (err) => this.message.error(apiErrorMessage(err)),
    });
  }

  deleteComment(c: Comment): void {
    this.api.deleteComment(c.id).subscribe({
      next: () => {
        this.comments.update((list) => list.filter((x) => x.id !== c.id));
        this.reloadActivities(c.issueId);
      },
      error: (err) => this.message.error(apiErrorMessage(err)),
    });
  }

  /** Chỉ tác giả được sửa; tác giả hoặc admin được xoá. */
  canEditComment(c: Comment): boolean {
    return !this.readonly() && c.authorId === this.meId();
  }

  canDeleteComment(c: Comment): boolean {
    return !this.readonly() && (c.authorId === this.meId() || this.ctx.isAdmin());
  }

  // ===== Attachment =====
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const issue = this.issue();
    if (!file || !issue) return;
    if (file.size === 0) {
      this.message.error('Tệp rỗng');
      return;
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      this.message.error('Tệp vượt quá giới hạn 10MB');
      return;
    }
    this.uploading.set(true);
    this.api.upload(issue.id, file).subscribe({
      next: (a) => {
        this.uploading.set(false);
        this.attachments.update((list) => [...list, a]);
        this.reloadActivities(issue.id);
      },
      error: (err) => {
        this.uploading.set(false);
        this.message.error(apiErrorMessage(err));
      },
    });
  }

  download(a: Attachment): void {
    this.api.download(a).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = a.fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (err) => this.message.error(apiErrorMessage(err, 'Không tải được tệp')),
    });
  }

  deleteAttachment(a: Attachment): void {
    this.api.deleteAttachment(a.id).subscribe({
      next: () => {
        this.attachments.update((list) => list.filter((x) => x.id !== a.id));
        this.reloadActivities(a.issueId);
      },
      error: (err) => this.message.error(apiErrorMessage(err)),
    });
  }

  canDeleteAttachment(a: Attachment): boolean {
    return !this.readonly() && (a.uploaderId === this.meId() || this.ctx.isAdmin());
  }

  // ===== Activity =====
  loadMoreActivities(): void {
    const id = this.ctx.openIssueId();
    if (!id) return;
    this.activityPage++;
    this.fetchActivities(id, this.activityPage, true);
  }

  // ===== Tải dữ liệu =====
  private loadExtras(id: string): void {
    this.loadedFor = id;
    this.form.markAsPristine();
    this.editingCommentId.set(null);
    this.newComment = '';
    this.labelToAdd = null;
    this.comments.set([]);
    this.attachments.set([]);
    this.watchers.set([]);
    this.activities.set([]);

    this.commentsLoading.set(true);
    this.api.comments(id).subscribe({
      next: (list) => {
        if (this.loadedFor !== id) return;
        this.comments.set(list);
        this.commentsLoading.set(false);
      },
      error: () => this.commentsLoading.set(false),
    });
    this.api.attachments(id).subscribe((list) => {
      if (this.loadedFor === id) this.attachments.set(list);
    });
    this.api.watchers(id).subscribe((list) => {
      if (this.loadedFor === id) this.watchers.set(list);
    });
    this.reloadActivities(id);
  }

  /** Sau khi sửa: assignee mới tự thành watcher, activity có dòng mới. */
  private refreshSideData(id: string): void {
    this.api.watchers(id).subscribe((list) => {
      if (this.loadedFor === id) this.watchers.set(list);
    });
    this.reloadActivities(id);
  }

  private reloadActivities(id: string): void {
    this.activityPage = 0;
    this.fetchActivities(id, 0, false);
  }

  private fetchActivities(id: string, page: number, append: boolean): void {
    this.activityLoading.set(true);
    this.api.activities(id, page, ACTIVITY_PAGE_SIZE).subscribe({
      next: (list) => {
        this.activityLoading.set(false);
        if (this.loadedFor !== id) return;
        this.activities.update((cur) => (append ? [...cur, ...list] : list));
        this.activityHasMore.set(list.length === ACTIVITY_PAGE_SIZE);
      },
      error: () => this.activityLoading.set(false),
    });
  }
}
