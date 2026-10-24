# Agile Flux — Hợp đồng API Backend (dành cho Frontend)

> **Gửi Claude bên FE:** đây là nguồn sự thật về API backend (Spring Boot, repo `agile-flux-BE`).
> FE phải khớp **tuyệt đối** tên field, kiểu dữ liệu, giá trị enum, URL ở đây — không tự đoán, không fallback âm thầm.
> Mọi JSON mẫu trong file này được **chụp từ response thật** của BE (REST: 2026-10-19; WebSocket kéo thả realtime mục 8.3: 2026-10-22), không phải viết tay.
> Nếu FE cần dữ liệu mà BE chưa có (xem mục 12), hãy báo lại để sửa BE thay vì tự chế ở FE.

---

## 0. Những chỗ FE hiện tại đang LỆCH với BE (phải sửa)

Đối chiếu với code FE (`agile-flux-FE/src`) ở commit `bb8ed3d`:

| Chỗ ở FE                                                                                       | Vấn đề                                                                                                                | Cách sửa                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `features/board/services/board.ts` — `GET /boards/{id}`, `POST /boards/{id}/cards/move`        | **Hai endpoint này không còn tồn tại.** BE không có Board/Column/Card nữa.                                            | Board = `GET /api/projects/{projectId}/issues` rồi nhóm theo `status`. Kéo thả = `PATCH /api/issues/{id}/status`. Xem mục 7.                                                                            |
| `features/board/models/kanban.model.ts` — `id: number`, `position`, `version`, `CardMoveEvent` | Mọi id ở BE là **UUID dạng string**. BE **không lưu thứ tự card trong cột** (không có `position`/`version`).          | Dùng interface `Issue` ở mục 5. Bỏ `position`/`version`/`CardMoveEvent`. Thứ tự trong cột: sắp xếp phía FE (đề xuất theo `issueNumber` tăng dần).                                                       |
| 4 cột Kanban                                                                                   | Cột cố định = 4 giá trị enum `status`: `todo`, `in_progress`, `testing`, `done`. Không có API cột.                    | Hard-code 4 cột ở FE, map `key` cột ↔ `status`.                                                                                                                                                         |
| `features/project/models/project.model.ts` — `id: number`                                      | Sai kiểu, thiếu field.                                                                                                | Dùng interface `Project` ở mục 5.                                                                                                                                                                       |
| `features/*/models/task.model.ts` — `type: 'Story'                                             | 'Task'                                                                                                                | 'Bug'`, `priority: 'Low'                                                                                                                                                                                | ...` | Enum BE là **chữ thường snake_case** (`story`, `sub_task`, `high`...), có thêm `sub_task`, `lowest`, `highest`. | Dùng type ở mục 4. Hiển thị label tiếng Việt/hoa thì map riêng ở FE. |
| `core/auth/auth.ts` — `login(email, password)` chỉ `console.log`                               | Chưa gọi API.                                                                                                         | `POST /api/auth/login` với body `{ login, password }` (field tên **`login`**, nhận email hoặc username). Lưu `accessToken` vào `localStorage['token']` (interceptor hiện tại đọc key này — giữ nguyên). |
| `core/services/websocket.ts` — `new Client({...})` không gửi token                             | **BE từ chối STOMP CONNECT không có token** (nhận ERROR frame, không subscribe được).                                 | Thêm `connectHeaders` / `beforeConnect` — xem mục 8.                                                                                                                                                    |
| **MỚI 2026-10-22** — board kéo thả realtime kiểu Figma                                         | Người khác thấy card đang bay theo chuột người kéo, viền nét đứt + tên người kéo ở góc dưới phải.                     | Làm theo **mục 8.3** (gửi `/app/projects/{id}/drag`, subscribe `/topic/projects/{id}/drag`, `/user/queue/errors`).                                                                                      |
| **MỚI 2026-10-22** — SUBSCRIBE topic project                                                   | BE giờ **chặn** subscribe `/topic/projects/{id}/**` nếu không phải thành viên (trước đây ai có token cũng nghe được). | Chỉ subscribe project mà user là thành viên; lắng nghe `/user/queue/errors` để biết khi bị từ chối (mục 8.4).                                                                                           |
| `core/interceptors/jwt-interceptor.ts`                                                         | OK (gửi `Authorization: Bearer`). Chưa xử lý 401.                                                                     | Nên bắt 401 → xoá token → chuyển về trang login.                                                                                                                                                        |

---

## 1. Thông tin chung

|                    |                                                             |
| ------------------ | ----------------------------------------------------------- |
| Base URL REST      | `http://localhost:8080/api`                                 |
| WebSocket (SockJS) | `http://localhost:8080/ws/kanban`                           |
| CORS (dev)         | cho phép `http://localhost:4200`, `http://localhost:8100`   |
| Content-Type       | `application/json` (trừ upload file: `multipart/form-data`) |

### Quy ước dữ liệu JSON

- **Id**: luôn là UUID string, ví dụ `"661709dd-55cb-46c3-8ef5-77859f9c2782"`.
- **Thời điểm** (`createdAt`, `updatedAt`): ISO-8601 UTC có micro giây, ví dụ `"2026-10-19T06:44:20.934794Z"` → `new Date(value)` parse được.
- **Ngày** (`dueDate`, `startDate`, `endDate`): `"YYYY-MM-DD"`, ví dụ `"2026-10-30"`. Không có giờ, không có timezone — **đừng** parse bằng `new Date()` rồi gửi lại (lệch múi giờ); giữ nguyên chuỗi.
- **Field null vẫn có mặt** trong response (`"assigneeId": null`), không bị lược bỏ.
- **Số thập phân** (`storyPoints`): JSON number, ví dụ `3.5`. Tối đa 1 chữ số thập phân, `0 ≤ x ≤ 999.9`.
- **Enum**: luôn chữ thường snake_case (mục 4). Gửi lên BE không phân biệt hoa/thường, nhưng FE nên gửi đúng chữ thường.
- **Response 204**: body rỗng.

---

## 2. Xác thực (JWT)

1. Đăng ký: `POST /api/users/register` (không cần token).
2. Đăng nhập: `POST /api/auth/login` (không cần token) → nhận `accessToken`.
3. Mọi request `/api/**` khác: header `Authorization: Bearer <accessToken>`.
4. Token hết hạn sau `expiresIn` giây (mặc định 86400 = 24h). **Chưa có refresh token** → hết hạn thì đăng nhập lại.
5. Đăng xuất: chỉ cần xoá token ở FE (BE stateless, không có endpoint logout).

Không có token / token sai / hết hạn → **401 với body rỗng** (khác với 401 khi đăng nhập sai — có body, xem mục 9).

---

## 3. Phân quyền

Quyền tính **theo từng project**:

| Vai trò           | Ai                                                    | Được làm                                                                                                         |
| ----------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **member**        | owner của project, hoặc có trong danh sách thành viên | Xem mọi thứ trong project; tạo/sửa/xoá issue, sprint, epic, label; comment; upload file; watch                   |
| **admin**         | owner, hoặc thành viên có `role = "admin"`            | Thêm quyền member + sửa/archive/unarchive project, thêm/đổi role/xoá thành viên, xoá comment/file của người khác |
| không phải member | —                                                     | Mọi API của project đó → **403**                                                                                 |

- Người tạo project **tự động** là `admin` trong danh sách thành viên.
- Owner không thể bị xoá khỏi project và không thể bị hạ xuống `member`.
- Member thường được tự rời project (`DELETE /projects/{id}/members/{chínhMình}`).
- Project đã archive (`archived: true`): **chỉ đọc** — mọi thao tác ghi trả **400** `"Project đã archive, không thể chỉnh sửa"`.
- Comment: chỉ **tác giả** được sửa; tác giả hoặc admin được xoá.
- Attachment: người upload hoặc admin được xoá.
- WebSocket: chỉ thành viên mới **subscribe** được `/topic/projects/{id}/board` và `/drag`, và chỉ thành viên của project chưa archive mới **gửi** được message kéo thả (mục 8).

Gợi ý UI: lấy `role` của user hiện tại từ `GET /projects/{id}/members` (so `userId` với `user.id` lúc login) để ẩn/hiện nút admin. BE vẫn chặn lại nếu FE gửi sai.

---

## 4. Enum

```ts
export type IssueType = 'task' | 'story' | 'bug' | 'sub_task';
export type IssueStatus = 'todo' | 'in_progress' | 'testing' | 'done'; // = 4 cột Kanban, theo thứ tự này
export type IssuePriority = 'lowest' | 'low' | 'medium' | 'high' | 'highest';
export type SprintStatus = 'planned' | 'active' | 'completed' | 'cancelled';
export type ProjectRole = 'admin' | 'member';
export type ActivityAction =
  | 'issue_created'
  | 'issue_updated'
  | 'issue_status_changed'
  | 'issue_deleted'
  | 'label_added'
  | 'label_removed'
  | 'comment_added'
  | 'comment_deleted'
  | 'attachment_added'
  | 'attachment_deleted'
  | 'sprint_created'
  | 'sprint_status_changed'
  | 'sprint_deleted'
  | 'member_added'
  | 'member_role_changed'
  | 'member_removed';
```

Gửi giá trị ngoài danh sách → **400**, `detail` dạng `"Invalid issue status: blocked"`.

---

## 5. Kiểu dữ liệu response (TypeScript)

```ts
export interface User {
  id: string;
  email: string;
  username: string;
  fullName: string;
  avatarUrl: string | null; // "/api/avatars/<uuid>.png" (ảnh upload, đường dẫn tương đối) | "https://..." (URL ngoài) | null — xem mục 6.1.1
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number; // giây
  user: User;
}

export interface Project {
  id: string;
  key: string; // vd "AF" — tiền tố của issueKey
  name: string;
  description: string | null;
  archived: boolean;
  ownerId: string;
  ownerName: string;
  leaderId: string | null; // ⚠ response dùng "leaderId"/"leaderName", request dùng "leadId"
  leaderName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  id: string; // id của dòng membership (ít dùng) — thao tác theo userId
  projectId: string;
  userId: string;
  userFullName: string;
  userEmail: string;
  role: ProjectRole;
  createdAt: string;
  updatedAt: string;
}

export interface Label {
  id: string;
  projectId: string;
  name: string;
  color: string; // "#RRGGBB" — màu hex, KHÔNG phải tên preset của nz-tag → dùng [nzColor]="label.color"
  createdAt: string;
  updatedAt: string;
}

export interface Issue {
  id: string;
  projectId: string;
  issueKey: string; // vd "AF-1" — hiển thị cho người dùng
  issueNumber: number; // tăng dần theo từng project
  epicId: string | null;
  sprintId: string | null; // null = đang ở backlog
  parentIssueId: string | null;
  type: IssueType;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  storyPoints: number | null;
  reporterId: string;
  reporterName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null; // "YYYY-MM-DD"
  labels: Label[]; // đã sắp xếp theo name
  createdAt: string;
  updatedAt: string;
}

export interface IssueWatcher {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  startDate: string | null; // "YYYY-MM-DD"
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Epic {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  color: string; // "#RRGGBB", mặc định "#6366f1"
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  issueId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  content: string;
  edited: boolean; // true → hiện "(đã chỉnh sửa)"
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  issueId: string;
  uploaderId: string;
  uploaderName: string;
  fileName: string;
  contentType: string | null;
  fileSize: number; // byte
  downloadUrl: string; // "/api/attachments/{id}/download" — đường dẫn tương đối từ host, xem mục 6.10
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  projectId: string;
  issueId: string | null; // null: hoạt động cấp project (sprint/member) HOẶC issue đã bị xoá
  issueKey: string | null;
  actorId: string;
  actorName: string;
  action: ActivityAction;
  details: string | null; // chuỗi mô tả ngắn, xem bảng ở mục 6.11
  createdAt: string;
}
```

---

## 6. Endpoint

Ký hiệu quyền: 🔓 không cần token · 👤 đăng nhập · 👥 member của project · 🛡 admin của project.
Mọi endpoint 👥/🛡 trả **403** nếu không đủ quyền, **404** nếu id không tồn tại.

### 6.1 Auth & User

| Method | URL                       | Quyền | Body                                    | Response                                                                                    |
| ------ | ------------------------- | ----- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| POST   | `/api/users/register`     | 🔓    | `RegisterRequest`                       | **201** `User`                                                                              |
| POST   | `/api/auth/login`         | 🔓    | `LoginRequest`                          | 200 `LoginResponse`                                                                         |
| GET    | `/api/users/me`           | 👤    | —                                       | 200 `User`                                                                                  |
| PATCH  | `/api/users/me`           | 👤    | `UpdateProfileRequest`                  | 200 `User`                                                                                  |
| PUT    | `/api/users/me/password`  | 👤    | `ChangePasswordRequest`                 | 204                                                                                         |
| POST   | `/api/users/me/avatar`    | 👤    | `multipart/form-data`, field **`file`** | 200 `User` (đã có `avatarUrl` mới) — xem mục 6.1.1                                          |
| DELETE | `/api/users/me/avatar`    | 👤    | —                                       | 200 `User` (`avatarUrl: null`)                                                              |
| GET    | `/api/avatars/{fileName}` | 🔓    | —                                       | 200 ảnh (binary) — **public**, dùng thẳng trong `<img src>`                                 |
| GET    | `/api/users`              | 👤    | —                                       | 200 `User[]` — mọi user đang active, sắp theo `fullName` (dùng cho ô chọn thành viên)       |
| GET    | `/api/users/{id}`         | 👤    | —                                       | 200 `User`                                                                                  |
| DELETE | `/api/users/{id}`         | 👤    | —                                       | 204 — chỉ được khoá **chính mình** (khác → 403). Tài khoản bị khoá không đăng nhập được nữa |

```ts
export interface RegisterRequest {
  email: string; // bắt buộc, đúng định dạng email, chưa ai dùng (trùng → 409)
  username: string; // bắt buộc, 3–100 ký tự, chưa ai dùng (trùng → 409)
  fullName: string; // bắt buộc, ≤255
  password: string; // bắt buộc, 8–255 ký tự
}
export interface LoginRequest {
  login: string; // email HOẶC username (có '@' → coi là email)
  password: string;
}
export interface UpdateProfileRequest {
  // field nào null/không gửi = giữ nguyên
  fullName?: string; // ≤255
  avatarUrl?: string; // CHỈ dùng cho URL ảnh ngoài, phải bắt đầu bằng http:// hoặc https:// (khác → 400). Upload ảnh từ máy dùng POST /users/me/avatar
}
export interface ChangePasswordRequest {
  currentPassword: string; // sai → 400 "Mật khẩu hiện tại không đúng"
  newPassword: string; // 8–255 ký tự
}
```

> ⚠ `/api/users/me` **không** nhận query `?currentUserId=` nữa — user được xác định từ token.

#### 6.1.1 Avatar

**Upload / đổi avatar:** `POST /api/users/me/avatar`, `multipart/form-data`, field `file`.

- Chỉ nhận **PNG, JPEG, GIF, WEBP**, tối đa **2MB**. BE nhận diện loại ảnh bằng nội dung file (magic bytes), không theo đuôi/Content-Type → đổi đuôi file khác thành `.png` vẫn bị từ chối. **Không nhận SVG.**
- Sai loại → 400 `"Chỉ nhận ảnh PNG, JPEG, GIF hoặc WEBP"`; quá 2MB → 400 `"Ảnh đại diện tối đa 2MB"`; file rỗng → 400 `"File rỗng"`.
- Nên chặn trước ở FE: `accept="image/png,image/jpeg,image/gif,image/webp"` và `file.size <= 2 * 1024 * 1024`. Muốn crop/resize thì làm ở FE trước khi upload.
- Response là `User` đầy đủ → cập nhật luôn user đang lưu ở FE (topbar, localStorage...).
- Ảnh cũ (nếu là ảnh đã upload) bị BE tự xoá. Mỗi lần upload sinh **URL mới** → không cần cache-busting `?v=`.

```ts
uploadAvatar(file: File): Observable<User> {
  const fd = new FormData();
  fd.append('file', file);                       // KHÔNG tự set Content-Type
  return this.http.post<User>(`${environment.apiUrl}/users/me/avatar`, fd);
}
removeAvatar(): Observable<User> {
  return this.http.delete<User>(`${environment.apiUrl}/users/me/avatar`);
}
```

**Hiển thị avatar:** `avatarUrl` có 3 dạng — xử lý bằng 1 hàm dùng chung (vd pipe):

```ts
// environment.apiUrl = 'http://localhost:8080/api' -> host = 'http://localhost:8080'
const API_HOST = environment.apiUrl.replace(/\/api$/, '');
export function avatarSrc(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null; // null -> hiện chữ cái đầu của fullName
  if (avatarUrl.startsWith('/')) return API_HOST + avatarUrl; // ảnh upload: "/api/avatars/..."
  return avatarUrl; // URL ngoài "https://..."
}
```

- `GET /api/avatars/{fileName}` **không cần token** (thẻ `<img>` không gửi được header Authorization) → dùng thẳng `<img [src]="avatarSrc(user.avatarUrl)">` / `<nz-avatar [nzSrc]="...">`. **Khác với attachment** (phải tải bằng HttpClient + blob).
- Response có `Cache-Control: max-age=31536000, public, immutable` → trình duyệt cache lâu, an toàn vì URL đổi mỗi lần upload.
- Các DTO khác chỉ có `avatarUrl` cùng định dạng trên: `IssueWatcher.avatarUrl`, `Comment.authorAvatarUrl` → dùng chung `avatarSrc()`.

**Xoá avatar:** `DELETE /api/users/me/avatar` → `avatarUrl: null`.

**Dùng URL ngoài** (vd Gravatar): `PATCH /api/users/me` `{ "avatarUrl": "https://..." }`.

### 6.2 Project

| Method | URL                            | Quyền | Body                   | Response                                                                                                                                |
| ------ | ------------------------------ | ----- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/projects`                | 👤    | `ProjectCreateRequest` | **201** `Project`                                                                                                                       |
| GET    | `/api/projects`                | 👤    | —                      | 200 `Project[]` — **chỉ project mà tôi là owner/thành viên**, mới nhất trước, **gồm cả project đã archive** (FE tự lọc theo `archived`) |
| GET    | `/api/projects/{id}`           | 👥    | —                      | 200 `Project`                                                                                                                           |
| PATCH  | `/api/projects/{id}`           | 🛡    | `ProjectUpdateRequest` | 200 `Project`                                                                                                                           |
| DELETE | `/api/projects/{id}`           | 🛡    | —                      | 204 — **archive** (soft delete), không xoá thật                                                                                         |
| POST   | `/api/projects/{id}/unarchive` | 🛡    | —                      | 200 `Project`                                                                                                                           |

```ts
export interface ProjectCreateRequest {
  key: string; // bắt buộc, regex ^[A-Z][A-Z0-9]{1,9}$ (CHỮ HOA/số, bắt đầu bằng chữ, 2–10 ký tự), trùng → 409
  name: string; // bắt buộc, ≤255
  description?: string;
  leadId?: string; // userId, optional
}
export interface ProjectUpdateRequest {
  // partial: null/không gửi = giữ nguyên
  name?: string;
  description?: string;
  leadId?: string; // đổi lead
  clearLead?: boolean; // true = bỏ lead (vì leadId null nghĩa là "không đổi")
}
```

> `key` **không sửa được** sau khi tạo (đã dùng trong `issueKey` của mọi issue). Gợi ý: FE tự `toUpperCase()` khi người dùng gõ key.

### 6.3 Thành viên project

| Method | URL                                          | Quyền                              | Body                                                              | Response                |
| ------ | -------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------- | ----------------------- |
| GET    | `/api/projects/{projectId}/members`          | 👥                                 | —                                                                 | 200 `ProjectMember[]`   |
| POST   | `/api/projects/{projectId}/members`          | 🛡                                 | `{ userId: string; role?: ProjectRole }` (role mặc định `member`) | **201** `ProjectMember` |
| PATCH  | `/api/projects/{projectId}/members/{userId}` | 🛡                                 | `{ role: ProjectRole }`                                           | 200 `ProjectMember`     |
| DELETE | `/api/projects/{projectId}/members/{userId}` | 🛡 (hoặc chính mình = rời project) | —                                                                 | 204                     |

Lỗi 400: user đã là thành viên, user bị khoá, xoá/hạ quyền owner. Lưu ý URL dùng **`userId`**, không phải `id` của membership.

### 6.4 Issue

| Method | URL                                | Quyền | Body                      | Response                                                                                                                                  |
| ------ | ---------------------------------- | ----- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/issues`                      | 👥    | `IssueCreateRequest`      | **201** `Issue`                                                                                                                           |
| GET    | `/api/issues/{id}`                 | 👥    | —                         | 200 `Issue`                                                                                                                               |
| GET    | `/api/projects/{projectId}/issues` | 👥    | —                         | 200 `Issue[]` — **toàn bộ** issue của project (mọi status, mọi sprint + backlog), sắp theo `issueNumber` tăng dần. Chưa có phân trang/lọc |
| PUT    | `/api/issues/{id}`                 | 👥    | `IssueUpdateRequest`      | 200 `Issue`                                                                                                                               |
| PATCH  | `/api/issues/{id}/status`          | 👥    | `{ status: IssueStatus }` | 200 `Issue`                                                                                                                               |
| DELETE | `/api/issues/{id}`                 | 👥    | —                         | 204                                                                                                                                       |

```ts
export interface IssueCreateRequest {
  projectId: string; // bắt buộc
  type: IssueType; // bắt buộc
  title: string; // bắt buộc, ≤500
  description?: string;
  priority?: IssuePriority; // mặc định 'medium'
  storyPoints?: number; // 0–999.9
  dueDate?: string; // "YYYY-MM-DD"
  epicId?: string;
  sprintId?: string; // không gửi = vào backlog
  parentIssueId?: string; // bắt buộc nếu type = 'sub_task', CẤM nếu type khác
  assigneeId?: string;
}

// PUT = THAY TOÀN BỘ. Gửi đủ mọi field; field nullable gửi null (hoặc bỏ) = XOÁ giá trị đó.
// Ví dụ bỏ assign: assigneeId: null. Muốn giữ nguyên thì gửi lại giá trị cũ từ Issue hiện có.
// Không có projectId (không chuyển project được) và status (đổi qua PATCH /status).
export interface IssueUpdateRequest {
  type: IssueType; // bắt buộc
  title: string; // bắt buộc, ≤500
  priority: IssuePriority; // bắt buộc
  description: string | null;
  storyPoints: number | null;
  dueDate: string | null;
  epicId: string | null;
  sprintId: string | null;
  parentIssueId: string | null;
  assigneeId: string | null;
}
```

Cách dựng body PUT từ issue đang có (tránh vô tình xoá field):

```ts
const body: IssueUpdateRequest = {
  type: issue.type,
  title: issue.title,
  priority: issue.priority,
  description: issue.description,
  storyPoints: issue.storyPoints,
  dueDate: issue.dueDate,
  epicId: issue.epicId,
  sprintId: issue.sprintId,
  parentIssueId: issue.parentIssueId,
  assigneeId: issue.assigneeId,
  ...changes, // chỉ ghi đè field người dùng sửa
};
```

**Quy tắc BE kiểm tra (vi phạm → 400, `detail` nói rõ lý do):**

- Issue mới luôn có `status = 'todo'`. `issueNumber`/`issueKey` do BE sinh.
- Sub-task 1 cấp: `type = 'sub_task'` ⇔ có `parentIssueId`; parent cùng project và **không** phải sub_task; issue đang có sub-task không đổi được thành sub_task.
- `epicId`, `sprintId`, `parentIssueId` phải cùng project với issue.
- Chỉ đưa vào sprint đang `planned` hoặc `active` (giữ nguyên sprint cũ đã `completed` thì vẫn được).
- `assigneeId` phải là thành viên project và tài khoản còn active.
- Xoá issue đang có sub-task → 400 (xoá sub-task trước). Xoá issue sẽ xoá luôn comment, attachment, label/watcher gắn với nó.
- Reporter (người tạo) và assignee **tự động** được thêm vào danh sách watcher.

### 6.5 Label (theo project)

| Method | URL                                 | Quyền | Body                                                  | Response                      |
| ------ | ----------------------------------- | ----- | ----------------------------------------------------- | ----------------------------- |
| POST   | `/api/labels`                       | 👥    | `{ projectId: string; name: string; color?: string }` | **201** `Label`               |
| GET    | `/api/labels/{id}`                  | 👥    | —                                                     | 200 `Label`                   |
| GET    | `/api/projects/{projectId}/labels`  | 👥    | —                                                     | 200 `Label[]`                 |
| PATCH  | `/api/labels/{id}`                  | 👥    | `{ name?: string; color?: string }`                   | 200 `Label`                   |
| DELETE | `/api/labels/{id}`                  | 👥    | —                                                     | 204 — tự gỡ khỏi mọi issue    |
| POST   | `/api/issues/{id}/labels/{labelId}` | 👥    | —                                                     | 200 `Issue` (đã có label mới) |
| DELETE | `/api/issues/{id}/labels/{labelId}` | 👥    | —                                                     | 200 `Issue`                   |

`name` ≤50 ký tự, **không trùng trong cùng project** (phân biệt hoa/thường). `color` phải đúng `#RRGGBB` (regex `^#[0-9a-fA-F]{6}$`), mặc định `#6366f1`.
Gắn label đã gắn / label khác project → 400. Gỡ label chưa gắn → 404.

### 6.6 Watcher

| Method | URL                         | Quyền | Response                                                                      |
| ------ | --------------------------- | ----- | ----------------------------------------------------------------------------- |
| GET    | `/api/issues/{id}/watchers` | 👥    | 200 `IssueWatcher[]`                                                          |
| POST   | `/api/issues/{id}/watchers` | 👥    | 200 `IssueWatcher[]` — **user hiện tại** bắt đầu theo dõi (đã theo dõi → 400) |
| DELETE | `/api/issues/{id}/watchers` | 👥    | 200 `IssueWatcher[]` — user hiện tại bỏ theo dõi (chưa theo dõi → 404)        |

Không có body, không truyền userId. Nút Watch/Unwatch: kiểm tra `watchers.some(w => w.userId === me.id)`.
Watcher hiện chỉ là dữ liệu — **BE chưa gửi thông báo** cho watcher.

### 6.7 Sprint

| Method | URL                                 | Quyền | Body                                                                                       | Response                                                                            |
| ------ | ----------------------------------- | ----- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| POST   | `/api/sprints`                      | 👥    | `{ projectId: string; name: string; goal?: string; startDate?: string; endDate?: string }` | **201** `Sprint` (luôn `status: 'planned'`)                                         |
| GET    | `/api/sprints/{id}`                 | 👥    | —                                                                                          | 200 `Sprint`                                                                        |
| GET    | `/api/projects/{projectId}/sprints` | 👥    | —                                                                                          | 200 `Sprint[]`                                                                      |
| PATCH  | `/api/sprints/{id}`                 | 👥    | `{ name?; goal?; status?: SprintStatus; startDate?; endDate? }` (partial)                  | 200 `Sprint`                                                                        |
| DELETE | `/api/sprints/{id}`                 | 👥    | —                                                                                          | 204 — mọi issue của sprint **quay về backlog** (`sprintId = null`), không mất issue |

- `endDate >= startDate` (nếu có cả hai) → sai thì 400.
- **Mỗi project tối đa 1 sprint `active`** → kích hoạt sprint thứ 2 thì 400.
- Start sprint = `PATCH { status: 'active' }`; Complete = `PATCH { status: 'completed' }`.
- Partial update không xoá được `goal`/`startDate`/`endDate` về null (null = giữ nguyên).
- Hoàn thành sprint **không** tự chuyển issue chưa xong sang sprint khác — FE muốn thì gọi PUT từng issue.

### 6.8 Epic

| Method | URL                               | Quyền | Body                                                                        | Response                                                      |
| ------ | --------------------------------- | ----- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| POST   | `/api/epics`                      | 👥    | `{ projectId: string; name: string; description?: string; color?: string }` | **201** `Epic`                                                |
| GET    | `/api/epics/{id}`                 | 👥    | —                                                                           | 200 `Epic`                                                    |
| GET    | `/api/projects/{projectId}/epics` | 👥    | —                                                                           | 200 `Epic[]`                                                  |
| PATCH  | `/api/epics/{id}`                 | 👥    | `{ name?; description?; color? }` (partial)                                 | 200 `Epic`                                                    |
| DELETE | `/api/epics/{id}`                 | 👥    | —                                                                           | 204 — còn issue gắn epic → **400** (gỡ epic khỏi issue trước) |

Epic **không có status**. `name` ≤255, `color` dạng `#RRGGBB`.

### 6.9 Comment

| Method | URL                              | Quyền                | Body                  | Response                        |
| ------ | -------------------------------- | -------------------- | --------------------- | ------------------------------- |
| GET    | `/api/issues/{issueId}/comments` | 👥                   | —                     | 200 `Comment[]` — cũ nhất trước |
| POST   | `/api/issues/{issueId}/comments` | 👥                   | `{ content: string }` | **201** `Comment`               |
| PATCH  | `/api/comments/{id}`             | 👥 + là tác giả      | `{ content: string }` | 200 `Comment`                   |
| DELETE | `/api/comments/{id}`             | 👥 + tác giả hoặc 🛡 | —                     | 204                             |

`content` bắt buộc, không rỗng, ≤10000 ký tự. Nội dung là text thuần — nếu FE render markdown/HTML thì phải tự sanitize.

### 6.10 Attachment (file đính kèm)

| Method | URL                                 | Quyền                     | Body                                    | Response                   |
| ------ | ----------------------------------- | ------------------------- | --------------------------------------- | -------------------------- |
| POST   | `/api/issues/{issueId}/attachments` | 👥                        | `multipart/form-data`, field **`file`** | **201** `Attachment`       |
| GET    | `/api/issues/{issueId}/attachments` | 👥                        | —                                       | 200 `Attachment[]`         |
| GET    | `/api/attachments/{id}/download`    | 👥                        | —                                       | 200 nội dung file (binary) |
| DELETE | `/api/attachments/{id}`             | 👥 + người upload hoặc 🛡 | —                                       | 204                        |

- Giới hạn **10MB**/file → vượt quá trả **413**. File rỗng → 400. Mỗi request 1 file.
- **Download cần header Authorization** → **không** dùng `<a href="downloadUrl">` hay `<img src>` trực tiếp (sẽ 401). Phải tải bằng HttpClient:

```ts
// downloadUrl bắt đầu bằng "/api/..." → ghép với host (bỏ "/api" khỏi environment.apiUrl hoặc dùng origin)
this.http.get(`http://localhost:8080${a.downloadUrl}`, { responseType: 'blob' }).subscribe(blob => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = a.fileName;
  link.click();
  URL.revokeObjectURL(url);
});
// Preview ảnh: tương tự, dùng URL.createObjectURL(blob) làm src
```

- Upload bằng `FormData`: `const fd = new FormData(); fd.append('file', file); this.http.post<Attachment>(url, fd)` — **không** tự set `Content-Type` (để trình duyệt tự thêm boundary).
- BE luôn trả `Content-Disposition: attachment` (tên file UTF-8, tiếng Việt OK).

### 6.11 Activity log (lịch sử — chỉ đọc)

| Method | URL                                    | Quyền | Query                                                 | Response                                 |
| ------ | -------------------------------------- | ----- | ----------------------------------------------------- | ---------------------------------------- |
| GET    | `/api/projects/{projectId}/activities` | 👥    | `page` (mặc định 0), `size` (mặc định 50, tối đa 100) | 200 `ActivityLog[]` — **mới nhất trước** |
| GET    | `/api/issues/{issueId}/activities`     | 👥    | như trên                                              | 200 `ActivityLog[]`                      |

Response là **mảng thuần** (không có tổng số trang). Hết dữ liệu khi mảng trả về ít hơn `size`.

Nội dung `details` theo `action`:

| action                                    | details                                                                                                                                | issueId  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `issue_created`                           | title của issue                                                                                                                        | có       |
| `issue_updated`                           | danh sách field đổi, cách nhau `", "`: `type, title, description, priority, storyPoints, dueDate, epic, sprint, parentIssue, assignee` | có       |
| `issue_status_changed`                    | `"todo → in_progress"`                                                                                                                 | có       |
| `issue_deleted`                           | `"AF-1 <title>"`                                                                                                                       | **null** |
| `label_added` / `label_removed`           | tên label                                                                                                                              | có       |
| `comment_added` / `comment_deleted`       | null                                                                                                                                   | có       |
| `attachment_added` / `attachment_deleted` | tên file                                                                                                                               | có       |
| `sprint_created` / `sprint_deleted`       | tên sprint                                                                                                                             | null     |
| `sprint_status_changed`                   | `"Sprint 1: planned → active"`                                                                                                         | null     |
| `member_added`                            | `"Bob (member)"`                                                                                                                       | null     |
| `member_role_changed`                     | `"Bob → admin"`                                                                                                                        | null     |
| `member_removed`                          | tên thành viên                                                                                                                         | null     |

Khi issue bị xoá, các log cũ của nó còn lại nhưng `issueId`/`issueKey` thành `null`.

---

## 7. Kanban board — cách dựng và kéo thả

```ts
const COLUMNS: { key: IssueStatus; title: string }[] = [
  { key: 'todo', title: 'To Do' },
  { key: 'in_progress', title: 'In Progress' },
  { key: 'testing', title: 'Testing' },
  { key: 'done', title: 'Done' },
];

// 1. Tải
issues = await GET`/api/projects/${projectId}/issues`;
// (tuỳ chọn) chỉ hiện sprint đang chạy: lấy sprint status 'active' từ /projects/{id}/sprints rồi lọc issue.sprintId === activeSprint.id
// 2. Nhóm: columns[i].cards = issues.filter(x => x.status === COLUMNS[i].key).sort((a, b) => a.issueNumber - b.issueNumber)
// 3. Kéo thả sang cột khác: cập nhật UI lạc quan → PATCH `/api/issues/${id}/status` { status: targetColumn.key }
//    → lỗi thì hoàn tác vị trí card và hiện error.detail
// 4. Kéo thả trong CÙNG cột: BE không lưu thứ tự → không gọi API (thứ tự sẽ về lại theo issueNumber khi tải lại)
```

Trong lúc kéo, FE đồng thời gửi vị trí card qua WebSocket để thành viên khác thấy card đang bay (viền nét đứt + tên người kéo) — xem **mục 8.3**.

Dữ liệu card lấy từ `Issue`: `issueKey`, `title`, `type`, `priority`, `assigneeName`, `dueDate`, `labels[]` (dùng `label.color` hex). `completed` = `status === 'done'`.

---

## 8. WebSocket (board realtime)

Có 2 loại realtime trên board, đi trên 2 topic riêng:

| Topic                               | Dùng để                                                             | Tần suất                                | Mục |
| ----------------------------------- | ------------------------------------------------------------------- | --------------------------------------- | --- |
| `/topic/projects/{projectId}/board` | Dữ liệu issue **đã lưu DB** thay đổi (đổi status, sửa, label)       | thấp (mỗi thao tác 1 message)           | 8.2 |
| `/topic/projects/{projectId}/drag`  | **Đang kéo** card — vị trí card theo chuột người kéo (không lưu DB) | cao (~20 message/giây khi có người kéo) | 8.3 |
| `/user/queue/errors`                | Lỗi **riêng** cho tab của mình (gửi drag sai, subscribe bị chặn)    | hiếm                                    | 8.4 |

### 8.1 Kết nối

- Endpoint SockJS: `http://localhost:8080/ws/kanban` (giữ `environment.wsUrl` hiện tại).
- **Bắt buộc gửi token trong header của frame CONNECT** (handshake SockJS không gửi được header HTTP):

```ts
this.client = new Client({
  webSocketFactory: () => new SockJS(environment.wsUrl),
  reconnectDelay: 5000,
  heartbeatIncoming: 4000,
  heartbeatOutgoing: 4000,
  // beforeConnect chạy trước MỖI lần connect/reconnect → luôn lấy token mới nhất
  beforeConnect: () => {
    this.client.connectHeaders = { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` };
  },
  onConnect: () => {
    // stompjs KHÔNG tự subscribe lại sau reconnect → mọi subscribe phải đặt trong onConnect
    // (hoặc service giữ danh sách subscription và đăng ký lại ở đây)
    this.client.subscribe('/user/queue/errors', msg => this.handleWsError(JSON.parse(msg.body)));
    // + subscribe lại /board và /drag của project đang mở (nếu có)
  },
});
```

Chỉ gọi `connect()` **sau khi đã đăng nhập**. Không có / sai token → nhận ERROR frame (`onStompError`, `frame.headers.message = "STOMP CONNECT thiếu hoặc sai token"`) và bị ngắt kết nối; với `reconnectDelay` nó sẽ thử lại liên tục → nên `deactivate()` khi logout.

### 8.2 `/topic/projects/{projectId}/board` — issue đã thay đổi

- Payload: **một `Issue` đầy đủ** (giống hệt response REST). Handler: tìm card theo `id` → thay bằng dữ liệu mới (và chuyển cột nếu `status` đổi).
- BE broadcast khi: đổi status (`PATCH /status`), sửa issue (`PUT`), gắn/gỡ label. Người vừa thao tác **cũng nhận** message của chính mình → handler phải idempotent (thay thế, không cộng dồn).
- BE **chưa** broadcast khi: tạo issue, xoá issue, comment, attachment, sprint. Nếu nhận message có `id` chưa có trong board (vd issue mới được sửa) → thêm vào hoặc bỏ qua tuỳ UI; FE nên tự refetch sau khi chính mình tạo/xoá.

### 8.3 `/topic/projects/{projectId}/drag` — kéo thả realtime kiểu Figma

**Mục tiêu UI:** khi user A đang kéo 1 card, mọi thành viên khác đang mở board thấy một **bản sao card bay theo chuột của A**, có **viền nét đứt** (màu riêng của A) bao quanh và **nhãn tên A ở góc dưới bên phải** card.

BE chỉ **chuyển tiếp** (relay) vị trí, **không lưu DB**. Việc đổi cột thật vẫn là `PATCH /api/issues/{id}/status` như mục 7.

#### Kiểu dữ liệu

```ts
export type DragPhase = 'start' | 'move' | 'end' | 'cancel';

// FE → BE: client.publish({ destination: `/app/projects/${projectId}/drag`, body: JSON.stringify(req) })
export interface DragRequest {
  phase: DragPhase; // bắt buộc
  issueId: string; // bắt buộc — card đang kéo
  x?: number; // bắt buộc với start/move; tuỳ chọn với end/cancel. 0..1 (xem "Toạ độ" bên dưới)
  y?: number; // như x
  overStatus?: IssueStatus | null; // cột con trỏ đang nằm trên; null/không gửi = ở ngoài mọi cột
}

// BE → mọi client subscribe /topic/projects/{projectId}/drag (KỂ CẢ người kéo — tự lọc theo userId)
export interface DragEvent {
  phase: DragPhase;
  projectId: string;
  issueId: string;
  userId: string; // người đang kéo — BE lấy từ token, không lấy từ body
  userName: string; // fullName — hiển thị ở nhãn góc dưới phải
  avatarUrl: string | null;
  color: string; // hex "#RRGGBB" — màu viền nét đứt + nền nhãn tên. BE chọn theo userId → mọi client cùng 1 màu cho 1 người
  x: number | null; // vị trí mới nhất (end/cancel không gửi toạ độ → BE điền vị trí move cuối cùng)
  y: number | null;
  overStatus: IssueStatus | null; // end/cancel không gửi → giữ giá trị của move cuối cùng
  sentAt: string; // ISO-8601 giờ server — chỉ để debug, ĐỪNG dùng tính timeout (lệch giờ máy client)
}
```

Mẫu thật (B nhận khi A đang kéo):

```json
{
  "avatarUrl": null,
  "color": "#FFC53D",
  "issueId": "49fc27fc-36ad-42a2-bb34-95e33b4fd4cd",
  "overStatus": "in_progress",
  "phase": "move",
  "projectId": "6abb752b-140a-4ecc-80d0-9081553ec477",
  "sentAt": "2026-10-22T04:08:52.589433Z",
  "userId": "6e830fea-5446-44a6-ae6d-5035f1d03a03",
  "userName": "Người a",
  "x": 0.6,
  "y": 0.2
}
```

#### Toạ độ `x`, `y`

Mỗi người có kích thước màn hình khác nhau → **không gửi pixel**. Gửi **góc trên-trái của card** theo tỉ lệ của **vùng nội dung board** (phần tử bao 4 cột, tính cả phần cuộn):

```ts
// Phía người kéo
const b = boardEl.getBoundingClientRect();
x = (cardLeftPx - b.left + boardEl.scrollLeft) / boardEl.scrollWidth;
y = (cardTopPx - b.top + boardEl.scrollTop) / boardEl.scrollHeight;
// cardLeftPx/cardTopPx = pointerPosition - offset con trỏ trong card (ghi lại lúc start)
// Kẹp về [0, 1] trước khi gửi — BE trả lỗi 400 nếu ngoài khoảng (mục 8.4)

// Phía người xem — đặt bản sao card trong lớp overlay position:absolute phủ toàn bộ vùng nội dung board
left = x * boardEl.scrollWidth;
top = y * boardEl.scrollHeight;
width = chiều rộng 1 cột trên màn hình NGƯỜI XEM (không dùng kích thước của người kéo)
```

#### Vòng đời 1 lượt kéo (phía người kéo)

| Sự kiện Angular CDK                            | Gửi                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `(cdkDragStarted)`                             | `start` với `x`, `y`, `overStatus` = cột hiện tại của card                                                                            |
| `(cdkDragMoved)`                               | `move` — **throttle tối đa 1 message / 50ms** (CDK bắn event mỗi lần chuột nhích). Luôn gửi vị trí mới nhất, bỏ các vị trí trung gian |
| `(cdkDropListEntered)` / `(cdkDropListExited)` | chỉ cập nhật biến `overStatus` cục bộ (gửi kèm `move` kế tiếp)                                                                        |
| `(cdkDropListDropped)` sang **cột khác**       | gọi `PATCH /api/issues/{id}/status` → **đợi xong (thành công hay lỗi)** → gửi `end`                                                   |
| `(cdkDropListDropped)` trong **cùng cột**      | gửi `end` ngay (không gọi API — mục 7)                                                                                                |
| thả ra ngoài mọi cột / nhấn Esc / huỷ          | gửi `cancel`                                                                                                                          |

Vì sao gửi `end` **sau** khi PATCH xong: BE broadcast `/board` (issue đã sang cột mới) trong lúc xử lý PATCH, tức là **trước** khi người kéo nhận response và gửi `end`. Người xem vì vậy nhận theo thứ tự: `move…` → `Issue` mới trên `/board` (card thật nhảy sang cột mới) → `end` (xoá bản sao) — không bị nháy card về cột cũ. BE đảm bảo giữ đúng thứ tự message của từng tab cả chiều gửi lên lẫn chiều nhận về.

#### Phía người xem

```ts
// key = `${userId}:${issueId}`
remoteDrags = new Map<string, { event: DragEvent; lastSeen: number }>();

onDragEvent(e: DragEvent) {
  if (e.userId === me.id) return; // bỏ message của chính mình
  const key = `${e.userId}:${e.issueId}`;
  if (e.phase === 'end' || e.phase === 'cancel') { this.remoteDrags.delete(key); return; }
  // start HOẶC move: tạo nếu chưa có (mở board giữa chừng sẽ bỏ lỡ start — move đã đủ field để vẽ)
  this.remoteDrags.set(key, { event: e, lastSeen: Date.now() });
}
// setInterval 1s: xoá entry có Date.now() - lastSeen > 5000 (phòng mạng chập chờn mất end/cancel)
```

Hiển thị mỗi entry:

- **Bản sao card**: render lại card của issue `issueId` (lấy từ danh sách issue đã tải), `position: absolute` trong overlay, `pointer-events: none`, `z-index` cao, `opacity: .9`, có thể xoay nhẹ `rotate(2deg)` + đổ bóng.
- **Viền nét đứt**: `outline: 2px dashed ${color}; outline-offset: 3px;` (hoặc `border: 2px dashed`).
- **Nhãn tên** ở **góc dưới bên phải**, nằm ngay dưới viền: `position: absolute; right: -3px; top: calc(100% + 6px);` nền `color`, chữ trắng, font 12px, bo góc, nội dung `userName` (có thể kèm avatar nhỏ từ `avatarUrl`).
- **Mượt chuyển động**: message đến ~20 lần/giây → dùng `transform: translate(left, top)` + `transition: transform 80ms linear` thay vì đổi `left/top` trực tiếp.
- **Card gốc** ở cột cũ: làm mờ (`opacity: .4`) và **khoá kéo** `[cdkDragDisabled]="isRemoteDragging(issue.id)"` để 2 người không kéo cùng 1 card. (BE không khoá — đây là khoá mềm phía UI.)
- (Tuỳ chọn) tô nhẹ cột `overStatus` bằng `color` để thấy A sắp thả vào cột nào.

#### Quy tắc BE kiểm tra (vi phạm → lỗi gửi về `/user/queue/errors` của người kéo, mục 8.4; message KHÔNG được broadcast)

- `phase` phải là 1 trong 4 giá trị; `issueId` bắt buộc.
- `start`: issue phải tồn tại (404) và thuộc đúng `projectId` trong destination (400); người gửi phải là thành viên (403); project chưa archive (400).
- `move` / `end` / `cancel`: phải có `start` trước đó cho đúng `issueId` đó, trên **cùng tab** (cùng kết nối WebSocket), và lượt kéo chưa kết thúc → nếu không: 400 `"Chưa gửi phase start cho issue … (hoặc lượt kéo đã kết thúc)"`.
- `x`, `y`: bắt buộc với `start`/`move`, phải trong `[0, 1]`. `overStatus` nếu có phải là `IssueStatus` hợp lệ.
- Mỗi tab chỉ kéo **1 card tại 1 thời điểm**: gửi `start` mới khi lượt cũ chưa `end` → BE tự broadcast `cancel` cho lượt cũ.
- **Tab đóng / mất mạng / logout giữa lúc kéo** → BE tự broadcast `cancel` → bản sao biến mất ở màn hình người khác.
- Sau khi nhận lỗi cho 1 lượt kéo: **ngừng gửi `move`** cho lượt đó (nếu không mỗi `move` lại sinh thêm 1 lỗi). Card vẫn kéo thả bình thường ở máy mình, chỉ là người khác không thấy.

### 8.4 `/user/queue/errors` — lỗi riêng của tab mình

Frame `SEND` của STOMP không có HTTP status trả về, nên BE gửi lỗi về destination riêng này (**chỉ tab gây lỗi** nhận, tab khác cùng user không nhận). Subscribe **1 lần trong `onConnect`**, trước các subscribe khác.

```ts
export interface WsError {
  status: number; // 400 | 403 | 404 — cùng ý nghĩa như REST
  detail: string; // câu thông báo (tiếng Việt với lỗi nghiệp vụ)
  source: 'drag' | 'subscribe'; // drag = message /app/.../drag bị từ chối; subscribe = SUBSCRIBE bị chặn
}
```

Mẫu thật:

```json
{ "status": 400, "detail": "Chưa gửi phase start cho issue 49fc27fc-36ad-42a2-bb34-95e33b4fd4cd (hoặc lượt kéo đã kết thúc)", "source": "drag" }
{ "status": 403, "detail": "Bạn không phải thành viên của project này, không thể subscribe /topic/projects/6abb752b-140a-4ecc-80d0-9081553ec477/drag", "source": "subscribe" }
```

- `source: 'subscribe'` (403): user không (còn) là thành viên project → BE **bỏ qua** frame SUBSCRIBE (không nhận gì từ topic đó, kết nối vẫn giữ). Gợi ý: báo lỗi + đưa về danh sách project.
- `source: 'drag'`: chỉ cần `console.warn` + ngừng gửi `move` cho lượt kéo hiện tại; không cần toast cho người dùng.

### 8.5 Tóm tắt destination

| Chiều   | Destination                         | Payload       |
| ------- | ----------------------------------- | ------------- |
| BE → FE | `/topic/projects/{projectId}/board` | `Issue`       |
| BE → FE | `/topic/projects/{projectId}/drag`  | `DragEvent`   |
| BE → FE | `/user/queue/errors`                | `WsError`     |
| FE → BE | `/app/projects/{projectId}/drag`    | `DragRequest` |

Vào board của project: subscribe **cả** `/board` và `/drag`; rời board: `unsubscribe()` cả hai (và gửi `cancel` nếu đang kéo dở).

---

## 9. Định dạng lỗi

Lỗi có body theo dạng Problem Details (JHipster):

```ts
export interface ApiError {
  status: number;
  title: string; // "Bad Request", "Forbidden", ...
  detail: string; // ✅ câu thông báo để hiển thị cho người dùng (tiếng Việt với lỗi nghiệp vụ)
  message: string; // mã: "error.validation" | "error.http.400" | "error.http.403" | ...
  path: string;
  instance: string;
  type: string;
  fieldErrors?: { objectName: string; field: string; message: string }[]; // chỉ khi message = "error.validation"
}
```

Mẫu thật:

```json
// Lỗi nghiệp vụ (400/403/404/409) — hiển thị thẳng `detail`
{ "status": 400, "title": "Bad Request", "detail": "Issue loại sub_task bắt buộc có parentIssueId",
  "message": "error.http.400", "path": "/api/issues", "instance": "/api/issues",
  "type": "https://www.jhipster.tech/problem/problem-with-message" }

// Lỗi validate field (400) — `detail` là chuỗi kỹ thuật dài, KHÔNG hiển thị; dùng `fieldErrors` để báo lỗi từng ô input
{ "status": 400, "title": "Method argument not valid", "message": "error.validation",
  "detail": "Validation failed for argument [0] in public ...",
  "fieldErrors": [ { "objectName": "issueRequest", "field": "title", "message": "must not be blank" } ],
  "path": "/api/issues", "instance": "/api/issues", "type": "https://www.jhipster.tech/problem/constraint-violation" }

// Đăng nhập sai (401)
{ "status": 401, "title": "Unauthorized", "detail": "Bad credentials", "message": "error.http.401",
  "path": "/api/auth/login", "instance": "/api/auth/login", "type": "https://www.jhipster.tech/problem/problem-with-message" }
```

| Status | Khi nào                                                                                 | FE nên                                                                                  |
| ------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 400    | Sai dữ liệu / vi phạm quy tắc nghiệp vụ / enum sai                                      | `fieldErrors` → lỗi từng ô; không thì hiện `detail`                                     |
| 401    | Thiếu/sai/hết hạn token (**body rỗng**), hoặc đăng nhập sai/tài khoản bị khoá (có body) | Đang ở trang login → hiện "Sai tài khoản hoặc mật khẩu"; nơi khác → xoá token, về login |
| 403    | Không phải member / không đủ quyền admin / sửa comment người khác                       | Hiện `detail`                                                                           |
| 404    | Id không tồn tại                                                                        | Hiện `detail` hoặc trang not found                                                      |
| 409    | Trùng email / username / project key                                                    | Hiện `detail` (tiếng Anh: `"Email already exists: ..."`)                                |
| 413    | File > 10MB                                                                             | Chặn trước ở FE (`file.size > 10 * 1024 * 1024`)                                        |

Đăng nhập sai mật khẩu hay email không tồn tại đều trả cùng `"Bad credentials"` (cố ý, để không lộ email nào đã đăng ký).

---

## 10. Mẫu response thật

```json
// POST /api/auth/login
{ "accessToken": "eyJhbGciOiJIUzUxMiJ9...", "tokenType": "Bearer", "expiresIn": 86400,
  "user": { "id": "ea09482c-bb65-4dc8-9508-1314467696f6", "email": "alice@example.com", "username": "alice",
            "fullName": "Alice Nguyen", "avatarUrl": null, "active": true,
            "createdAt": "2026-10-19T06:44:19.858912Z", "updatedAt": "2026-10-19T06:44:19.858912Z" } }

// POST /api/projects
{ "id": "2284ff3a-0aaa-411c-8951-26c6d9a43ad7", "key": "AF", "name": "Agile Flux", "description": "demo",
  "archived": false, "ownerId": "ea09482c-bb65-4dc8-9508-1314467696f6", "ownerName": "Alice Nguyen",
  "leaderId": null, "leaderName": null,
  "createdAt": "2026-10-19T06:44:20.462423Z", "updatedAt": "2026-10-19T06:44:20.462423Z" }

// GET /api/projects/{id}/members (ngay sau khi tạo project)
[ { "id": "35d8843f-4a62-4f82-b79a-227726d6681d", "projectId": "2284ff3a-0aaa-411c-8951-26c6d9a43ad7",
    "userId": "ea09482c-bb65-4dc8-9508-1314467696f6", "userFullName": "Alice Nguyen", "userEmail": "alice@example.com",
    "role": "admin", "createdAt": "2026-10-19T06:44:20.463973Z", "updatedAt": "2026-10-19T06:44:20.463973Z" } ]

// POST /api/sprints
{ "id": "6c961673-983b-40d7-ba3d-843c26642419", "projectId": "2284ff3a-0aaa-411c-8951-26c6d9a43ad7",
  "name": "Sprint 1", "goal": null, "status": "planned", "startDate": "2026-10-20", "endDate": "2026-11-03",
  "createdAt": "2026-10-19T06:44:20.693868Z", "updatedAt": "2026-10-19T06:44:20.693868Z" }

// POST /api/issues/{id}/labels/{labelId}
{ "id": "661709dd-55cb-46c3-8ef5-77859f9c2782", "projectId": "2284ff3a-0aaa-411c-8951-26c6d9a43ad7",
  "issueKey": "AF-1", "issueNumber": 1, "epicId": null, "sprintId": null, "parentIssueId": null,
  "type": "story", "title": "Login page", "description": null, "status": "todo", "priority": "high",
  "storyPoints": 3.5, "reporterId": "ea09482c-bb65-4dc8-9508-1314467696f6", "reporterName": "Alice Nguyen",
  "assigneeId": null, "assigneeName": null, "dueDate": "2026-10-30",
  "labels": [ { "id": "1dcc92ce-951c-451c-a8e8-b47f341eceb5", "projectId": "2284ff3a-0aaa-411c-8951-26c6d9a43ad7",
                "name": "backend", "color": "#ef4444",
                "createdAt": "2026-10-19T06:44:20.814719Z", "updatedAt": "2026-10-19T06:44:20.814719Z" } ],
  "createdAt": "2026-10-19T06:44:20.934794Z", "updatedAt": "2026-10-19T06:44:20.934794Z" }

// POST /api/issues/{issueId}/comments
{ "id": "c56dcfbd-d931-45fa-ad7e-defbb2fbc925", "issueId": "661709dd-55cb-46c3-8ef5-77859f9c2782",
  "authorId": "ea09482c-bb65-4dc8-9508-1314467696f6", "authorName": "Alice Nguyen", "authorAvatarUrl": null,
  "content": "Looks good", "edited": false,
  "createdAt": "2026-10-19T06:44:21.119690Z", "updatedAt": "2026-10-19T06:44:21.119690Z" }

// POST /api/issues/{issueId}/attachments
{ "id": "ad7dc1ea-c3f1-478a-9210-a1d37a3c4994", "issueId": "661709dd-55cb-46c3-8ef5-77859f9c2782",
  "uploaderId": "ea09482c-bb65-4dc8-9508-1314467696f6", "uploaderName": "Alice Nguyen",
  "fileName": "a.txt", "contentType": "text/plain", "fileSize": 3,
  "downloadUrl": "/api/attachments/ad7dc1ea-c3f1-478a-9210-a1d37a3c4994/download",
  "createdAt": "2026-10-19T06:44:21.204049Z" }

// GET /api/projects/{id}/activities?size=2
[ { "id": "76bc8ea0-bb6b-4b1c-b3fe-d65c5f13eb10", "projectId": "2284ff3a-0aaa-411c-8951-26c6d9a43ad7",
    "issueId": "661709dd-55cb-46c3-8ef5-77859f9c2782", "issueKey": "AF-1",
    "actorId": "ea09482c-bb65-4dc8-9508-1314467696f6", "actorName": "Alice Nguyen",
    "action": "attachment_added", "details": "a.txt", "createdAt": "2026-10-19T06:44:21.205801Z" },
  { "id": "d3429096-1d8d-4819-bf0d-bbb827e90b36", "projectId": "2284ff3a-0aaa-411c-8951-26c6d9a43ad7",
    "issueId": "661709dd-55cb-46c3-8ef5-77859f9c2782", "issueKey": "AF-1",
    "actorId": "ea09482c-bb65-4dc8-9508-1314467696f6", "actorName": "Alice Nguyen",
    "action": "comment_added", "details": null, "createdAt": "2026-10-19T06:44:21.121345Z" } ]
```

---

## 11. Luồng màn hình gợi ý

1. **Login/Register** → lưu `accessToken` vào `localStorage['token']`, lưu `user` (để biết `me.id` — cần để lọc message drag của chính mình) → `websocket.connect()` → trong `onConnect` subscribe `/user/queue/errors`.
2. **Danh sách project**: `GET /projects` → lọc `archived`. Tạo project: form `key` + `name`.
3. **Vào project**: song song `GET /projects/{id}`, `/members`, `/sprints`, `/epics`, `/labels`, `/issues` → subscribe `/topic/projects/{id}/board` **và** `/topic/projects/{id}/drag` (mục 8.3). Rời project → unsubscribe cả hai.
4. **Board**: mục 7. **Backlog**: issue có `sprintId === null`.
5. **Chi tiết issue** (modal/drawer): issue + `GET /issues/{id}/comments`, `/attachments`, `/watchers`, `/activities`.
6. **Ô chọn assignee**: dùng `/projects/{id}/members` (assignee phải là thành viên), **không** dùng `/users`.
7. **Thêm thành viên**: dùng `GET /users` để chọn, loại những người đã có trong `/members`.
8. **Logout**: xoá token → `websocket.disconnect()` → về login.

---

## 12. BE CHƯA có (đừng gọi — cần thì báo để làm thêm ở BE)

- Board/Column/Card API, thứ tự card trong cột (`position`), optimistic lock `version`.
- Số lượng comment/attachment trên `Issue` (card hiển thị `commentsCount` → hiện chưa có; phải gọi API riêng cho từng issue, hoặc bổ sung field ở BE).
- Lọc/tìm kiếm/phân trang issue (hiện trả toàn bộ issue của project).
- Refresh token, quên mật khẩu, xác thực email.
- Resize/crop avatar ở BE (BE lưu nguyên file đã upload, ≤2MB).
- Thông báo (notification) cho watcher.
- Broadcast WebSocket khi tạo/xoá issue, comment, attachment, sprint.
- Role admin toàn hệ thống.
