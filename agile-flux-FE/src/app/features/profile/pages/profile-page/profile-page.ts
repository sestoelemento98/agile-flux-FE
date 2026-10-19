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
import {
  AVATAR_ACCEPT,
  AvatarSrcPipe,
  MAX_AVATAR_SIZE,
  isUploadedAvatar,
} from '../../../../core/utils/avatar';

function samePassword(group: AbstractControl): ValidationErrors | null {
  return group.get('newPassword')?.value === group.get('confirm')?.value
    ? null
    : { mismatch: true };
}

@Component({
  selector: 'app-profile-page',
  imports: [
    DatePipe,
    AvatarSrcPipe,
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
    .avatar-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
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
  avatarBusy = signal(false);

  readonly avatarAccept = AVATAR_ACCEPT;
  readonly isUploadedAvatar = isUploadedAvatar;

  profileForm = this.fb.group({
    fullName: ['', [Validators.required, Validators.maxLength(255)]],
    // Chỉ cho URL ảnh ngoài; ảnh từ máy upload qua POST /users/me/avatar
    avatarUrl: ['', Validators.pattern(/^https?:\/\/\S+$/)],
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
        if (!u) return;
        // Ảnh đã upload ("/api/avatars/...") không đưa vào ô URL — gửi lại sẽ bị 400.
        const externalUrl = u.avatarUrl && !isUploadedAvatar(u.avatarUrl) ? u.avatarUrl : '';
        this.profileForm.reset({ fullName: u.fullName, avatarUrl: externalUrl });
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
    // Field null/không gửi = giữ nguyên. Ô URL trống = giữ ảnh hiện tại (xoá ảnh dùng nút riêng).
    const body: UpdateProfileRequest = { fullName: v.fullName.trim() };
    const url = v.avatarUrl.trim();
    if (url && url !== this.auth.user()?.avatarUrl) body.avatarUrl = url;
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

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // cho phép chọn lại đúng file đó lần sau
    if (!file) return;
    if (!AVATAR_ACCEPT.split(',').includes(file.type)) {
      this.message.error('Chỉ nhận ảnh PNG, JPEG, GIF hoặc WEBP');
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      this.message.error('Ảnh đại diện tối đa 2MB');
      return;
    }
    if (file.size === 0) {
      this.message.error('File rỗng');
      return;
    }
    this.avatarBusy.set(true);
    this.api.uploadAvatar(file).subscribe({
      next: (u) => {
        this.avatarBusy.set(false);
        this.auth.setUser(u);
        this.message.success('Đã cập nhật ảnh đại diện');
      },
      error: (err) => {
        this.avatarBusy.set(false);
        this.message.error(apiErrorMessage(err));
      },
    });
  }

  removeAvatar(): void {
    this.avatarBusy.set(true);
    this.api.removeAvatar().subscribe({
      next: (u) => {
        this.avatarBusy.set(false);
        this.auth.setUser(u);
        this.message.success('Đã xoá ảnh đại diện');
      },
      error: (err) => {
        this.avatarBusy.set(false);
        this.message.error(apiErrorMessage(err));
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
