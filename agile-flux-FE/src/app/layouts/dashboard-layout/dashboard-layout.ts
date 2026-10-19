import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Sidebar, SidebarMenuItem, SidebarProgress } from './sidebar/sidebar';
import { Topbar, TopbarMember, TopbarUser } from './topbar/topbar';
import { AuthService } from '../../core/auth/auth';
import { avatarSrc } from '../../core/utils/avatar';
import { ProjectContext } from '../../features/project/project-context';

@Component({
  selector: 'app-dashboard-layout',
  imports: [RouterOutlet, Sidebar, Topbar],
  templateUrl: './dashboard-layout.html',
  styleUrl: './dashboard-layout.scss',
})
export class DashboardLayoutComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  protected ctx = inject(ProjectContext);

  sidebarCollapsed = signal(false);

  menuItems = computed<SidebarMenuItem[]>(() => {
    const id = this.ctx.projectId();
    const all: SidebarMenuItem = {
      key: 'projects',
      label: 'Tất cả dự án',
      icon: 'folder',
      routerLink: '/projects',
    };
    if (!id) return [all, { key: 'profile', label: 'Hồ sơ', icon: 'user', routerLink: '/profile' }];
    const base = ['/projects', id];
    return [
      { key: 'board', label: 'Bảng kanban', icon: 'home', routerLink: [...base, 'board'] },
      {
        key: 'backlog',
        label: 'Backlog & Sprint',
        icon: 'unordered-list',
        routerLink: [...base, 'backlog'],
      },
      { key: 'epics', label: 'Epic', icon: 'flag', routerLink: [...base, 'epics'] },
      { key: 'labels', label: 'Nhãn', icon: 'tag', routerLink: [...base, 'labels'] },
      {
        key: 'members',
        label: 'Thành viên',
        icon: 'team',
        routerLink: [...base, 'members'],
        badge: this.ctx.members().length || undefined,
      },
      { key: 'activity', label: 'Hoạt động', icon: 'history', routerLink: [...base, 'activity'] },
      { key: 'settings', label: 'Cài đặt', icon: 'setting', routerLink: [...base, 'settings'] },
      all,
    ];
  });

  progress = computed<SidebarProgress | null>(() => {
    if (!this.ctx.project()) return null;
    const p = this.ctx.progress();
    return { percent: p.percent, label: 'Hoàn thành', subLabel: `${p.done}/${p.total} issue` };
  });

  members = computed<TopbarMember[]>(() =>
    this.ctx.members().map((m) => ({ id: m.userId, name: m.userFullName })),
  );

  currentUser = computed<TopbarUser>(() => {
    const u = this.auth.user();
    return { name: u?.fullName ?? 'Bạn', avatarUrl: avatarSrc(u?.avatarUrl) };
  });

  projectName = computed(() => {
    const p = this.ctx.project();
    return p ? `${p.name}` : 'Agile Flux';
  });

  onToggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  onSearch(value: string): void {
    this.ctx.searchText.set(value);
  }

  onProgressClick(): void {
    const id = this.ctx.projectId();
    if (id) this.router.navigate(['/projects', id, 'board']);
  }

  goProfile(): void {
    this.router.navigate(['/profile']);
  }

  logout(): void {
    this.ctx.reset();
    this.auth.logout();
  }
}
