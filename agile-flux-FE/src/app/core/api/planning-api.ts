import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Epic,
  EpicCreateRequest,
  EpicUpdateRequest,
  Label,
  LabelCreateRequest,
  LabelUpdateRequest,
  Sprint,
  SprintCreateRequest,
  SprintUpdateRequest,
} from '../models/api.models';

/** Mục 6.7 */
@Injectable({ providedIn: 'root' })
export class SprintApi {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/sprints`;

  create(body: SprintCreateRequest): Observable<Sprint> {
    return this.http.post<Sprint>(this.baseUrl, body);
  }

  /** Partial: null = giữ nguyên. Start = status 'active', Complete = 'completed'. */
  update(id: string, body: SprintUpdateRequest): Observable<Sprint> {
    return this.http.patch<Sprint>(`${this.baseUrl}/${id}`, body);
  }

  /** Issue của sprint quay về backlog. */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}

/** Mục 6.8 */
@Injectable({ providedIn: 'root' })
export class EpicApi {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/epics`;

  create(body: EpicCreateRequest): Observable<Epic> {
    return this.http.post<Epic>(this.baseUrl, body);
  }

  update(id: string, body: EpicUpdateRequest): Observable<Epic> {
    return this.http.patch<Epic>(`${this.baseUrl}/${id}`, body);
  }

  /** Còn issue gắn epic → 400. */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}

/** Mục 6.5 */
@Injectable({ providedIn: 'root' })
export class LabelApi {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/labels`;

  create(body: LabelCreateRequest): Observable<Label> {
    return this.http.post<Label>(this.baseUrl, body);
  }

  update(id: string, body: LabelUpdateRequest): Observable<Label> {
    return this.http.patch<Label>(`${this.baseUrl}/${id}`, body);
  }

  /** Tự gỡ khỏi mọi issue. */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
