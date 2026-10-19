import { Routes } from '@angular/router';

import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout';
import { DashboardLayoutComponent } from './layouts/dashboard-layout/dashboard-layout';

import { authGuard, guestGuard } from './core/auth/auth-guard';
import { LoginComponent } from './features/auth/pages/login/login';
import { ProjectListComponent } from './features/project/pages/project-list/project-list';
import { ProjectShellComponent } from './features/project/pages/project-shell/project-shell';
import { BoardPageComponent } from './features/board/pages/board-page/board-page';

export const routes: Routes = [
  {
    path: 'login',
    component: AuthLayoutComponent,
    canActivate: [guestGuard],
    children: [
      {
        path: '',
        component: LoginComponent,
      },
    ],
  },

  {
    path: '',
    component: DashboardLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'projects',
        pathMatch: 'full',
      },
      {
        path: 'projects',
        component: ProjectListComponent,
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/pages/profile-page/profile-page').then(
            (m) => m.ProfilePageComponent,
          ),
      },
      {
        path: 'projects/:projectId',
        component: ProjectShellComponent,
        children: [
          { path: '', redirectTo: 'board', pathMatch: 'full' },
          { path: 'board', component: BoardPageComponent },
          {
            path: 'backlog',
            loadComponent: () =>
              import('./features/project/pages/backlog-page/backlog-page').then(
                (m) => m.BacklogPageComponent,
              ),
          },
          {
            path: 'epics',
            loadComponent: () =>
              import('./features/project/pages/epics-page/epics-page').then(
                (m) => m.EpicsPageComponent,
              ),
          },
          {
            path: 'labels',
            loadComponent: () =>
              import('./features/project/pages/labels-page/labels-page').then(
                (m) => m.LabelsPageComponent,
              ),
          },
          {
            path: 'members',
            loadComponent: () =>
              import('./features/project/pages/members-page/members-page').then(
                (m) => m.MembersPageComponent,
              ),
          },
          {
            path: 'activity',
            loadComponent: () =>
              import('./features/project/pages/activity-page/activity-page').then(
                (m) => m.ActivityPageComponent,
              ),
          },
          {
            path: 'settings',
            loadComponent: () =>
              import('./features/project/pages/settings-page/settings-page').then(
                (m) => m.SettingsPageComponent,
              ),
          },
        ],
      },
    ],
  },

  {
    path: '**',
    redirectTo: 'projects',
  },
];
