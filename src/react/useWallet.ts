// 引入 React 的 useContext，用来读取 Context。
import { useContext } from 'react';
// 引入 WalletProvider 创建的钱包上下文对象。
import { WalletContext } from './WalletProvider';

// useWallet 是业务组件读取钱包状态和操作方法的 Hook。
export function useWallet() {
  // 从 WalletContext 里读取 Provider 提供的 value。
  const context = useContext(WalletContext);
  // 如果 context 不存在，说明当前组件没有被 WalletProvider 包住。
  if (!context) {
    // 抛出明确错误，提醒使用者必须把组件放在 WalletProvider 内部。
    throw new Error('useWallet must be used inside WalletProvider.');
  }
  // 返回钱包上下文，里面有 state、connect、disconnect 等能力。
  return context;
}
