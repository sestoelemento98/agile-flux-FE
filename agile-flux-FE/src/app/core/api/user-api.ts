import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChangePasswordRequest, UpdateProfileRequest, User } from '../models/api.models';

/** Mục 6.1 */
@Injectable({ providedIn: 'root' })
export class UserApi {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/users`;

  me(): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/me`);
  }

  updateMe(body: UpdateProfileRequest): Observable<User> {
    return this.http.patch<User>(`${this.baseUrl}/me`, body);
  }

  changePassword(body: ChangePasswordRequest): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/me/password`, body);
  }

  /** Mục 6.1.1 — multipart field "file". Không tự set Content-Type (để trình duyệt thêm boundary). */
  uploadAvatar(file: File): Observable<User> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<User>(`${this.baseUrl}/me/avatar`, fd);
  }

  removeAvatar(): Observable<User> {
    return this.http.delete<User>(`${this.baseUrl}/me/avatar`);
  }

  /** Mọi user đang active, sắp theo fullName. */
  list(): Observable<User[]> {
    return this.http.get<User[]>(this.baseUrl);
  }

  get(id: string): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/${id}`);
  }

  /** Chỉ được khoá chính mình. */
  deactivate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
