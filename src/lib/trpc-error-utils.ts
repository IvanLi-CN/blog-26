import type { TRPCClientError } from '@trpc/client';
import type { AppRouter } from '~/server/router';

/**
 * 获取用户友好的错误消息
 */
export function getErrorMessage(error: TRPCClientError<AppRouter>): string {
  // 检查是否有 Zod 验证错误
  if (error.data?.zodError) {
    const zodError = error.data.zodError;
    if (zodError.fieldErrors) {
      const firstFieldError = Object.values(zodError.fieldErrors)[0];
      if (firstFieldError && firstFieldError[0]) {
        return firstFieldError[0];
      }
    }
    if (zodError.formErrors && zodError.formErrors[0]) {
      return zodError.formErrors[0];
    }
  }

  // 根据错误代码返回友好消息
  switch (error.data?.code) {
    case 'BAD_REQUEST':
      return error.message || '请求参数错误';
    case 'UNAUTHORIZED':
      return '请先登录';
    case 'FORBIDDEN':
      return '权限不足';
    case 'NOT_FOUND':
      return '请求的资源不存在';
    case 'METHOD_NOT_SUPPORTED':
      return '不支持的请求方法';
    case 'TIMEOUT':
      return '请求超时，请重试';
    case 'CONFLICT':
      return '数据冲突，请刷新后重试';
    case 'PRECONDITION_FAILED':
      return '前置条件不满足';
    case 'PAYLOAD_TOO_LARGE':
      return '请求数据过大';
    case 'UNPROCESSABLE_CONTENT':
      return '请求数据格式错误';
    case 'TOO_MANY_REQUESTS':
      return '请求过于频繁，请稍后重试';
    case 'CLIENT_CLOSED_REQUEST':
      return '请求被取消';
    case 'INTERNAL_SERVER_ERROR':
      return '服务器内部错误，请稍后重试';
    default:
      return error.message || '未知错误';
  }
}

/**
 * 检查错误是否为网络错误
 */
export function isNetworkError(error: TRPCClientError<AppRouter>): boolean {
  return (
    error.data?.code === 'CLIENT_CLOSED_REQUEST' || error.message.includes('fetch') || error.message.includes('network')
  );
}

/**
 * 检查错误是否为认证错误
 */
export function isAuthError(error: TRPCClientError<AppRouter>): boolean {
  return error.data?.code === 'UNAUTHORIZED' || error.data?.code === 'FORBIDDEN';
}

/**
 * 检查错误是否为速率限制错误
 */
export function isRateLimitError(error: TRPCClientError<AppRouter>): boolean {
  return error.data?.code === 'TOO_MANY_REQUESTS';
}

/**
 * 检查错误是否为验证错误
 */
export function isValidationError(error: TRPCClientError<AppRouter>): boolean {
  return error.data?.code === 'BAD_REQUEST' && !!error.data?.zodError;
}

/**
 * 获取错误的严重程度
 */
export function getErrorSeverity(error: TRPCClientError<AppRouter>): 'info' | 'warning' | 'error' {
  if (isValidationError(error)) {
    return 'warning';
  }

  if (isNetworkError(error) || isRateLimitError(error)) {
    return 'warning';
  }

  if (isAuthError(error)) {
    return 'info';
  }

  return 'error';
}

/**
 * 格式化错误用于显示
 */
export function formatErrorForDisplay(error: TRPCClientError<AppRouter>) {
  return {
    message: getErrorMessage(error),
    severity: getErrorSeverity(error),
    isNetworkError: isNetworkError(error),
    isAuthError: isAuthError(error),
    isRateLimitError: isRateLimitError(error),
    isValidationError: isValidationError(error),
    code: error.data?.code,
    httpStatus: error.data?.httpStatus,
  };
}
