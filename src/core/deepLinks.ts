// 引入 DeepLink 配置类型和钱包 id 类型。
import type { DeepLinkConfig, WalletId } from '../types';

// DEFAULT_DEEP_LINKS 保存各钱包默认的移动端打开链接前缀。
const DEFAULT_DEEP_LINKS: Required<Pick<DeepLinkConfig, 'metamask' | 'okx' | 'phantom'>> = {
  // MetaMask 的 dapp deep link 前缀。
  metamask: 'https://metamask.app.link/dapp/',
  // OKX Wallet 的 dapp deep link 前缀。
  okx: 'okx://wallet/dapp/url?dappUrl=',
  // Phantom 的浏览 deep link 前缀。
  phantom: 'https://phantom.app/ul/browse/',
};

// isMobileH5 判断当前是否是手机浏览器环境。
export function isMobileH5(): boolean {
  // 如果没有 navigator，说明不是浏览器环境，直接返回 false。
  if (typeof navigator === 'undefined') return false;
  // 用 userAgent 粗略判断 Android、iPhone、iPad 等移动端。
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// resolveDappUrl 计算要传给钱包 App 的 DApp 地址。
export function resolveDappUrl(config?: DeepLinkConfig): string {
  // 如果业务方显式传了 dappUrl，就优先用它。
  if (config?.dappUrl) return config.dappUrl;
  // 如果不是浏览器环境，就没有当前页面地址。
  if (typeof window === 'undefined') return '';
  // 默认使用当前网页地址。
  return window.location.href;
}

// getWalletDeepLink 根据钱包类型生成移动端打开链接。
export function getWalletDeepLink(wallet: WalletId, targetUrl: string, config?: DeepLinkConfig): string {
  // 先把目标 URL 编码，避免特殊字符破坏 deep link 参数。
  const encoded = encodeURIComponent(targetUrl);
  // MetaMask 要求去掉 http/https 前缀后拼到 dapp 后面。
  if (wallet === 'metamask') return `${config?.metamask ?? DEFAULT_DEEP_LINKS.metamask}${targetUrl.replace(/^https?:\/\//, '')}`;
  // OKX 把编码后的 DApp URL 放到 dappUrl 参数里。
  if (wallet === 'okx') return `${config?.okx ?? DEFAULT_DEEP_LINKS.okx}${encoded}`;
  // Phantom 使用 browse 链接，并带上 ref 参数。
  return `${config?.phantom ?? DEFAULT_DEEP_LINKS.phantom}${encoded}?ref=${encoded}`;
}
