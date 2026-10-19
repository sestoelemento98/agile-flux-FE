import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';

export interface TopbarMember {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface TopbarUser {
  name: string;
  avatarUrl?: string;
}

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    NzIconModule,
    NzInputModule,
    NzButtonModule,
    NzAvatarModule,
    NzDropdownModule,
    NzTagModule,
    NzTooltipModule,
  ],
  templateUrl: './topbar.html',
  styleUrls: ['./topbar.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Topbar {
  /** Tên dự án hiện tại, hiển thị ở góc trên trái */
  @Input() projectName = 'Agile Flux';

  /** Key của dự án (vd "AF"), null khi không ở trong dự án */
  @Input() projectKey: string | null = null;

  /** Dự án đã archive (chỉ đọc) */
  @Input() archived = false;

  /** Hiện thành viên + ô tìm kiếm (chỉ khi đang ở trong 1 dự án) */
  @Input() showProjectTools = false;

  /** Danh sách thành viên hiển thị dạng avatar chồng nhau */
  @Input() members: TopbarMember[] = [];

  /** Số avatar tối đa hiển thị trước khi gộp thành "+N" */
  @Input() maxAvatars = 5;

  /** Placeholder cho ô tìm kiếm */
  @Input() searchPlaceholder = 'Tìm theo mã, tiêu đề, người làm...';

  /** Giá trị hiện tại của ô tìm kiếm */
  @Input() searchValue = '';

  /** Thông tin người dùng đang đăng nhập */
  @Input() currentUser: TopbarUser = { name: 'User' };

  /** Sự kiện: bấm nút mở/đóng sidebar (hamburger icon) */
  @Output() toggleSidebar = new EventEmitter<void>();

  /** Sự kiện: gõ tìm kiếm */
  @Output() search = new EventEmitter<string>();

  /** Sự kiện: chọn "Hồ sơ" trong menu người dùng */
  @Output() profileClick = new EventEmitter<void>();

  /** Sự kiện: chọn "Đăng xuất" trong menu người dùng */
  @Output() logoutClick = new EventEmitter<void>();

  get visibleMembers(): TopbarMember[] {
    return this.members.slice(0, this.maxAvatars);
  }

  get extraMembersCount(): number {
    return Math.max(this.members.length - this.maxAvatars, 0);
  }

  onSearchInput(value: string): void {
    this.searchValue = value;
    this.search.emit(value);
  }
}
