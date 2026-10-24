/**
 * Kiểu dữ liệu khớp 1-1 với BE-API-CONTRACT.md (mục 4, 5, 6, 9).
 * Không đổi tên field / giá trị enum ở đây nếu BE chưa đổi.
 */

// ===== Enum (mục 4) =====
export type IssueType = 'task' | 'story' | 'bug' | 'sub_task';
export type IssueStatus = 'todo' | 'in_progress' | 'testing' | 'done';
export type IssuePriority = 'lowest' | 'low' | 'medium' | 'high' | 'highest';
export type SprintStatus = 'planned' | 'active' | 'completed' | 'cancelled';
export type ProjectRole = 'admin' | 'member';
export type ActivityAction =
  | 'issue_created'
  | 'issue_updated'
  | 'issue_status_changed'
  | 'issue_deleted'
  | 'label_added'
  | 'label_removed'
  | 'comment_added'
  | 'comment_deleted'
  | 'attachment_added'
  | 'attachment_deleted'
  | 'sprint_created'
  | 'sprint_status_changed'
  | 'sprint_deleted'
  | 'member_added'
  | 'member_role_changed'
  | 'member_removed';

// ===== Response (mục 5) =====
export interface User {
  id: string;
  email: string;
  username: string;
  fullName: string;
  /** "/api/avatars/<uuid>.png" (ảnh upload) | "https://..." (URL ngoài) | null — hiển thị qua avatarSrc() */
  avatarUrl: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: User;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string | null;
  archived: boolean;
  ownerId: string;
  ownerName: string;
  /** response dùng leaderId/leaderName, request dùng leadId */
  leaderId: string | null;
  leaderName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  userFullName: string;
  userEmail: string;
  role: ProjectRole;
  createdAt: string;
  updatedAt: string;
}

export interface Label {
  id: string;
  projectId: string;
  name: string;
  /** "#RRGGBB" */
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface Issue {
  id: string;
  projectId: string;
  issueKey: string;
  issueNumber: number;
  epicId: string | null;
  sprintId: string | null;
  parentIssueId: string | null;
  type: IssueType;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  storyPoints: number | null;
  reporterId: string;
  reporterName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  /** "YYYY-MM-DD" — giữ nguyên chuỗi, không parse qua Date */
  dueDate: string | null;
  labels: Label[];
  createdAt: string;
  updatedAt: string;
}

export interface IssueWatcher {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Epic {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  issueId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  content: string;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  issueId: string;
  uploaderId: string;
  uploaderName: string;
  fileName: string;
  contentType: string | null;
  fileSize: number;
  /** "/api/attachments/{id}/download" — tương đối từ host */
  downloadUrl: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  projectId: string;
  issueId: string | null;
  issueKey: string | null;
  actorId: string;
  actorName: string;
  action: ActivityAction;
  details: string | null;
  createdAt: string;
}

// ===== Request (mục 6) =====
export interface RegisterRequest {
  email: string;
  username: string;
  fullName: string;
  password: string;
}

export interface LoginRequest {
  /** email HOẶC username */
  login: string;
  password: string;
}

export interface UpdateProfileRequest {
  fullName?: string;
  /** Chỉ URL ngoài (http/https). Upload ảnh từ máy dùng POST /users/me/avatar */
  avatarUrl?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ProjectCreateRequest {
  key: string;
  name: string;
  description?: string;
  leadId?: string;
}

export interface ProjectUpdateRequest {
  name?: string;
  description?: string;
  leadId?: string;
  clearLead?: boolean;
}

export interface MemberAddRequest {
  userId: string;
  role?: ProjectRole;
}

export interface IssueCreateRequest {
  projectId: string;
  type: IssueType;
  title: string;
  description?: string;
  priority?: IssuePriority;
  storyPoints?: number;
  dueDate?: string;
  epicId?: string;
  sprintId?: string;
  parentIssueId?: string;
  assigneeId?: string;
}

/** PUT = thay toàn bộ. Dựng bằng toIssueUpdateRequest() để không vô tình xoá field. */
export interface IssueUpdateRequest {
  type: IssueType;
  title: string;
  priority: IssuePriority;
  description: string | null;
  storyPoints: number | null;
  dueDate: string | null;
  epicId: string | null;
  sprintId: string | null;
  parentIssueId: string | null;
  assigneeId: string | null;
}

export interface LabelCreateRequest {
  projectId: string;
  name: string;
  color?: string;
}

export interface LabelUpdateRequest {
  name?: string;
  color?: string;
}

export interface SprintCreateRequest {
  projectId: string;
  name: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
}

export interface SprintUpdateRequest {
  name?: string;
  goal?: string;
  status?: SprintStatus;
  startDate?: string;
  endDate?: string;
}

export interface EpicCreateRequest {
  projectId: string;
  name: string;
  description?: string;
  color?: string;
}

export interface EpicUpdateRequest {
  name?: string;
  description?: string;
  color?: string;
}

// ===== Lỗi (mục 9) =====
export interface ApiFieldError {
  objectName: string;
  field: string;
  message: string;
}

export interface ApiError {
  status: number;
  title: string;
  detail: string;
  message: string;
  path: string;
  instance: string;
  type: string;
  fieldErrors?: ApiFieldError[];
}

// ===== WebSocket kéo thả realtime (mục 8.3, 8.4) =====
export type DragPhase = 'start' | 'move' | 'end' | 'cancel';

/** FE → BE: `/app/projects/{projectId}/drag` */
export interface DragRequest {
  phase: DragPhase;
  issueId: string;
  /** Bắt buộc với start/move. Góc trên-trái card theo tỉ lệ vùng nội dung board, 0..1 */
  x?: number;
  y?: number;
  /** Cột con trỏ đang nằm trên; null = ở ngoài mọi cột */
  overStatus?: IssueStatus | null;
}

/**
 * BE → FE: `/topic/projects/{projectId}/drag` (kể cả người kéo — tự lọc theo userId).
 * Contract gọi là `DragEvent` — đổi tên để không trùng DOM `DragEvent`.
 */
export interface BoardDragEvent {
  phase: DragPhase;
  projectId: string;
  issueId: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  /** "#RRGGBB" — màu viền nét đứt + nền nhãn tên */
  color: string;
  x: number | null;
  y: number | null;
  overStatus: IssueStatus | null;
  /** Giờ server — chỉ để debug, không dùng tính timeout */
  sentAt: string;
}

/** BE → FE: `/user/queue/errors` — chỉ tab gây lỗi nhận */
export interface WsError {
  status: number;
  detail: string;
  source: 'drag' | 'subscribe';
}

export function toIssueUpdateRequest(
  issue: Issue,
  changes: Partial<IssueUpdateRequest> = {},
): IssueUpdateRequest {
  return {
    type: issue.type,
    title: issue.title,
    priority: issue.priority,
    description: issue.description,
    storyPoints: issue.storyPoints,
    dueDate: issue.dueDate,
    epicId: issue.epicId,
    sprintId: issue.sprintId,
    parentIssueId: issue.parentIssueId,
    assigneeId: issue.assigneeId,
    ...changes,
  };
}
