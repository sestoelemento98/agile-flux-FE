import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';

export interface SidebarMenuItem {
  /** Định danh duy nhất */
  key: string;
  /** Nhãn hiển thị */
  label: string;
  /** Tên icon ng-zorro (ví dụ: 'appstore', 'calendar', ...) */
  icon: string;
  /** Đường dẫn router (routerLink) */
  routerLink?: string | any[];
  /** Badge số lượng (tuỳ chọn), ví dụ số việc cần làm */
  badge?: number;
}

export interface SidebarProgress {
  /** % hoàn thành, 0-100 */
  percent: number;
  /** Nhãn phía dưới số %, ví dụ 'Hoàn thành' */
  label: string;
  /** Text phụ, ví dụ '34/50 công việc' */
  subLabel: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NzIconModule,
    NzMenuModule,
    NzProgressModule,
    NzTooltipModule,
  ],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.scss'],
})
export class Sidebar {
  /** Tên thương hiệu hiển thị cạnh logo */
  @Input() brandName = 'Agile Flux';

  /** Danh sách menu chính, layout truyền vào tuỳ theo đang ở trong project hay không */
  @Input() menuItems: SidebarMenuItem[] = [];

  /** Có hiển thị widget tiến độ tổng thể ở cuối sidebar không */
  @Input() showProgress = true;

  /** Dữ liệu tiến độ tổng thể (tính từ số issue status = done) */
  @Input() progress: SidebarProgress = { percent: 0, label: '', subLabel: '' };

  /** Sidebar có đang thu gọn (collapsed) hay không, cho phép điều khiển từ ngoài */
  @Input() collapsed = false;

  /** Bắn sự kiện khi người dùng click 1 menu item */
  @Output() menuItemClick = new EventEmitter<SidebarMenuItem>();

  /** Bắn sự kiện khi người dùng click vào khối tiến độ tổng thể */
  @Output() progressClick = new EventEmitter<void>();

  onMenuItemClick(item: SidebarMenuItem): void {
    this.menuItemClick.emit(item);
  }

  onProgressClick(): void {
    this.progressClick.emit();
  }

  /**
   * Format hiển thị bên trong vòng tròn tiến độ (giữ nguyên dạng "68%").
   * Khai báo tường minh thay vì để nz-progress tự format, để tránh trường
   * hợp CSS canh giữa mặc định của ng-zorro-antd chưa load làm số % rớt
   * xuống đè lên label "Hoàn thành" phía dưới.
   */
  progressFormat = (): string => `${this.progress.percent}%`;
}
