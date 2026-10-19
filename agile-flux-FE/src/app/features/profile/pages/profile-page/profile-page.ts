import { DatePipe } from '@angular/common';
import { Component, effect, inject, signal, untracked } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../../core/auth/auth';
import { UserApi } from '../../../../core/api/user-api';
import { UpdateProfileRequest } from '../../../../core/models/api.models';
import { apiErrorMessage, applyFieldErrors } from '../../../../core/utils/api-error';

function samePassword(group: AbstractControl): ValidationErrors | null {
  return group.get('newPassword')?.value === group.get('confirm')?.value
    ? null
    : { mismatch: true };
}

@Component({
  selector: 'app-profile-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzAvatarModule,
    NzIconModule,
    NzPopconfirmModule,
  ],
  templateUrl: './profile-page.html',
  styles: `
    .profile {
      max-width: 640px;
    }
    .who {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
    }
    .who h3 {
      margin: 0;
    }
    h3 {
      margin: 0 0 16px;
    }
    .danger {
      border-color: #fecdca;
    }
    .danger-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .form-error {
      margin: -8px 0 12px;
      color: #d92d20;
      font-size: 12px;
    }
  `,
})
export class ProfilePageComponent {
  protected auth = inject(AuthService);
  private api = inject(UserApi);
  private fb = inject(NonNullableFormBuilder);
  private message = inject(NzMessageService);

  savingProfile = signal(false);
  savingPassword = signal(false);

  profileForm = this.fb.group({
    fullName: ['', [Validators.required, Validators.maxLength(255)]],
    avatarUrl: [''],
  });

  passwordForm = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(255)]],
      confirm: ['', Validators.required],
    },
    { validators: samePassword },
  );

  constructor() {
    effect(() => {
      const u = this.auth.user();
      untracked(() => {
        if (u) this.profileForm.reset({ fullName: u.fullName, avatarUrl: u.avatarUrl ?? '' });
      });
    });
  }

  saveProfile(): void {
    if (this.profileForm.invalid) {
      Object.values(this.profileForm.controls).forEach((c) => {
        c.markAsDirty();
        c.updateValueAndValidity();
      });
      return;
    }
    const v = this.profileForm.getRawValue();
    // Field null/không gửi = giữ nguyên. BE không có API upload avatar, chỉ nhận URL.
    const body: UpdateProfileRequest = { fullName: v.fullName.trim() };
    if (v.avatarUrl.trim()) body.avatarUrl = v.avatarUrl.trim();
    this.savingProfile.set(true);
    this.api.updateMe(body).subscribe({
      next: (u) => {
        this.savingProfile.set(false);
        this.auth.setUser(u);
        this.message.success('Đã cập nhật hồ sơ');
      },
      error: (err) => {
        this.savingProfile.set(false);
        if (!applyFieldErrors(this.profileForm, err)) this.message.error(apiErrorMessage(err));
      },
    });
  }

  changePassword(): void {
    if (this.passwordForm.invalid) {
      Object.values(this.passwordForm.controls).forEach((c) => {
        c.markAsDirty();
        c.updateValueAndValidity();
      });
      return;
    }
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.savingPassword.set(true);
    this.api.changePassword({ currentPassword, newPassword }).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.passwordForm.reset();
        this.message.success('Đã đổi mật khẩu');
      },
      error: (err) => {
        this.savingPassword.set(false);
        // Sai mật khẩu hiện tại → 400 "Mật khẩu hiện tại không đúng"
        if (!applyFieldErrors(this.passwordForm, err)) this.message.error(apiErrorMessage(err));
      },
    });
  }

  deactivate(): void {
    const id = this.auth.userId();
    if (!id) return;
    this.api.deactivate(id).subscribe({
      next: () => {
        this.message.success('Tài khoản đã bị khoá');
        this.auth.logout();
      },
      error: (err) => this.message.error(apiErrorMessage(err)),
    });
  }
}
