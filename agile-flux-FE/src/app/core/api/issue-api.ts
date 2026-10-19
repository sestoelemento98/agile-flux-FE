import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActivityLog,
  Attachment,
  Comment,
  Issue,
  IssueCreateRequest,
  IssueStatus,
  IssueUpdateRequest,
  IssueWatcher,
} from '../models/api.models';

/** Giới hạn upload của BE (vượt → 413). */
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

/** Mục 6.4, 6.5 (gắn/gỡ label), 6.6, 6.9, 6.10, 6.11 */
@Injectable({ providedIn: 'root' })
export class IssueApi {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  private baseUrl = `${environment.apiUrl}/issues`;

  create(body: IssueCreateRequest): Observable<Issue> {
    return this.http.post<Issue>(this.baseUrl, body);
  }

  get(id: string): Observable<Issue> {
    return this.http.get<Issue>(`${this.baseUrl}/${id}`);
  }

  /** PUT = thay toàn bộ, dựng body bằng toIssueUpdateRequest(). */
  update(id: string, body: IssueUpdateRequest): Observable<Issue> {
    return this.http.put<Issue>(`${this.baseUrl}/${id}`, body);
  }

  changeStatus(id: string, status: IssueStatus): Observable<Issue> {
    return this.http.patch<Issue>(`${this.baseUrl}/${id}/status`, { status });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  // ----- Label -----
  addLabel(id: string, labelId: string): Observable<Issue> {
    return this.http.post<Issue>(`${this.baseUrl}/${id}/labels/${labelId}`, null);
  }

  removeLabel(id: string, labelId: string): Observable<Issue> {
    return this.http.delete<Issue>(`${this.baseUrl}/${id}/labels/${labelId}`);
  }

  // ----- Watcher (luôn là user hiện tại) -----
  watchers(id: string): Observable<IssueWatcher[]> {
    return this.http.get<IssueWatcher[]>(`${this.baseUrl}/${id}/watchers`);
  }

  watch(id: string): Observable<IssueWatcher[]> {
    return this.http.post<IssueWatcher[]>(`${this.baseUrl}/${id}/watchers`, null);
  }

  unwatch(id: string): Observable<IssueWatcher[]> {
    return this.http.delete<IssueWatcher[]>(`${this.baseUrl}/${id}/watchers`);
  }

  // ----- Comment -----
  comments(issueId: string): Observable<Comment[]> {
    return this.http.get<Comment[]>(`${this.baseUrl}/${issueId}/comments`);
  }

  addComment(issueId: string, content: string): Observable<Comment> {
    return this.http.post<Comment>(`${this.baseUrl}/${issueId}/comments`, { content });
  }

  updateComment(id: string, content: string): Observable<Comment> {
    return this.http.patch<Comment>(`${this.apiUrl}/comments/${id}`, { content });
  }

  deleteComment(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/comments/${id}`);
  }

  // ----- Attachment -----
  attachments(issueId: string): Observable<Attachment[]> {
    return this.http.get<Attachment[]>(`${this.baseUrl}/${issueId}/attachments`);
  }

  /** Không tự set Content-Type — để trình duyệt thêm boundary. */
  upload(issueId: string, file: File): Observable<Attachment> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<Attachment>(`${this.baseUrl}/${issueId}/attachments`, fd);
  }

  /** Download cần Authorization → tải blob qua HttpClient, không dùng <a href> trực tiếp. */
  download(attachment: Attachment): Observable<Blob> {
    return this.http.get(this.resolveDownloadUrl(attachment.downloadUrl), { responseType: 'blob' });
  }

  deleteAttachment(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/attachments/${id}`);
  }

  // ----- Activity -----
  activities(issueId: string, page = 0, size = 50): Observable<ActivityLog[]> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<ActivityLog[]>(`${this.baseUrl}/${issueId}/activities`, { params });
  }

  /**
   * downloadUrl dạng "/api/attachments/{id}/download" (tương đối từ host).
   * environment.apiUrl = "http://localhost:8080/api" (dev) hoặc "/api" (prod)
   * → bỏ hậu tố "/api" để lấy origin của BE.
   */
  private resolveDownloadUrl(downloadUrl: string): string {
    const origin = this.apiUrl.replace(/\/api\/?$/, '');
    return `${origin}${downloadUrl}`;
  }
}
