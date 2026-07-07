// 引入 DeepLink 配置和钱包适配器类型。
import type { DeepLinkConfig, WalletAdapter } from '../types';
// 引入 MetaMask 钱包 logo。
import metamaskLogo from '../assets/metamask.png';
// 引入 OKX Wallet 钱包 logo。
import okxLogo from '../assets/okx.png';
// 引入 Phantom 钱包 logo。
import phantomLogo from '../assets/phantom.png';
// 引入创建 EVM 钱包适配器的函数。
import { createEvmAdapter } from './eip1193';
// 引入创建 Phantom 钱包适配器的函数。
import { createPhantomAdapter } from './phantom';

// createWalletAdapters 创建这个组件库内置支持的所有钱包适配器。
export function createWalletAdapters(deepLinks?: DeepLinkConfig): WalletAdapter[] {
  // 返回钱包适配器数组，UI 会根据这个数组渲染钱包列表。
  return [
    // 创建 OKX Wallet 适配器。
    createEvmAdapter({ id: 'okx', name: 'OKX Wallet', icon: okxLogo, deepLinks }),
    // 创建 MetaMask 适配器。
    createEvmAdapter({ id: 'metamask', name: 'MetaMask', icon: metamaskLogo, deepLinks }),
    // 创建 Phantom 适配器。
    createPhantomAdapter(deepLinks, phantomLogo),
  ];
}
