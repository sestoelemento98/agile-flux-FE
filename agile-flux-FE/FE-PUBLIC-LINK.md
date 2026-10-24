# Agile Flux — Public link từ máy cá nhân: việc cần làm bên FE

BE đã có sẵn `scripts/start-public.sh` (repo BE). Script chạy BE + Caddy + Cloudflare Tunnel và in ra 1 link
`https://xxx.trycloudflare.com` để gửi người khác dùng.

```
Người dùng ──HTTPS──► Cloudflare Tunnel ──► Caddy :8081 (máy bạn)
                                              ├─ /api/*, /ws/*  → BE :8080
                                              └─ còn lại        → dist/agile-flux-FE/browser (FE đã build)
```

FE và BE **cùng origin** → FE gọi đường dẫn tương đối, **không cần CORS**, không cần biết link tunnel.

---

## 1. Kết luận: FE hiện tại KHÔNG cần sửa code

Đã đối chiếu code FE (`agile-flux-FE/agile-flux-FE`, sau commit `7e442c2`):

| Chỗ                                   | Trạng thái                                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/environments/environment.prod.ts` | ✅ `apiUrl: '/api'`, `wsUrl: '/ws/kanban'` — tương đối, đúng.                                                           |
| `angular.json` → `production`          | ✅ `fileReplacements` thay `environment.ts` bằng `environment.prod.ts`.                                                 |
| `core/services/websocket.ts`           | ✅ `new SockJS(environment.wsUrl)` + `beforeConnect` gắn token.                                                         |
| `core/utils/avatar.ts`, `issue-api.ts` | ✅ Bỏ hậu tố `/api` → prod thành `""` → URL tương đối `/api/avatars/...`, `/api/attachments/{id}/download`.             |
| `core/interceptors/jwt-interceptor.ts` | ✅ Gắn `Bearer`, gặp 401 thì `logout()`. Cần thiết: secret JWT của bản public khác bản local → token cũ nhận 401.       |
| URL tuyệt đối khác trong `src/`        | ✅ Không có `http://localhost` nào ngoài `environment.ts` / `environment.development.ts` (chỉ dùng khi `ng serve`).     |

## 2. Quy tắc để KHÔNG làm hỏng bản public về sau

1. **Mọi URL gọi BE phải đi qua `environment.apiUrl` / `environment.wsUrl`.** Không hard-code `http://localhost:8080`
   ở bất kỳ đâu (service, component, template `<img src>`, `<a href>`).
2. URL BE trả về dạng tương đối (`avatarUrl`, `downloadUrl` bắt đầu bằng `/`) → luôn ghép qua helper sẵn có
   (`avatarSrc()`, `resolveDownloadUrl()`), đừng tự ghép `http://localhost:8080` + path.
3. Route mới của Angular không được bắt đầu bằng `/api` hoặc `/ws` — Caddy chuyển 2 tiền tố này sang BE, trang FE
   ở đó sẽ không bao giờ hiện.
4. Nếu thêm `environment.*.ts` mới (staging...), giữ `apiUrl`/`wsUrl` tương đối.

## 3. Build

Script BE tự build. Muốn build tay (vd. để chạy với `SKIP_FE_BUILD=1`):

```bash
cd ~/Documents/GitHub/agile-flux-FE/agile-flux-FE
npx ng build --configuration production
# output phải có: dist/agile-flux-FE/browser/index.html  (script BE đọc đúng đường dẫn này)
```

Nếu đổi `outputPath` / tên project trong `angular.json` → sửa biến `FE_DIST` trong `scripts/start-public.sh` của BE.

Build lỗi vì vượt `budgets` (angular.json dòng ~39) → tăng `maximumError` hoặc giảm bundle; đây là lỗi build, không
liên quan public link.

## 4. Chạy

```bash
brew install caddy cloudflared          # 1 lần
# bật Postgres, TẮT BE đang chạy trong IDE (script cần cổng 8080 trống)
cd ~/Documents/GitHub/agile-flux-BE
./scripts/start-public.sh               # build FE + chạy hết + in link
SKIP_FE_BUILD=1 ./scripts/start-public.sh   # dùng dist/ có sẵn
```

Sửa FE trong lúc script đang chạy → chỉ cần `ng build` lại, Caddy đọc file trực tiếp, người dùng F5 là thấy.

## 5. Kiểm tra sau khi có link (làm trên link public, không phải localhost)

- [ ] Mở link → trang login hiện; F5 ở một trang con (vd `/projects/...`) không bị 404.
- [ ] Đăng ký + đăng nhập được.
- [ ] Board load đủ issue; đổi status bằng kéo thả → tab khác thấy cập nhật (`/topic/projects/{id}/board`).
- [ ] Kéo card ở trình duyệt A → trình duyệt B (máy khác / ẩn danh, user khác cùng project) thấy card bay theo + viền
      nét đứt + tên (`/topic/projects/{id}/drag`).
- [ ] DevTools → Network → WS: kết nối `/ws/kanban/.../websocket` trạng thái 101, không phải fallback `xhr_streaming`.
- [ ] Upload avatar → ảnh hiện; tải attachment được.
- [ ] Console không có lỗi `Mixed Content` (dấu hiệu còn URL `http://...` tuyệt đối).

## 6. Hành vi người dùng sẽ gặp (không phải bug)

- **Link đổi mỗi lần chạy lại script** → origin mới → `localStorage['token']` của origin cũ không dùng được → người
  dùng phải đăng nhập lại ở link mới. Muốn link cố định: domain riêng trên Cloudflare (named tunnel) hoặc ngrok
  static domain — khi đó chỉ sửa lệnh tunnel trong script BE, FE không đổi.
- Máy bạn tắt/ngủ/mất mạng → link chết. Script tự chạy `caffeinate` để máy không ngủ khi đang chạy.
- Token hết hạn sau 24h (`token-validity-in-seconds: 86400`) → 401 → interceptor đưa về login.
