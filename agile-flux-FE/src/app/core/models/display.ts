import {
  ActivityLog,
  IssuePriority,
  IssueStatus,
  IssueType,
  ProjectRole,
  SprintStatus,
} from './api.models';

/** Nhãn hiển thị cho enum — chỉ dùng ở UI, giá trị gửi BE luôn là key chữ thường. */

export const ISSUE_STATUSES: { key: IssueStatus; title: string; color: string; tint: string }[] = [
  { key: 'todo', title: 'To Do', color: '#8a8f98', tint: 'transparent' },
  { key: 'in_progress', title: 'In Progress', color: '#f5a623', tint: 'rgba(245, 166, 35, 0.06)' },
  { key: 'testing', title: 'Testing', color: '#7c5cff', tint: 'rgba(124, 92, 255, 0.06)' },
  { key: 'done', title: 'Done', color: '#2ecc71', tint: 'rgba(46, 204, 113, 0.06)' },
];

export const ISSUE_TYPES: { key: IssueType; title: string; icon: string; color: string }[] = [
  { key: 'story', title: 'Story', icon: 'book', color: '#36b37e' },
  { key: 'task', title: 'Task', icon: 'check-square', color: '#2f6bff' },
  { key: 'bug', title: 'Bug', icon: 'bug', color: '#ef4444' },
  { key: 'sub_task', title: 'Sub-task', icon: 'branches', color: '#6b7280' },
];

export const ISSUE_PRIORITIES: {
  key: IssuePriority;
  title: string;
  icon: string;
  rotate: number;
  color: string;
}[] = [
  { key: 'highest', title: 'Cao nhất', icon: 'double-right', rotate: -90, color: '#d92d20' },
  { key: 'high', title: 'Cao', icon: 'arrow-up', rotate: 0, color: '#f04438' },
  { key: 'medium', title: 'Trung bình', icon: 'minus', rotate: 0, color: '#f5a623' },
  { key: 'low', title: 'Thấp', icon: 'arrow-down', rotate: 0, color: '#2f6bff' },
  { key: 'lowest', title: 'Thấp nhất', icon: 'double-right', rotate: 90, color: '#64748b' },
];

export const SPRINT_STATUSES: Record<SprintStatus, { title: string; color: string }> = {
  planned: { title: 'Kế hoạch', color: 'default' },
  active: { title: 'Đang chạy', color: 'processing' },
  completed: { title: 'Hoàn thành', color: 'success' },
  cancelled: { title: 'Đã huỷ', color: 'error' },
};

export const PROJECT_ROLES: Record<ProjectRole, string> = {
  admin: 'Quản trị',
  member: 'Thành viên',
};

export function statusMeta(key: IssueStatus) {
  return ISSUE_STATUSES.find((s) => s.key === key)!;
}

export function typeMeta(key: IssueType) {
  return ISSUE_TYPES.find((t) => t.key === key)!;
}

export function priorityMeta(key: IssuePriority) {
  return ISSUE_PRIORITIES.find((p) => p.key === key)!;
}

/** "2026-10-30" → "30/10/2026" mà không đi qua Date (tránh lệch múi giờ). */
export function formatLocalDate(value: string | null, withYear = true): string {
  if (!value) return '';
  const [y, m, d] = value.split('-');
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

/** Ngày hôm nay dạng "YYYY-MM-DD" theo giờ máy người dùng. */
export function todayLocalDate(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const ISSUE_FIELD_NAMES: Record<string, string> = {
  type: 'loại',
  title: 'tiêu đề',
  description: 'mô tả',
  priority: 'độ ưu tiên',
  storyPoints: 'story points',
  dueDate: 'hạn',
  epic: 'epic',
  sprint: 'sprint',
  parentIssue: 'issue cha',
  assignee: 'người thực hiện',
};

/** Câu mô tả một dòng activity log (mục 6.11). */
export function describeActivity(a: ActivityLog): string {
  const d = a.details ?? '';
  switch (a.action) {
    case 'issue_created':
      return `đã tạo issue “${d}”`;
    case 'issue_updated':
      return `đã cập nhật ${d
        .split(', ')
        .map((f) => ISSUE_FIELD_NAMES[f] ?? f)
        .join(', ')}`;
    case 'issue_status_changed':
      return `đã đổi trạng thái ${d
        .split(' → ')
        .map((s) => ISSUE_STATUSES.find((x) => x.key === s)?.title ?? s)
        .join(' → ')}`;
    case 'issue_deleted':
      return `đã xoá issue ${d}`;
    case 'label_added':
      return `đã gắn nhãn “${d}”`;
    case 'label_removed':
      return `đã gỡ nhãn “${d}”`;
    case 'comment_added':
      return 'đã bình luận';
    case 'comment_deleted':
      return 'đã xoá một bình luận';
    case 'attachment_added':
      return `đã đính kèm “${d}”`;
    case 'attachment_deleted':
      return `đã xoá tệp “${d}”`;
    case 'sprint_created':
      return `đã tạo sprint “${d}”`;
    case 'sprint_status_changed':
      return `đã đổi trạng thái sprint ${d}`;
    case 'sprint_deleted':
      return `đã xoá sprint “${d}”`;
    case 'member_added':
      return `đã thêm thành viên ${d}`;
    case 'member_role_changed':
      return `đã đổi vai trò ${d}`;
    case 'member_removed':
      return `đã xoá thành viên ${d}`;
  }
}
