import { Component } from '@angular/core';
import { KanbanBoardComponent } from '../../components/kanban-board/kanban-board';

/** Trang "Bảng kanban" của 1 project — dữ liệu lấy từ ProjectContext (mục 7). */
@Component({
  selector: 'app-board-page',
  imports: [KanbanBoardComponent],
  templateUrl: './board-page.html',
  styleUrl: './board-page.css',
})
export class BoardPageComponent {}
