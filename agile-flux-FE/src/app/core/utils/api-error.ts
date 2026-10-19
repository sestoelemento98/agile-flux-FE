import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormGroup } from '@angular/forms';
import { ApiError } from '../models/api.models';

function asApiError(err: unknown): ApiError | null {
  if (err instanceof HttpErrorResponse && err.error && typeof err.error === 'object') {
    return err.error as ApiError;
  }
  return null;
}

/**
 * Câu thông báo hiển thị cho người dùng (mục 9):
 * - lỗi nghiệp vụ → `detail`
 * - lỗi validate → `detail` là chuỗi kỹ thuật nên không hiện, dùng fieldErrors
 */
export function apiErrorMessage(err: unknown, fallback = 'Đã có lỗi xảy ra'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Không kết nối được tới máy chủ';
    if (err.status === 413) return 'Tệp vượt quá giới hạn 10MB';
  }
  const api = asApiError(err);
  if (!api) return fallback;
  if (api.message === 'error.validation') {
    const fe = api.fieldErrors ?? [];
    return fe.length
      ? fe.map((f) => `${f.field}: ${f.message}`).join('; ')
      : 'Dữ liệu không hợp lệ';
  }
  return api.detail || api.title || fallback;
}

/**
 * Gắn fieldErrors của BE vào đúng ô input (control name = tên field BE).
 * Trả về true nếu đã gắn được ít nhất một lỗi.
 */
export function applyFieldErrors(form: FormGroup, err: unknown): boolean {
  const api = asApiError(err);
  if (api?.message !== 'error.validation' || !api.fieldErrors?.length) return false;
  let applied = false;
  for (const fe of api.fieldErrors) {
    const control: AbstractControl | null = form.get(fe.field);
    if (control) {
      control.setErrors({ ...(control.errors ?? {}), server: fe.message });
      control.markAsDirty();
      applied = true;
    }
  }
  return applied;
}
