import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription, forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth';
import { ProjectApi } from '../../core/api/project-api';
import {
  Epic,
  Issue,
  IssueStatus,
  IssueType,
  Label,
  Project,
  ProjectMember,
  Sprint,
} from '../../core/models/api.models';
import { Websocket } from '../../core/services/websocket';
import { apiErrorMessage } from '../../core/utils/api-error';

/** Giá trị mặc định khi mở form tạo issue. */
export interface IssueDraft {
  type?: IssueType;
  status?: IssueStatus;
  sprintId?: string | null;
  epicId?: string | null;
  parentIssueId?: string;
}

/**
 * Trạng thái dùng chung của project đang mở (mục 11.3):
 * tải song song project/members/sprints/epics/labels/issues và nghe WebSocket board.
 */
@Injectable({ providedIn: 'root' })
export class ProjectContext {
  private api = inject(ProjectApi);
  private auth = inject(AuthService);
  private ws = inject(Websocket);

  readonly projectId = signal<string | null>(null);
  readonly project = signal<Project | null>(null);
  readonly members = signal<ProjectMember[]>([]);
  readonly sprints = signal<Sprint[]>([]);
  readonly epics = signal<Epic[]>([]);
  readonly labels = signal<Label[]>([]);
  readonly issues = signal<Issue[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** Ô tìm kiếm ở topbar — lọc phía FE (BE chưa có API tìm kiếm). */
  readonly searchText = signal('');
  /** Issue đang mở trong drawer chi tiết. */
  readonly openIssueId = signal<string | null>(null);
  /** Khác null = đang mở form tạo issue. */
  readonly issueDraft = signal<IssueDraft | null>(null);

  readonly myMembership = computed(() =>
    this.members().find((m) => m.userId === this.auth.userId()),
  );
  readonly isOwner = computed(() => this.project()?.ownerId === this.auth.userId());
  readonly isAdmin = computed(() => this.isOwner() || this.myMembership()?.role === 'admin');
  /** Project đã archive = chỉ đọc. */
  readonly readonly = computed(() => this.project()?.archived ?? false);

  readonly activeSprint = computed(() => this.sprints().find((s) => s.status === 'active') ?? null);
  /** Sprint còn nhận issue (BE chỉ cho đưa issue vào sprint planned/active). */
  readonly openSprints = computed(() =>
    this.sprints().filter((s) => s.status === 'planned' || s.status === 'active'),
  );
  readonly progress = computed(() => {
    const all = this.issues();
    const done = all.filter((i) => i.status === 'done').length;
    return {
      done,
      total: all.length,
      percent: all.length ? Math.round((done / all.length) * 100) : 0,
    };
  });

  private wsSub?: Subscription;
  private wsTopic?: string;

  load(projectId: string): void {
    if (this.projectId() !== projectId) {
      this.reset();
      this.projectId.set(projectId);
    }
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      project: this.api.get(projectId),
      members: this.api.members(projectId),
      sprints: this.api.sprints(projectId),
      epics: this.api.epics(projectId),
      labels: this.api.labels(projectId),
      issues: this.api.issues(projectId),
    }).subscribe({
      next: (res) => {
        if (this.projectId() !== projectId) return;
        this.project.set(res.project);
        this.members.set(res.members);
        this.sprints.set(res.sprints);
        this.epics.set(res.epics);
        this.labels.set(res.labels);
        this.issues.set(res.issues);
        this.loading.set(false);
        this.listenBoard(projectId);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, 'Không tải được project'));
      },
    });
  }

  reset(): void {
    this.stopListening();
    this.projectId.set(null);
    this.project.set(null);
    this.members.set([]);
    this.sprints.set([]);
    this.epics.set([]);
    this.labels.set([]);
    this.issues.set([]);
    this.searchText.set('');
    this.openIssueId.set(null);
    this.issueDraft.set(null);
    this.error.set(null);
  }

  // ----- Refetch từng phần (sau khi chính mình tạo/xoá — BE chưa broadcast các thao tác này) -----
  reloadIssues(): void {
    const id = this.projectId();
    if (id) this.api.issues(id).subscribe((list) => this.issues.set(list));
  }

  reloadSprints(): void {
    const id = this.projectId();
    if (id) this.api.sprints(id).subscribe((list) => this.sprints.set(list));
  }

  reloadEpics(): void {
    const id = this.projectId();
    if (id) this.api.epics(id).subscribe((list) => this.epics.set(list));
  }

  reloadLabels(): void {
    const id = this.projectId();
    if (id) this.api.labels(id).subscribe((list) => this.labels.set(list));
  }

  reloadMembers(): void {
    const id = this.projectId();
    if (id) this.api.members(id).subscribe((list) => this.members.set(list));
  }

  // ----- Cập nhật cục bộ -----
  /** Thay thế theo id (idempotent) — dùng cho cả response REST và message WebSocket. */
  upsertIssue(issue: Issue): void {
    if (issue.projectId !== this.projectId()) return;
    this.issues.update((list) => {
      const idx = list.findIndex((i) => i.id === issue.id);
      if (idx === -1) return [...list, issue].sort((a, b) => a.issueNumber - b.issueNumber);
      const next = [...list];
      next[idx] = issue;
      return next;
    });
  }

  removeIssue(id: string): void {
    this.issues.update((list) => list.filter((i) => i.id !== id));
    if (this.openIssueId() === id) this.openIssueId.set(null);
  }

  findIssue(id: string | null): Issue | undefined {
    return id ? this.issues().find((i) => i.id === id) : undefined;
  }

  // ----- Điều hướng UI -----
  openIssue(id: string): void {
    this.openIssueId.set(id);
  }

  openCreateIssue(draft: IssueDraft = {}): void {
    this.issueDraft.set(draft);
  }

  /** Lọc issue theo ô tìm kiếm ở topbar (issueKey, tiêu đề, người thực hiện). */
  matchesSearch(issue: Issue): boolean {
    const q = this.searchText().trim().toLowerCase();
    if (!q) return true;
    return (
      issue.issueKey.toLowerCase().includes(q) ||
      issue.title.toLowerCase().includes(q) ||
      (issue.assigneeName ?? '').toLowerCase().includes(q)
    );
  }

  private listenBoard(projectId: string): void {
    const topic = `/topic/projects/${projectId}/board`;
    if (this.wsTopic === topic) return;
    this.stopListening();
    this.ws.connect();
    this.wsTopic = topic;
    this.wsSub = this.ws.subscribe<Issue>(topic).subscribe((issue) => this.upsertIssue(issue));
  }

  private stopListening(): void {
    this.wsSub?.unsubscribe();
    this.wsSub = undefined;
    if (this.wsTopic) this.ws.unsubscribe(this.wsTopic);
    this.wsTopic = undefined;
  }
}
