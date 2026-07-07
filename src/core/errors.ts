// 引入统一错误类，方便把不同钱包的错误格式整理成同一种格式。
import { WalletKitError } from '../types';

// normalizeWalletError 把未知错误转换成 WalletKitError。
export function normalizeWalletError(error: unknown): WalletKitError {
  // 如果本来就是 WalletKitError，就不用重复包装。
  if (error instanceof WalletKitError) return error;

  // 把未知错误临时视为可能带 code 和 message 的对象。
  const maybe = error as { code?: number | string; message?: string } | undefined;
  // MetaMask 等 EVM 钱包里，4001 通常表示用户拒绝；ACTION_REJECTED 也是常见拒绝标识。
  if (maybe?.code === 4001 || maybe?.code === 'ACTION_REJECTED') {
    // 返回统一的 USER_REJECTED 错误。
    return new WalletKitError('USER_REJECTED', maybe.message ?? 'User rejected wallet request.', error);
  }

  // -32002 是 MetaMask 常见的“已有请求等待处理”错误码。
  if (maybe?.code === -32002 || maybe?.message?.toLowerCase().includes('already pending')) {
    // 返回统一的 REQUEST_PENDING 错误，提示用户先处理钱包扩展里的弹窗。
    return new WalletKitError('REQUEST_PENDING', maybe.message ?? 'Wallet request is already pending.', error);
  }

  // 如果错误消息里包含 timeout，就归类为连接超时。
  if (maybe?.message?.toLowerCase().includes('timeout')) {
    // 返回统一的 CONNECT_TIMEOUT 错误。
    return new WalletKitError('CONNECT_TIMEOUT', maybe.message, error);
  }

  // 其它无法识别的错误统一归类为 UNKNOWN。
  return new WalletKitError('UNKNOWN', maybe?.message ?? 'Unexpected wallet error.', error);
}

// withTimeout 给任意 Promise 增加超时能力。
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  // timeout 保存 setTimeout 返回值，后面成功或失败后要清理。
  let timeout: ReturnType<typeof setTimeout> | undefined;
  // timeoutPromise 会在指定时间后 reject。
  const timeoutPromise = new Promise<T>((_, reject) => {
    // 到时间后抛出统一的 CONNECT_TIMEOUT 错误。
    timeout = setTimeout(() => reject(new WalletKitError('CONNECT_TIMEOUT', message)), timeoutMs);
  });

  // Promise.race 表示谁先完成就用谁的结果。
  return Promise.race([promise, timeoutPromise]).finally(() => {
    // 如果定时器还存在，就清掉，避免无意义的定时器残留。
    if (timeout) clearTimeout(timeout);
  });
}
