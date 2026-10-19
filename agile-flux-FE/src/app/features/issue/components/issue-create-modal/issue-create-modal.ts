import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Observable, map, switchMap, of } from 'rxjs';
import { IssueApi } from '../../../../core/api/issue-api';
import { ProjectApi } from '../../../../core/api/project-api';
import { UserApi } from '../../../../core/api/user-api';
import { IssueCreateRequest, IssuePriority, IssueType, User } from '../../../../core/models/api.models';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from '../../../../core/models/display';
import { apiErrorMessage, applyFieldErrors } from '../../../../core/utils/api-error';
import { ProjectContext } from '../../../project/project-context';

@Component({
  selector: 'app-issue-create-modal',
  imports: [
    ReactiveFormsModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzSelectModule,
    NzInputNumberModule,
    NzButtonModule,
    NzIconModule,
  ],
  templateUrl: './issue-create-modal.html',
  styleUrl: './issue-create-modal.scss',
})
export class IssueCreateModalComponent {
  protected ctx = inject(ProjectContext);
  private api = inject(IssueApi);
  private projectApi = inject(ProjectApi);
  private userApi = inject(UserApi);
  private fb = inject(NonNullableFormBuilder);
  private message = inject(NzMessageService);

  readonly types = ISSUE_TYPES;
  readonly priorities = ISSUE_PRIORITIES;
  submitting = signal(false);

  form = this.fb.group({
    type: this.fb.control<IssueType>('task', Validators.required),
    title: ['', [Validators.required, Validators.maxLength(500)]],
    description: [''],
    priority: this.fb.control<IssuePriority>('medium'),
    storyPoints: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(999.9)]),
    dueDate: [''],
    epicId: this.fb.control<string | null>(null),
    sprintId: this.fb.control<string | null>(null),
    parentIssueId: this.fb.control<string | null>(null),
    assigneeId: this.fb.control<string | null>(null),
  });

  private typeValue = toSignal(this.form.controls.type.valueChanges, { initialValue: 'task' });
  isSubTask = computed(() => this.typeValue() === 'sub_task');
  /** Parent hợp lệ: cùng project và không phải sub_task. */
  parentOptions = computed(() => this.ctx.issues().filter((i) => i.type !== 'sub_task'));

  /** Mọi user active trong hệ thống — chọn người ngoài project thì tự thêm vào project khi tạo. */
  private users = signal<User[]>([]);
  private memberIds = computed(() => new Set(this.ctx.members().map((m) => m.userId)));
  nonMembers = computed(() => this.users().filter((u) => !this.memberIds().has(u.id)));

  constructor() {
    effect(() => {
      const draft = this.ctx.issueDraft();
      if (!draft) return;
      untracked(() => {
        this.userApi.list().subscribe({ next: (users) => this.users.set(users) });
        this.form.reset({
          type: draft.type ?? (draft.parentIssueId ? 'sub_task' : 'task'),
          title: '',
          description: '',
          priority: 'medium',
          storyPoints: null,
          dueDate: '',
          epicId: draft.epicId ?? null,
          sprintId: draft.sprintId ?? null,
          parentIssueId: draft.parentIssueId ?? null,
          assigneeId: null,
        });
      });
    });

    // parentIssueId bắt buộc khi type = sub_task và bị cấm với type khác
    this.form.controls.type.valueChanges.subscribe((type) => {
      const parent = this.form.controls.parentIssueId;
      parent.setValidators(type === 'sub_task' ? Validators.required : null);
      if (type !== 'sub_task') parent.setValue(null);
      parent.updateValueAndValidity();
    });
  }

  close(): void {
    this.ctx.issueDraft.set(null);
  }

  submit(): void {
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
    const body: IssueCreateRequest = {
      projectId,
      type: v.type,
      title: v.title.trim(),
      priority: v.priority,
    };
    if (v.description.trim()) body.description = v.description.trim();
    if (v.storyPoints !== null) body.storyPoints = v.storyPoints;
    if (v.dueDate) body.dueDate = v.dueDate;
    if (v.epicId) body.epicId = v.epicId;
    if (v.sprintId) body.sprintId = v.sprintId;
    if (v.assigneeId) body.assigneeId = v.assigneeId;
    // BE chỉ cho giao cho thành viên project → thêm người được chọn vào project trước
    const assigneeToAdd =
      v.assigneeId && !this.memberIds().has(v.assigneeId) ? v.assigneeId : null;
    if (v.type === 'sub_task' && v.parentIssueId) body.parentIssueId = v.parentIssueId;

    // Issue mới luôn ở 'todo'; nếu tạo từ cột khác thì đổi status ngay sau đó.
    const targetStatus = this.ctx.issueDraft()?.status;
    this.submitting.set(true);
    const addMember$: Observable<unknown> = assigneeToAdd
      ? this.projectApi.addMember(projectId, { userId: assigneeToAdd }).pipe(
          map((member) => this.ctx.members.update((list) => [...list, member])),
        )
      : of(null);
    addMember$
      .pipe(
        switchMap(() => this.api.create(body)),
        switchMap((issue) =>
          targetStatus && targetStatus !== 'todo'
            ? this.api.changeStatus(issue.id, targetStatus)
            : of(issue),
        ),
      )
      .subscribe({
        next: (issue) => {
          this.submitting.set(false);
          this.ctx.upsertIssue(issue);
          this.message.success(`Đã tạo ${issue.issueKey}`);
          this.close();
        },
        error: (err) => {
          this.submitting.set(false);
          // Có thể issue đã tạo nhưng đổi status lỗi → tải lại cho chắc
          this.ctx.reloadIssues();
          if (!applyFieldErrors(this.form, err)) this.message.error(apiErrorMessage(err));
        },
      });
  }
}
