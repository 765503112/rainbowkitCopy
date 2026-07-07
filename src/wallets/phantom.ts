// 引入 DeepLink 生成函数，移动端打开 Phantom App 时会用到。
import { getWalletDeepLink } from '../core/deepLinks';
// 引入统一错误类，找不到 Phantom 时会抛出。
import { WalletKitError } from '../types';
// 引入 Phantom 适配器需要的通用类型。
import type { DeepLinkConfig, WalletAccount, WalletAdapter } from '../types';
// 引入 Phantom Solana provider 的类型定义。
import type { PhantomSolanaProvider } from './providerTypes';

// getProvider 用来从 window 上找到 Phantom 注入的 Solana provider。
function getProvider(): PhantomSolanaProvider | undefined {
  // 服务端渲染或非浏览器环境没有 window，所以直接返回 undefined。
  if (typeof window === 'undefined') return undefined;
  // Phantom 新版本通常注入 window.phantom.solana，部分环境会直接注入 window.solana。
  const provider = window.phantom?.solana ?? window.solana;
  // 如果 provider 存在并且像 Phantom，就返回它。
  return provider?.isPhantom || provider?.connect ? provider : undefined;
}

// bytesToBase64 把 Phantom 返回的字节签名转换成 base64 字符串。
function bytesToBase64(bytes: Uint8Array): string {
  // binary 用来临时拼接二进制字符。
  let binary = '';
  // 遍历每一个字节。
  bytes.forEach((byte) => {
    // 把字节转成字符并拼起来。
    binary += String.fromCharCode(byte);
  });
  // btoa 把二进制字符串转成 base64。
  return btoa(binary);
}

// createPhantomAdapter 创建 Phantom 钱包适配器。
export function createPhantomAdapter(deepLinks?: DeepLinkConfig, icon = 'P'): WalletAdapter {
  // 返回符合 WalletAdapter 规范的钱包对象。
  return {
    // Phantom 的钱包 id 固定是 phantom。
    id: 'phantom',
    // name 是展示给用户看的钱包名称。
    name: 'Phantom',
    // Phantom 这里接的是 Solana 链，所以 chainType 是 solana。
    chainType: 'solana',
    // icon 是简化版展示字符。
    icon,
    // installed 通过是否找到 Phantom provider 判断是否安装。
    installed: () => Boolean(getProvider()),
    // connect 负责调用 Phantom 扩展发起连接。
    connect: async (): Promise<WalletAccount> => {
      // 连接前重新获取 provider，保证拿到最新注入对象。
      const provider = getProvider();
      // 如果找不到 Phantom，就抛出未找到钱包错误。
      if (!provider) throw new WalletKitError('PROVIDER_NOT_FOUND', 'Phantom provider was not found.');
      // provider.connect 会唤起 Phantom 授权弹窗。
      const response = await provider.connect();
      // Phantom 返回 publicKey，把它转成字符串作为地址。
      const address = response.publicKey.toString();
      // 返回统一的钱包账户对象。
      return {
        // address 保存 Solana 地址。
        address,
        // publicKey 也保存同一个地址，方便 Solana 业务使用。
        publicKey: address,
        // 标记这是 Solana 钱包。
        chainType: 'solana',
        // 这里简单标记主网，实际业务可扩展网络选择。
        chainId: 'solana:mainnet',
      };
    },
    // disconnect 负责断开 Phantom 连接。
    disconnect: async () => {
      // 如果 provider 存在且提供 disconnect，就调用它。
      await getProvider()?.disconnect?.();
    },
    // signMessage 负责让 Phantom 对文本签名。
    signMessage: async (message: string): Promise<string> => {
      // 签名前获取 Phantom provider。
      const provider = getProvider();
      // 找不到 provider 时抛出错误。
      if (!provider) throw new WalletKitError('PROVIDER_NOT_FOUND', 'Phantom provider was not found.');
      // Phantom 需要 Uint8Array 格式的消息，所以先用 TextEncoder 编码。
      const encoded = new TextEncoder().encode(message);
      // 调用 Phantom 的 signMessage，用户会看到签名确认弹窗。
      const { signature } = await provider.signMessage(encoded, 'utf8');
      // 把字节签名转成 base64 字符串返回。
      return bytesToBase64(signature);
    },
    // Phantom 的浏览器注入 provider 通常不允许 DApp 直接切换 Solana 网络。
    switchNetwork: async () => {
      // 抛出统一错误，让 UI 提示用户需要在 Phantom 钱包里手动切换网络。
      throw new WalletKitError('UNSUPPORTED_CHAIN', 'Phantom does not support programmatic Solana network switching.');
    },
    // getDeepLink 生成移动端打开 Phantom App 的链接。
    getDeepLink: (targetUrl: string) => getWalletDeepLink('phantom', targetUrl, deepLinks),
  };
}
