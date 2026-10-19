import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActivityLog,
  Epic,
  Issue,
  Label,
  MemberAddRequest,
  Project,
  ProjectCreateRequest,
  ProjectMember,
  ProjectRole,
  ProjectUpdateRequest,
  Sprint,
} from '../models/api.models';

/** Mục 6.2, 6.3 và các danh sách theo project (issues, labels, sprints, epics, activities). */
@Injectable({ providedIn: 'root' })
export class ProjectApi {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/projects`;

  create(body: ProjectCreateRequest): Observable<Project> {
    return this.http.post<Project>(this.baseUrl, body);
  }

  /** Gồm cả project đã archive — FE tự lọc theo `archived`. */
  list(): Observable<Project[]> {
    return this.http.get<Project[]>(this.baseUrl);
  }

  get(id: string): Observable<Project> {
    return this.http.get<Project>(`${this.baseUrl}/${id}`);
  }

  update(id: string, body: ProjectUpdateRequest): Observable<Project> {
    return this.http.patch<Project>(`${this.baseUrl}/${id}`, body);
  }

  /** Soft delete. */
  archive(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  unarchive(id: string): Observable<Project> {
    return this.http.post<Project>(`${this.baseUrl}/${id}/unarchive`, null);
  }

  // ----- Thành viên (URL dùng userId) -----
  members(projectId: string): Observable<ProjectMember[]> {
    return this.http.get<ProjectMember[]>(`${this.baseUrl}/${projectId}/members`);
  }

  addMember(projectId: string, body: MemberAddRequest): Observable<ProjectMember> {
    return this.http.post<ProjectMember>(`${this.baseUrl}/${projectId}/members`, body);
  }

  changeMemberRole(
    projectId: string,
    userId: string,
    role: ProjectRole,
  ): Observable<ProjectMember> {
    return this.http.patch<ProjectMember>(`${this.baseUrl}/${projectId}/members/${userId}`, {
      role,
    });
  }

  removeMember(projectId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${projectId}/members/${userId}`);
  }

  // ----- Danh sách con -----
  issues(projectId: string): Observable<Issue[]> {
    return this.http.get<Issue[]>(`${this.baseUrl}/${projectId}/issues`);
  }

  labels(projectId: string): Observable<Label[]> {
    return this.http.get<Label[]>(`${this.baseUrl}/${projectId}/labels`);
  }

  sprints(projectId: string): Observable<Sprint[]> {
    return this.http.get<Sprint[]>(`${this.baseUrl}/${projectId}/sprints`);
  }

  epics(projectId: string): Observable<Epic[]> {
    return this.http.get<Epic[]>(`${this.baseUrl}/${projectId}/epics`);
  }

  /** Mới nhất trước. Hết dữ liệu khi trả về ít hơn `size`. */
  activities(projectId: string, page = 0, size = 50): Observable<ActivityLog[]> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<ActivityLog[]>(`${this.baseUrl}/${projectId}/activities`, { params });
  }
}
