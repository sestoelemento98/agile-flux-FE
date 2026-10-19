import { Pipe, PipeTransform } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Mục 6.1.1 — chỉ nhận PNG/JPEG/GIF/WEBP, tối đa 2MB (BE kiểm tra lại bằng magic bytes). */
export const AVATAR_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';
export const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

/** "http://localhost:8080/api" (dev) → "http://localhost:8080"; "/api" (prod) → "". */
const API_HOST = environment.apiUrl.replace(/\/api\/?$/, '');

/**
 * avatarUrl có 3 dạng:
 * - null → không có ảnh (hiện chữ cái đầu)
 * - "/api/avatars/<uuid>.png" → ảnh upload, đường dẫn tương đối từ host BE (public, không cần token)
 * - "https://..." → URL ngoài
 */
export function avatarSrc(avatarUrl: string | null | undefined): string | undefined {
  if (!avatarUrl) return undefined;
  if (avatarUrl.startsWith('/')) return API_HOST + avatarUrl;
  return avatarUrl;
}

/** Ảnh đã upload lên BE (khác URL ngoài). */
export function isUploadedAvatar(avatarUrl: string | null | undefined): boolean {
  return !!avatarUrl && avatarUrl.startsWith('/');
}

/** Dùng: `[nzSrc]="user.avatarUrl | avatarSrc"` */
@Pipe({ name: 'avatarSrc' })
export class AvatarSrcPipe implements PipeTransform {
  transform(avatarUrl: string | null | undefined): string | undefined {
    return avatarSrc(avatarUrl);
  }
}
