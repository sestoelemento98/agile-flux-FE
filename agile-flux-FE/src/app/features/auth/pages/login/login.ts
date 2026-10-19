import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormGroup, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth';
import { apiErrorMessage, applyFieldErrors } from '../../../../core/utils/api-error';

type Mode = 'login' | 'register';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent {
  private fb = inject(NonNullableFormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  mode = signal<Mode>('login');
  submitting = signal(false);
  error = signal<string | null>(null);
  info = signal<string | null>(null);

  loginForm = this.fb.group({
    login: ['', Validators.required],
    password: ['', Validators.required],
  });

  registerForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    fullName: ['', [Validators.required, Validators.maxLength(255)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(255)]],
  });

  switchMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set(null);
    this.info.set(null);
  }

  submitLogin(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this.auth.login(this.loginForm.getRawValue()).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/projects';
        this.router.navigateByUrl(returnUrl);
      },
      error: (err) => {
        this.submitting.set(false);
        // Sai mật khẩu / không có tài khoản / bị khoá đều trả 401 "Bad credentials"
        this.error.set(
          err instanceof HttpErrorResponse && err.status === 401
            ? 'Sai tài khoản hoặc mật khẩu'
            : apiErrorMessage(err),
        );
      },
    });
  }

  submitRegister(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    const body = this.registerForm.getRawValue();
    this.auth.register(body).subscribe({
      next: () => {
        this.submitting.set(false);
        this.loginForm.setValue({ login: body.username, password: '' });
        this.registerForm.reset();
        this.switchMode('login');
        this.info.set('Đăng ký thành công, hãy đăng nhập.');
      },
      error: (err) => {
        this.submitting.set(false);
        if (!applyFieldErrors(this.registerForm, err)) this.error.set(apiErrorMessage(err));
      },
    });
  }

  invalid(form: 'login' | 'register', name: string): boolean {
    const group: FormGroup = form === 'login' ? this.loginForm : this.registerForm;
    const c = group.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}
