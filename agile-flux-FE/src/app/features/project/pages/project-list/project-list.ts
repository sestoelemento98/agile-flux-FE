import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ProjectApi } from '../../../../core/api/project-api';
import { Project } from '../../../../core/models/api.models';
import { apiErrorMessage, applyFieldErrors } from '../../../../core/utils/api-error';

type Tab = 'active' | 'archived';

@Component({
  selector: 'app-project-list',
  imports: [
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
    NzButtonModule,
    NzIconModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzSegmentedModule,
    NzEmptyModule,
    NzSpinModule,
    NzTagModule,
  ],
  templateUrl: './project-list.html',
  styleUrl: './project-list.css',
})
export class ProjectListComponent {
  private api = inject(ProjectApi);
  private fb = inject(NonNullableFormBuilder);
  private router = inject(Router);
  private message = inject(NzMessageService);

  projects = signal<Project[]>([]);
  loading = signal(true);
  tab = signal<Tab>('active');
  query = signal('');

  activeCount = computed(() => this.projects().filter((p) => !p.archived).length);
  archivedCount = computed(() => this.projects().filter((p) => p.archived).length);
  tabOptions = computed(() => [
    { label: `Đang hoạt động (${this.activeCount()})`, value: 'active' },
    { label: `Đã archive (${this.archivedCount()})`, value: 'archived' },
  ]);

  /** BE trả cả project đã archive — FE tự lọc. */
  visible = computed(() => {
    const archived = this.tab() === 'archived';
    const q = this.query().trim().toLowerCase();
    return this.projects().filter(
      (p) =>
        p.archived === archived &&
        (!q || p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)),
    );
  });

  // ----- Tạo project -----
  createOpen = signal(false);
  creating = signal(false);
  form = this.fb.group({
    key: ['', [Validators.required, Validators.pattern(/^[A-Z][A-Z0-9]{1,9}$/)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
  });

  constructor() {
    this.load();
    // Key luôn CHỮ HOA (BE regex ^[A-Z][A-Z0-9]{1,9}$)
    this.form.controls.key.valueChanges.subscribe((v) => {
      const upper = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (upper !== v) this.form.controls.key.setValue(upper, { emitEvent: false });
    });
  }

  load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (list) => {
        this.projects.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.message.error(apiErrorMessage(err));
      },
    });
  }

  setTab(value: string | number): void {
    this.tab.set(value as Tab);
  }

  open(project: Project): void {
    this.router.navigate(['/projects', project.id, 'board']);
  }

  openCreate(): void {
    this.form.reset();
    this.createOpen.set(true);
  }

  /** Gợi ý key từ tên: "Agile Flux" → "AF" */
  suggestKey(): void {
    if (this.form.controls.key.value) return;
    const words = this.form.controls.name.value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .split(/\s+/)
      .filter(Boolean);
    let key = words
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (key.length === 1 && words[0]) key = words[0].slice(0, 3).toUpperCase();
    key = key.replace(/^[0-9]+/, '').slice(0, 10);
    if (key.length >= 2) this.form.controls.key.setValue(key);
  }

  create(): void {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((c) => {
        c.markAsDirty();
        c.updateValueAndValidity();
      });
      return;
    }
    const v = this.form.getRawValue();
    this.creating.set(true);
    this.api
      .create({
        key: v.key,
        name: v.name.trim(),
        ...(v.description.trim() ? { description: v.description.trim() } : {}),
      })
      .subscribe({
        next: (project) => {
          this.creating.set(false);
          this.createOpen.set(false);
          this.message.success(`Đã tạo dự án ${project.key}`);
          this.open(project);
        },
        error: (err) => {
          this.creating.set(false);
          if (!applyFieldErrors(this.form, err)) this.message.error(apiErrorMessage(err));
        },
      });
  }

  unarchive(project: Project, event: MouseEvent): void {
    event.stopPropagation();
    this.api.unarchive(project.id).subscribe({
      next: (p) => {
        this.projects.update((list) => list.map((x) => (x.id === p.id ? p : x)));
        this.message.success(`Đã khôi phục ${p.name}`);
      },
      error: (err) => this.message.error(apiErrorMessage(err)),
    });
  }
}
