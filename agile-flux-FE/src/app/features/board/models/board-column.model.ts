import { Issue, IssueStatus } from '../../../core/models/api.models';

/** 1 cột Kanban = 1 giá trị status (BE không có API cột). */
export interface BoardColumn {
  key: IssueStatus;
  title: string;
  /** Màu chấm tròn cạnh tên cột */
  accentColor: string;
  /** Màu nền phủ nhẹ toàn bộ cột */
  backgroundTint: string;
  /** Đã sắp theo issueNumber tăng dần (BE không lưu thứ tự trong cột) */
  issues: Issue[];
}
