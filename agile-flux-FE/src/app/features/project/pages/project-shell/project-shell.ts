import { Component, OnDestroy, effect, inject, input, untracked } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NzResultModule } from 'ng-zorro-antd/result';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { ProjectContext } from '../../project-context';
import { IssueCreateModalComponent } from '../../../issue/components/issue-create-modal/issue-create-modal';
import { IssueDetailDrawerComponent } from '../../../issue/components/issue-detail-drawer/issue-detail-drawer';

/**
 * Vỏ của mọi trang trong 1 project: tải ProjectContext theo :projectId,
 * và giữ 1 drawer chi tiết issue + 1 modal tạo issue dùng chung.
 */
@Component({
  selector: 'app-project-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    NzResultModule,
    NzButtonModule,
    NzSpinModule,
    IssueCreateModalComponent,
    IssueDetailDrawerComponent,
  ],
  template: `
    @if (ctx.error(); as error) {
      <nz-result nzStatus="warning" nzTitle="Không mở được project" [nzSubTitle]="error">
        <div nz-result-extra>
          <button nz-button nzType="primary" routerLink="/projects">Về danh sách project</button>
        </div>
      </nz-result>
    } @else if (!ctx.project()) {
      <div class="shell-loading"><nz-spin nzSimple></nz-spin></div>
    } @else {
      <router-outlet />
      <app-issue-detail-drawer />
      <app-issue-create-modal />
    }
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .shell-loading {
      display: flex;
      justify-content: center;
      padding: 80px 0;
    }
  `,
})
export class ProjectShellComponent implements OnDestroy {
  protected ctx = inject(ProjectContext);
  /** Từ route param (withComponentInputBinding) */
  projectId = input.required<string>();

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => this.ctx.load(id));
    });
  }

  ngOnDestroy(): void {
    this.ctx.reset();
  }
}
