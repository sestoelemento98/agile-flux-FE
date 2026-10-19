import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth';
import { Websocket } from './core/services/websocket';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private auth = inject(AuthService);
  private ws = inject(Websocket);

  ngOnInit(): void {
    // Mở lại app với token cũ: làm mới thông tin user (401 → interceptor tự đưa về login)
    if (this.auth.isLoggedIn()) {
      this.auth.refreshMe().subscribe();
      this.ws.connect();
    }
  }
}
