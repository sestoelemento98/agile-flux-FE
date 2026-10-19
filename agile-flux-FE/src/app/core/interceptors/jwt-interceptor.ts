import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService, TOKEN_KEY } from '../auth/auth';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const isLogin = req.url.endsWith('/auth/login');

  if (token && !isLogin) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((err: unknown) => {
      // 401 ở /auth/login = sai tài khoản (trang login tự xử lý).
      // 401 ở chỗ khác = thiếu/sai/hết hạn token → xoá token, về trang login.
      if (err instanceof HttpErrorResponse && err.status === 401 && !isLogin) {
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};
