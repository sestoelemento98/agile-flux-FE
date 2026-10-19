import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../../core/auth/auth';
import { ProjectApi } from '../../../../core/api/project-api';
import { UserApi } from '../../../../core/api/user-api';
import { ProjectMember, ProjectRole, User } from '../../../../core/models/api.models';
import { PROJECT_ROLES } from '../../../../core/models/display';
import { apiErrorMessage } from '../../../../core/utils/api-error';
import { ProjectContext } from '../../project-context';

@Component({
  selector: 'app-members-page',
  imports: [
    DatePipe,
    FormsModule,
    NzTableModule,
    NzButtonModule,
    NzIconModule,
    NzModalModule,
    NzSelectModule,
    NzTagModule,
    NzAvatarModule,
    NzPopconfirmModule,
  ],
  templateUrl: './members-page.html',
  styles: `
    .person {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .role-select {
      width: 140px;
    }
    .full {
      width: 100%;
      margin-bottom: 12px;
    }
  `,
})
export class MembersPageComponent {
  protected ctx = inject(ProjectContext);
  private api = inject(ProjectApi);
  private userApi = inject(UserApi);
  private auth = inject(AuthService);
  private router = inject(Router);
  private message = inject(NzMessageService);

  readonly roles = PROJECT_ROLES;
  readonly meId = this.auth.userId;

  canManage = computed(() => this.ctx.isAdmin() && !this.ctx.readonly());

  isOwner(m: ProjectMember): boolean {
    return m.userId === this.ctx.project()?.ownerId;
  }

  changeRole(m: ProjectMember, role: ProjectRole): void {
    if (m.role === role) return;
    this.api.changeMemberRole(m.projectId, m.userId, role).subscribe({
      next: (updated) => {
        this.ctx.members.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
        this.message.success(`${updated.userFullName} → ${PROJECT_ROLES[updated.role]}`);
      },
      error: (err) => {
        this.ctx.reloadMembers();
        this.message.error(apiErrorMessage(err));
      },
    });
  }

  remove(m: ProjectMember): void {
    const leaving = m.userId === this.meId();
    this.api.removeMember(m.projectId, m.userId).subscribe({
      next: () => {
        if (leaving) {
          this.message.success('Bạn đã rời dự án');
          this.router.navigate(['/projects']);
          return;
        }
        this.ctx.members.update((list) => list.filter((x) => x.id !== m.id));
        this.message.success(`Đã xoá ${m.userFullName} khỏi dự án`);
      },
      error: (err) => this.message.error(apiErrorMessage(err)),
    });
  }

  // ----- Thêm thành viên: chọn từ GET /users, loại người đã có -----
  addOpen = signal(false);
  adding = signal(false);
  users = signal<User[]>([]);
  candidates = computed(() => {
    const existing = new Set(this.ctx.members().map((m) => m.userId));
    return this.users().filter((u) => !existing.has(u.id));
  });
  newUserId: string | null = null;
  newRole: ProjectRole = 'member';

  openAdd(): void {
    this.newUserId = null;
    this.newRole = 'member';
    this.addOpen.set(true);
    this.userApi.list().subscribe({
      next: (list) => this.users.set(list),
      error: (err) => this.message.error(apiErrorMessage(err)),
    });
  }

  add(): void {
    const projectId = this.ctx.projectId();
    if (!projectId || !this.newUserId) return;
    this.adding.set(true);
    this.api.addMember(projectId, { userId: this.newUserId, role: this.newRole }).subscribe({
      next: (m) => {
        this.adding.set(false);
        this.addOpen.set(false);
        this.ctx.members.update((list) => [...list, m]);
        this.message.success(`Đã thêm ${m.userFullName}`);
      },
      error: (err) => {
        this.adding.set(false);
        this.message.error(apiErrorMessage(err));
      },
    });
  }
}
