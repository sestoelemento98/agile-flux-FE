import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginRequest, LoginResponse, RegisterRequest, User } from '../models/api.models';
import { Websocket } from '../services/websocket';

/** jwtInterceptor và Websocket đọc token ở key này — giữ nguyên. */
export const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const EXPIRES_AT_KEY = 'tokenExpiresAt';

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private ws = inject(Websocket);
  private baseUrl = environment.apiUrl;

  private readonly _user = signal<User | null>(readStoredUser());
  readonly user = this._user.asReadonly();
  readonly userId = computed(() => this._user()?.id ?? null);

  /** Có token và chưa hết hạn (BE chưa có refresh token → hết hạn là phải đăng nhập lại). */
  isLoggedIn(): boolean {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return false;
    const expiresAt = Number(localStorage.getItem(EXPIRES_AT_KEY) ?? 0);
    return !expiresAt || Date.now() < expiresAt;
  }

  login(body: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/auth/login`, body).pipe(
      tap((res) => {
        localStorage.setItem(TOKEN_KEY, res.accessToken);
        localStorage.setItem(EXPIRES_AT_KEY, String(Date.now() + res.expiresIn * 1000));
        this.setUser(res.user);
        this.ws.connect();
      }),
    );
  }

  register(body: RegisterRequest): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/users/register`, body);
  }

  /** Lấy lại thông tin user từ token (gọi khi mở app với token cũ). */
  refreshMe(): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/users/me`).pipe(tap((u) => this.setUser(u)));
  }

  setUser(user: User): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this._user.set(user);
  }

  /** BE stateless — chỉ cần xoá token ở FE. */
  logout(redirect = true): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
    localStorage.removeItem(USER_KEY);
    this._user.set(null);
    this.ws.disconnect();
    if (redirect) {
      this.router.navigate(['/login'], {
        queryParams: { returnUrl: this.router.url.startsWith('/login') ? null : this.router.url },
      });
    }
  }
}
