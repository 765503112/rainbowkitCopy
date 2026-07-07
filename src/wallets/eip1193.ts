// 引入 DeepLink 生成函数，移动端需要打开钱包 App 时会用到。
import { getWalletDeepLink } from '../core/deepLinks';
// 引入统一错误类，找不到钱包或连接失败时会抛出。
import { WalletKitError } from '../types';
// 引入这个文件需要的类型定义。
import type { DeepLinkConfig, WalletAccount, WalletAdapter, WalletId, WalletNetwork } from '../types';
// 引入 EIP-1193 Provider 的类型定义。
import type { Eip1193Provider } from './providerTypes';

// pickInjectedProvider 负责从浏览器 window 上找到指定钱包注入的 provider。
function pickInjectedProvider(wallet: WalletId): Eip1193Provider | undefined {
  // 如果当前不是浏览器环境，例如服务端渲染，就没有 window，也就找不到插件。
  if (typeof window === 'undefined') return undefined;

  // 收集可能的钱包 provider 候选项。
  const candidates = collectInjectedProviders(wallet);
  // 有些钱包会把多个 provider 放到 providers 数组里，这里把它们摊平成一层数组。
  const providers = candidates.flatMap((provider) => provider.providers ?? []);
  // 合并直接候选 provider 和数组里的 provider，并去重。
  const allProviders = uniqueProviders([...candidates, ...providers]);

  // 如果用户要找 OKX 钱包，走 OKX 专门兼容逻辑。
  if (wallet === 'okx') {
    // 从所有 provider 里找标记为 OKX 的 provider。
    const matched = allProviders.find(isOkxProvider);
    // 如果找到了，就直接返回这个 OKX provider。
    if (matched) return matched;

    // OKX 官方文档里也可能直接把 request 挂在 window.okxwallet 上。
    if (window.okxwallet?.request) return window.okxwallet;
  }

  // 如果 providers 数组存在，优先从数组中精确找对应钱包。
  if (providers?.length) {
    // 遍历 providers 数组，找到 MetaMask 或 OKX。
    const matched = providers.find((provider) => {
      // MetaMask 要求 isMetaMask 为 true，并且不要误选到 OKX。
      if (wallet === 'metamask') return provider.isMetaMask && !provider.isOkxWallet;
      // 其它 EVM 钱包目前这里主要就是 OKX。
      return isOkxProvider(provider);
    });
    // 如果数组中找到了对应 provider，就返回它。
    if (matched) return matched;
  }

  // 如果没有 providers 数组，就回退到常见的单 provider 注入位置。
  const injected = wallet === 'metamask' ? window.ethereum : window.okxwallet?.ethereum ?? window.ethereum;
  // 如果目标是 MetaMask，并且注入对象确实像 MetaMask，就返回。
  if (wallet === 'metamask' && injected?.isMetaMask && !isOkxProvider(injected)) return injected;
  // 如果目标是 OKX，并且注入对象带 OKX 标识，就返回。
  if (wallet === 'okx' && injected && isOkxProvider(injected)) return injected;
  // 所有位置都没找到，就返回 undefined。
  return undefined;
}

// collectInjectedProviders 收集浏览器里可能存在的钱包 provider。
function collectInjectedProviders(wallet: WalletId): Eip1193Provider[] {
  // 这些是常见的 EVM 钱包注入位置。
  const providers: Array<Eip1193Provider | undefined> = [
    // window.ethereum 是 MetaMask 等 EVM 钱包最常见的注入位置。
    window.ethereum,
    // window.okxwallet 是 OKX 新版本/官方文档常见的注入位置。
    window.okxwallet,
    // window.okxwallet.ethereum 是 OKX 也可能提供的 EVM 子 provider。
    window.okxwallet?.ethereum,
  ];

  // MetaMask 更应该从 window.ethereum 和它的 providers 数组里找，避免误选 OKX。
  if (wallet === 'metamask') {
    // 返回去重后的 MetaMask 候选项。
    return uniqueProviders([window.ethereum, ...(window.ethereum?.providers ?? [])]);
  }

  // OKX 走通用候选列表去重。
  return uniqueProviders(providers);
}

// uniqueProviders 用来过滤空值、过滤没有 request 方法的对象，并去掉重复对象。
function uniqueProviders(providers: Array<Eip1193Provider | undefined>): Eip1193Provider[] {
  // filter 里使用类型谓词，让 TypeScript 知道过滤后一定是 Eip1193Provider。
  return providers.filter((provider, index, list): provider is Eip1193Provider => {
    // provider 必须存在，必须有 request 方法，并且不能在数组前面已经出现过。
    return Boolean(provider?.request) && list.indexOf(provider) === index;
  });
}

// isOkxProvider 判断一个 provider 是否像 OKX 钱包。
function isOkxProvider(provider?: Eip1193Provider): boolean {
  // OKX 不同版本可能使用不同标识字段，所以这里同时兼容三个名字。
  return Boolean(provider?.isOkxWallet || provider?.isOKExWallet || provider?.isOKXWallet);
}

// hexToNumber 把 EVM 钱包返回的十六进制 chainId 转成数字。
function hexToNumber(hex?: string): number | undefined {
  // 如果没有 chainId，就返回 undefined。
  if (!hex) return undefined;
  // Number.parseInt(hex, 16) 表示按 16 进制解析字符串。
  return Number.parseInt(hex, 16);
}

// toHexChainId 把数字或十进制字符串链 ID 转成钱包要求的 0x 十六进制格式。
function toHexChainId(chainId: string | number): string {
  // 如果传入的本来就是 0x 开头字符串，直接返回。
  if (typeof chainId === 'string' && chainId.startsWith('0x')) return chainId;
  // 其它情况统一转成数字，再转成十六进制。
  return `0x${Number(chainId).toString(16)}`;
}

// switchEvmNetwork 使用 EIP-3326/EIP-3085 请求钱包切换或添加网络。
async function switchEvmNetwork(provider: Eip1193Provider, network: WalletNetwork): Promise<void> {
  // EVM 钱包要求 chainId 使用十六进制字符串。
  const chainId = toHexChainId(network.chainId);
  try {
    // wallet_switchEthereumChain 会请求钱包切换到目标网络。
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    });
  } catch (error) {
    // 4902 通常表示钱包还没有添加这个网络。
    const maybe = error as { code?: number } | undefined;
    if (maybe?.code !== 4902) throw error;

    // 如果钱包没有这个网络，就尝试用 wallet_addEthereumChain 添加。
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId,
          chainName: network.name,
          nativeCurrency: network.nativeCurrency,
          rpcUrls: network.rpcUrls,
          blockExplorerUrls: network.blockExplorerUrls,
        },
      ],
    });
  }
}

// createEvmAdapter 创建 MetaMask 或 OKX 这种 EVM 钱包的统一适配器。
export function createEvmAdapter(options: {
  // id 只能是 metamask 或 okx。
  id: Extract<WalletId, 'metamask' | 'okx'>;
  // name 是展示给用户看的钱包名称。
  name: string;
  // icon 是按钮里显示的简化图标文本。
  icon: string;
  // deepLinks 是移动端打开钱包 App 的配置。
  deepLinks?: DeepLinkConfig;
}): WalletAdapter {
  // 返回符合 WalletAdapter 规范的钱包对象。
  return {
    // 保存钱包 id。
    id: options.id,
    // 保存钱包名称。
    name: options.name,
    // EVM 钱包链类型固定是 evm。
    chainType: 'evm',
    // 保存钱包图标。
    icon: options.icon,
    // installed 通过能否找到 provider 判断钱包插件是否安装。
    installed: () => Boolean(pickInjectedProvider(options.id)),
    // connect 是真正发起钱包连接的方法。
    connect: async (): Promise<WalletAccount> => {
      // 每次连接前重新找 provider，避免页面加载后钱包才注入导致拿不到。
      const provider = pickInjectedProvider(options.id);
      // 如果没有 provider，说明浏览器没有检测到对应钱包。
      if (!provider) {
        // 抛出统一的未找到钱包错误。
        throw new WalletKitError('PROVIDER_NOT_FOUND', `${options.name} provider was not found.`);
      }

      // eth_requestAccounts 会唤起钱包扩展连接弹窗，用户同意后返回地址数组。
      const accounts = await provider.request<string[]>({ method: 'eth_requestAccounts' });
      // eth_chainId 会读取当前钱包所在链，失败时不阻塞连接。
      const chainId = await provider.request<string>({ method: 'eth_chainId' }).catch(() => undefined);
      // EVM 钱包返回数组，通常第一个地址就是当前选中的账户。
      const address = accounts[0];
      // 如果钱包没有返回地址，就认为连接失败。
      if (!address) throw new WalletKitError('PROVIDER_NOT_FOUND', `${options.name} did not return an address.`);

      // 返回统一的 WalletAccount 账户对象。
      return {
        // 保存钱包地址。
        address,
        // 标记这是 EVM 钱包。
        chainType: 'evm',
        // 把十六进制 chainId 转成数字保存。
        chainId: hexToNumber(chainId),
      };
    },
    // signMessage 负责让 EVM 钱包签名一段文本。
    signMessage: async (message: string, account: WalletAccount): Promise<string> => {
      // 签名前重新找 provider，保证拿到当前可用的钱包对象。
      const provider = pickInjectedProvider(options.id);
      // 如果 provider 不存在，就抛出未找到钱包错误。
      if (!provider) throw new WalletKitError('PROVIDER_NOT_FOUND', `${options.name} provider was not found.`);
      // personal_sign 是 EVM 钱包常用的文本签名方法。
      return provider.request<string>({
        // 指定调用钱包的 personal_sign 方法。
        method: 'personal_sign',
        // 传入要签名的文本和签名地址。
        params: [message, account.address],
      });
    },
    // switchNetwork 负责请求 EVM 钱包切换到指定网络。
    switchNetwork: async (network: WalletNetwork): Promise<WalletAccount | undefined> => {
      // EVM 适配器只支持 EVM 网络。
      if (network.chainType !== 'evm') {
        // 如果传入 Solana 网络，就抛出不支持错误。
        throw new WalletKitError('UNSUPPORTED_CHAIN', `${options.name} only supports EVM networks.`);
      }
      // 切换前重新获取 provider。
      const provider = pickInjectedProvider(options.id);
      // 如果 provider 不存在，就抛出未找到钱包错误。
      if (!provider) throw new WalletKitError('PROVIDER_NOT_FOUND', `${options.name} provider was not found.`);
      // 请求钱包切换或添加网络。
      await switchEvmNetwork(provider, network);
      // 切换后重新读取账户和链 ID，返回更新后的账户状态。
      const accounts = await provider.request<string[]>({ method: 'eth_accounts' });
      // eth_accounts 不会弹授权，只读取已连接账户。
      const address = accounts[0];
      // 如果没有地址，说明还没有连接账户，返回 undefined。
      if (!address) return undefined;
      // 返回新的账户状态。
      return {
        address,
        chainType: 'evm',
        chainId: Number(network.chainId),
      };
    },
    // getDeepLink 生成移动端打开当前钱包 App 的链接。
    getDeepLink: (targetUrl: string) => getWalletDeepLink(options.id, targetUrl, options.deepLinks),
  };
}
