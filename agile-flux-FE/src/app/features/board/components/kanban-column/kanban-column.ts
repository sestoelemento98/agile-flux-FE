import { NgStyle } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { KanbanCardComponent } from '../task-card/task-card';
import { BoardColumn } from '../../models/board-column.model';
import { Epic, Issue } from '../../../../core/models/api.models';

@Component({
  selector: 'app-kanban-column',
  standalone: true,
  imports: [NgStyle, DragDropModule, NzButtonModule, NzIconModule, KanbanCardComponent],
  templateUrl: './kanban-column.html',
  styleUrls: ['./kanban-column.scss'],
})
export class KanbanColumnComponent {
  @Input({ required: true }) column!: BoardColumn;

  /** id duy nhất cho cdkDropList, do component cha (Board) sinh ra */
  @Input({ required: true }) dropListId!: string;

  /** danh sách id các cột khác được phép kéo-thả chéo sang */
  @Input() connectedTo: string[] = [];

  /** Project archive → tắt kéo thả và nút thêm */
  @Input() readonly = false;

  /** Tra cứu epic theo id để hiện trên thẻ */
  @Input() epicsById = new Map<string, Epic>();

  @Output() cardClick = new EventEmitter<Issue>();
  @Output() addCard = new EventEmitter<void>();
  @Output() dropped = new EventEmitter<CdkDragDrop<Issue[]>>();

  get columnStyle(): Record<string, string> {
    return {
      '--af-column-accent': this.column.accentColor,
      '--af-column-bg': this.column.backgroundTint,
    };
  }
}
