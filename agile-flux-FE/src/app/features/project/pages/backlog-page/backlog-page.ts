import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { forkJoin, of, switchMap } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzMessageService } from 'ng-zorro-antd/message';
import { IssueApi } from '../../../../core/api/issue-api';
import { SprintApi } from '../../../../core/api/planning-api';
import {
  Epic,
  Issue,
  Sprint,
  SprintStatus,
  toIssueUpdateRequest,
} from '../../../../core/models/api.models';
import { SPRINT_STATUSES, formatLocalDate } from '../../../../core/models/display';
import { apiErrorMessage, applyFieldErrors } from '../../../../core/utils/api-error';
import { ProjectContext } from '../../project-context';
import {
  IssueTypeIconComponent,
  LabelTagComponent,
  PriorityIconComponent,
  StatusTagComponent,
} from '../../../issue/components/issue-icons/issue-icons';

interface SprintGroup {
  sprint: Sprint;
  issues: Issue[];
  points: number;
  done: number;
}

const SPRINT_ORDER: Record<SprintStatus, number> = {
  active: 0,
  planned: 1,
  completed: 2,
  cancelled: 3,
};

function dateRangeValidator(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startDate')?.value;
  const end = group.get('endDate')?.value;
  // So sánh chuỗi "YYYY-MM-DD" là đủ
  return start && end && end < start ? { dateRange: true } : null;
}

@Component({
  selector: 'app-backlog-page',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    ReactiveFormsModule,
    NzButtonModule,
    NzIconModule,
    NzTagModule,
    NzDropdownModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzSelectModule,
    NzCollapseModule,
    NzAlertModule,
    NzTooltipModule,
    IssueTypeIconComponent,
    PriorityIconComponent,
    StatusTagComponent,
    LabelTagComponent,
  ],
  templateUrl: './backlog-page.html',
  styleUrl: './backlog-page.scss',
})
export class BacklogPageComponent {
  protected ctx = inject(ProjectContext);
  private sprintApi = inject(SprintApi);
  private issueApi = inject(IssueApi);
  private fb = inject(NonNullableFormBuilder);
  private message = inject(NzMessageService);
  private modal = inject(NzModalService);

  readonly formatDate = formatLocalDate;

  sprintMeta(status: SprintStatus) {
    return SPRINT_STATUSES[status];
  }

  private filtered = computed(() => this.ctx.issues().filter((i) => this.ctx.matchesSearch(i)));

  private group(sprint: Sprint, issues: Issue[]): SprintGroup {
    const list = issues.filter((i) => i.sprintId === sprint.id);
    return {
      sprint,
      issues: list,
      points: list.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0),
      done: list.filter((i) => i.status === 'done').length,
    };
  }

  openGroups = computed(() => {
    const issues = this.filtered();
    return this.ctx
      .sprints()
      .filter((s) => s.status === 'active' || s.status === 'planned')
      .sort((a, b) => SPRINT_ORDER[a.status] - SPRINT_ORDER[b.status])
      .map((s) => this.group(s, issues));
  });

  closedGroups = computed(() => {
    const issues = this.filtered();
    return this.ctx
      .sprints()
      .filter((s) => s.status === 'completed' || s.status === 'cancelled')
      .map((s) => this.group(s, issues));
  });

  backlog = computed(() => this.filtered().filter((i) => i.sprintId === null));
  backlogPoints = computed(() => this.backlog().reduce((s, i) => s + (i.storyPoints ?? 0), 0));

  epicsById = computed(() => new Map<string, Epic>(this.ctx.epics().map((e) => [e.id, e])));

  // ===== Issue =====
  openIssue(issue: Issue): void {
    this.ctx.openIssue(issue.id);
  }

  addIssue(sprintId: string | null): void {
    this.ctx.openCreateIssue({ sprintId });
  }

  /** Đổi sprint = PUT toàn bộ issue với sprintId mới. */
  moveIssue(issue: Issue, sprintId: string | null): void {
    if (issue.sprintId === sprintId) return;
    this.issueApi.update(issue.id, toIssueUpdateRequest(issue, { sprintId })).subscribe({
      next: (updated) => this.ctx.upsertIssue(updated),
      error: (err) => this.message.error(apiErrorMessage(err)),
    });
  }

  // ===== Sprint form =====
  sprintModalOpen = signal(false);
  editingSprint = signal<Sprint | null>(null);
  savingSprint = signal(false);
  sprintForm = this.fb.group(
    {
      name: ['', [Validators.required, Validators.maxLength(255)]],
      goal: [''],
      startDate: [''],
      endDate: [''],
    },
    { validators: dateRangeValidator },
  );

  openCreateSprint(): void {
    this.editingSprint.set(null);
    const n = this.ctx.sprints().length + 1;
    this.sprintForm.reset({ name: `Sprint ${n}`, goal: '', startDate: '', endDate: '' });
    this.sprintModalOpen.set(true);
  }

  openEditSprint(sprint: Sprint): void {
    this.editingSprint.set(sprint);
    this.sprintForm.reset({
      name: sprint.name,
      goal: sprint.goal ?? '',
      startDate: sprint.startDate ?? '',
      endDate: sprint.endDate ?? '',
    });
    this.sprintModalOpen.set(true);
  }

  saveSprint(): void {
    const projectId = this.ctx.projectId();
    if (!projectId) return;
    if (this.sprintForm.invalid) {
      Object.values(this.sprintForm.controls).forEach((c) => {
        c.markAsDirty();
        c.updateValueAndValidity();
      });
      return;
    }
    const v = this.sprintForm.getRawValue();
    // Bỏ field rỗng: BE coi null = giữ nguyên, không xoá được về null
    const body = {
      name: v.name.trim(),
      ...(v.goal.trim() ? { goal: v.goal.trim() } : {}),
      ...(v.startDate ? { startDate: v.startDate } : {}),
      ...(v.endDate ? { endDate: v.endDate } : {}),
    };
    const editing = this.editingSprint();
    const req = editing
      ? this.sprintApi.update(editing.id, body)
      : this.sprintApi.create({ projectId, ...body });
    this.savingSprint.set(true);
    req.subscribe({
      next: (s) => {
        this.savingSprint.set(false);
        this.sprintModalOpen.set(false);
        this.ctx.reloadSprints();
        this.message.success(editing ? 'Đã cập nhật sprint' : `Đã tạo ${s.name}`);
      },
      error: (err) => {
        this.savingSprint.set(false);
        if (!applyFieldErrors(this.sprintForm, err)) this.message.error(apiErrorMessage(err));
      },
    });
  }

  // ===== Vòng đời sprint =====
  startSprint(sprint: Sprint): void {
    // Mỗi project tối đa 1 sprint active — BE trả 400 nếu đã có
    this.setSprintStatus(sprint, 'active', `Đã bắt đầu ${sprint.name}`);
  }

  cancelSprint(sprint: Sprint): void {
    this.modal.confirm({
      nzTitle: `Huỷ ${sprint.name}?`,
      nzOkText: 'Huỷ sprint',
      nzCancelText: 'Không',
      nzOnOk: () => this.setSprintStatus(sprint, 'cancelled', `Đã huỷ ${sprint.name}`),
    });
  }

  deleteSprint(sprint: Sprint): void {
    this.modal.confirm({
      nzTitle: `Xoá ${sprint.name}?`,
      nzContent: 'Issue của sprint sẽ quay về backlog, không bị mất.',
      nzOkText: 'Xoá',
      nzOkDanger: true,
      nzCancelText: 'Không',
      nzOnOk: () =>
        this.sprintApi.delete(sprint.id).subscribe({
          next: () => {
            this.message.success(`Đã xoá ${sprint.name}, issue đã về backlog`);
            this.ctx.reloadSprints();
            this.ctx.reloadIssues();
          },
          error: (err) => this.message.error(apiErrorMessage(err)),
        }),
    });
  }

  private setSprintStatus(sprint: Sprint, status: SprintStatus, success: string): void {
    this.sprintApi.update(sprint.id, { status }).subscribe({
      next: (updated) => {
        this.ctx.sprints.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
        this.message.success(success);
      },
      error: (err) => this.message.error(apiErrorMessage(err)),
    });
  }

  // ===== Hoàn thành sprint =====
  completing = signal<SprintGroup | null>(null);
  /** null = backlog */
  moveUnfinishedTo: string | null = null;
  completingBusy = signal(false);

  unfinished = computed(() => (this.completing()?.issues ?? []).filter((i) => i.status !== 'done'));
  completeTargets = computed(() =>
    this.ctx
      .sprints()
      .filter((s) => s.status === 'planned' && s.id !== this.completing()?.sprint.id),
  );

  openComplete(group: SprintGroup): void {
    // Dùng toàn bộ issue của sprint (không áp dụng ô tìm kiếm)
    this.completing.set(this.group(group.sprint, this.ctx.issues()));
    this.moveUnfinishedTo = null;
  }

  /** BE không tự chuyển issue chưa xong → FE PUT từng issue rồi mới complete sprint. */
  confirmComplete(): void {
    const group = this.completing();
    if (!group) return;
    const target = this.moveUnfinishedTo;
    const moves = this.unfinished().map((i) =>
      this.issueApi.update(i.id, toIssueUpdateRequest(i, { sprintId: target })),
    );
    this.completingBusy.set(true);
    (moves.length ? forkJoin(moves) : of([]))
      .pipe(switchMap(() => this.sprintApi.update(group.sprint.id, { status: 'completed' })))
      .subscribe({
        next: () => {
          this.completingBusy.set(false);
          this.completing.set(null);
          this.ctx.reloadSprints();
          this.ctx.reloadIssues();
          this.message.success(`Đã hoàn thành ${group.sprint.name}`);
        },
        error: (err) => {
          this.completingBusy.set(false);
          this.ctx.reloadIssues();
          this.message.error(apiErrorMessage(err));
        },
      });
  }
}
