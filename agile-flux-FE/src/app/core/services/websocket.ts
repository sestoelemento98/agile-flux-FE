import { Injectable, OnDestroy } from '@angular/core';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

interface TopicEntry {
  subject: Subject<unknown>;
  stompSub?: StompSubscription;
}

@Injectable({
  providedIn: 'root',
})
export class Websocket implements OnDestroy {
  private client: Client;
  private topics = new Map<string, TopicEntry>();
  private connected$ = new BehaviorSubject<boolean>(false);

  constructor() {
    this.client = new Client({
      webSocketFactory: () => new SockJS(environment.wsUrl),
      reconnectDelay: 5000, // tự động reconnect khi mất kết nối
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      // BE từ chối CONNECT không có token. beforeConnect chạy trước MỖI lần connect/reconnect
      // → luôn lấy token mới nhất.
      beforeConnect: () => {
        this.client.connectHeaders = {
          Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
        };
      },
    });

    this.client.onConnect = () => {
      this.connected$.next(true);
      // (Re)subscribe mọi topic đang được lắng nghe — cần sau mỗi lần reconnect.
      this.topics.forEach((entry, topic) => this.stompSubscribe(topic, entry));
    };
    this.client.onDisconnect = () => this.connected$.next(false);
    this.client.onWebSocketClose = () => this.connected$.next(false);
    this.client.onStompError = (frame) => {
      console.error('STOMP error:', frame.headers['message'], frame.body);
    };
  }

  /** Chỉ gọi sau khi đã đăng nhập. */
  connect(): void {
    if (!this.client.active && localStorage.getItem('token')) {
      this.client.activate();
    }
  }

  onConnected(): Observable<boolean> {
    return this.connected$.asObservable();
  }

  /**
   * Subscribe vào 1 topic, trả về Observable phát ra message đã parse JSON.
   * Gọi lại cùng topic dùng chung 1 subscription STOMP.
   */
  subscribe<T>(topic: string): Observable<T> {
    let entry = this.topics.get(topic);
    if (!entry) {
      entry = { subject: new Subject<unknown>() };
      this.topics.set(topic, entry);
      if (this.client.connected) {
        this.stompSubscribe(topic, entry);
      }
    }
    return entry.subject.asObservable() as Observable<T>;
  }

  unsubscribe(topic: string): void {
    const entry = this.topics.get(topic);
    if (!entry) return;
    if (this.client.connected) entry.stompSub?.unsubscribe();
    entry.subject.complete();
    this.topics.delete(topic);
  }

  disconnect(): void {
    this.topics.forEach((_entry, topic) => this.unsubscribe(topic));
    this.client.deactivate();
    this.connected$.next(false);
  }

  private stompSubscribe(topic: string, entry: TopicEntry): void {
    entry.stompSub = this.client.subscribe(topic, (message: IMessage) => {
      entry.subject.next(JSON.parse(message.body));
    });
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
