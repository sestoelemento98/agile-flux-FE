import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../../core/auth/auth';
import {
  BoardDragEvent,
  DragPhase,
  DragRequest,
  IssueStatus,
} from '../../../core/models/api.models';
import { Websocket } from '../../../core/services/websocket';

/** CDK bắn cdkDragMoved mỗi lần chuột nhích → gửi tối đa 1 move / 50ms (mục 8.3). */
const MOVE_THROTTLE_MS = 50;
/** Không nhận message nào trong 5s → coi như mất end/cancel, xoá bản sao. */
const STALE_MS = 5000;

/** Góc trên-trái card theo tỉ lệ vùng nội dung board (0..1) + cột con trỏ đang nằm trên. */
export interface DragPosition {
  x: number;
  y: number;
  overStatus: IssueStatus | null;
}

interface RemoteEntry {
  event: BoardDragEvent;
  lastSeen: number;
}

interface LocalDrag {
  token: number;
  issueId: string;
  /** BE từ chối / mất kết nối → ngừng gửi cho lượt này, card vẫn kéo bình thường ở máy mình. */
  muted: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Kéo thả realtime kiểu Figma (mục 8.3):
 * - Phía người kéo: start → move (throttle) → end/cancel lên `/app/projects/{id}/drag`.
 * - Phía người xem: nghe `/topic/projects/{id}/drag`, giữ danh sách lượt kéo của người khác.
 * BE chỉ relay, không lưu DB — đổi cột thật vẫn là PATCH /issues/{id}/status.
 */
@Injectable({ providedIn: 'root' })
export class BoardDrag {
  private ws = inject(Websocket);
  private auth = inject(AuthService);

  private projectId: string | null = null;
  private topic?: string;
  private topicSub?: Subscription;
  private errorSub?: Subscription;
  private sweepTimer?: ReturnType<typeof setInterval>;

  /** key = `${userId}:${issueId}` */
  private readonly remote = signal(new Map<string, RemoteEntry>());
  readonly remoteDrags = computed(() => [...this.remote().values()].map((e) => e.event));
  /** Issue đang bị người khác kéo → làm mờ + khoá kéo (khoá mềm, BE không khoá). */
  readonly remoteIssueIds = computed(() => new Set(this.remoteDrags().map((d) => d.issueId)));

  private local: LocalDrag | null = null;
  private nextToken = 1;
  private pendingMove: DragPosition | null = null;
  private lastSentAt = 0;
  private moveTimer?: ReturnType<typeof setTimeout>;

  listen(projectId: string): void {
    if (this.projectId === projectId) return;
    this.stop();
    this.projectId = projectId;
    this.topic = `/topic/projects/${projectId}/drag`;
    this.topicSub = this.ws
      .subscribe<BoardDragEvent>(this.topic)
      .subscribe((e) => this.onRemoteEvent(e));
    this.errorSub = this.ws
      .errors()
      .pipe(filter((e) => e.source === 'drag'))
      .subscribe((e) => {
        console.warn('Kéo thả realtime bị từ chối:', e.status, e.detail);
        this.muteLocal();
      });
    this.sweepTimer = setInterval(() => this.sweepStale(), 1000);
  }

  /** Rời project: huỷ lượt kéo dở (nếu có) rồi bỏ nghe topic. */
  stop(): void {
    if (this.local) this.finish(this.local.token, 'cancel');
    this.topicSub?.unsubscribe();
    this.errorSub?.unsubscribe();
    if (this.topic) this.ws.unsubscribe(this.topic);
    clearInterval(this.sweepTimer);
    this.topicSub = this.errorSub = this.sweepTimer = this.topic = undefined;
    this.projectId = null;
    this.remote.set(new Map());
  }

  // ----- Phía người kéo -----

  /** Trả về token của lượt kéo — dùng cho end()/cancel() để không kết thúc nhầm lượt mới hơn. */
  start(issueId: string, pos: DragPosition): number {
    this.clearPendingMove();
    // Lượt cũ chưa end → BE tự broadcast cancel cho lượt đó khi nhận start mới.
    const token = this.nextToken++;
    const sent = this.send({ phase: 'start', issueId, ...this.normalize(pos) });
    this.local = { token, issueId, muted: !sent };
    this.lastSentAt = Date.now();
    return token;
  }

  move(pos: DragPosition): void {
    if (!this.local || this.local.muted) return;
    this.pendingMove = pos;
    const wait = MOVE_THROTTLE_MS - (Date.now() - this.lastSentAt);
    if (wait <= 0) this.flushMove();
    else this.moveTimer ??= setTimeout(() => this.flushMove(), wait);
  }

  end(token: number | null): void {
    if (token !== null) this.finish(token, 'end');
  }

  cancel(token: number | null): void {
    if (token !== null) this.finish(token, 'cancel');
  }

  private flushMove(): void {
    const local = this.local;
    const pos = this.pendingMove;
    this.clearPendingMove();
    if (!local || local.muted || !pos) return;
    if (!this.send({ phase: 'move', issueId: local.issueId, ...this.normalize(pos) })) {
      // Mất kết nối giữa lượt → BE đã tự cancel, gửi tiếp chỉ sinh lỗi.
      local.muted = true;
    }
    this.lastSentAt = Date.now();
  }

  private finish(token: number, phase: Extract<DragPhase, 'end' | 'cancel'>): void {
    const local = this.local;
    if (!local || local.token !== token) return;
    this.clearPendingMove();
    // end/cancel không gửi toạ độ → BE điền vị trí move cuối cùng.
    if (!local.muted) this.send({ phase, issueId: local.issueId });
    this.local = null;
  }

  private muteLocal(): void {
    if (this.local) this.local.muted = true;
    this.clearPendingMove();
  }

  private clearPendingMove(): void {
    clearTimeout(this.moveTimer);
    this.moveTimer = undefined;
    this.pendingMove = null;
  }

  private normalize(pos: DragPosition): DragPosition {
    return { x: clamp01(pos.x), y: clamp01(pos.y), overStatus: pos.overStatus };
  }

  private send(req: DragRequest): boolean {
    if (!this.projectId) return false;
    return this.ws.publish(`/app/projects/${this.projectId}/drag`, req);
  }

  // ----- Phía người xem -----

  private onRemoteEvent(e: BoardDragEvent): void {
    if (e.userId === this.auth.userId() || e.projectId !== this.projectId) return;
    const key = `${e.userId}:${e.issueId}`;
    this.remote.update((map) => {
      const next = new Map(map);
      if (e.phase === 'end' || e.phase === 'cancel') next.delete(key);
      // start HOẶC move: mở board giữa chừng sẽ bỏ lỡ start — move đã đủ field để vẽ.
      else next.set(key, { event: e, lastSeen: Date.now() });
      return next;
    });
  }

  private sweepStale(): void {
    const now = Date.now();
    const map = this.remote();
    if (![...map.values()].some((e) => now - e.lastSeen > STALE_MS)) return;
    this.remote.set(new Map([...map].filter(([, e]) => now - e.lastSeen <= STALE_MS)));
  }
}
