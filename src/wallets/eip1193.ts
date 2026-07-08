// 引入 DeepLink 生成函数，移动端需要打开钱包 App 时会用到。
import { getWalletDeepLink } from '../core/deepLinks';
// 引入统一错误类，找不到钱包或连接失败时会抛出。
import { WalletKitError } from '../types';
// 引入这个文件需要的类型定义。
import type { DeepLinkConfig, WalletAccount, WalletAdapter, WalletAdapterEventHandlers, WalletId, WalletNetwork } from '../types';
// 引入 EIP-1193 Provider 的类型定义。
import type { Eip1193Provider, Eip6963ProviderDetail } from './providerTypes';

// eip6963Providers 保存 EIP-6963 标准发现到的钱包 provider。
const eip6963Providers = new Map<string, Eip6963ProviderDetail>();

// listenForEip6963Providers 在模块加载时监听钱包主动广播的 provider。
function listenForEip6963Providers(): void {
  // 非浏览器环境不处理。
  if (typeof window === 'undefined') return;
  // 避免重复注册监听。
  if ((window as Window & { __rwkEip6963Listening?: boolean }).__rwkEip6963Listening) return;
  // 标记已经注册过监听。
  (window as Window & { __rwkEip6963Listening?: boolean }).__rwkEip6963Listening = true;
  // 监听 EIP-6963 钱包广播事件。
  window.addEventListener('eip6963:announceProvider', ((event: CustomEvent<Eip6963ProviderDetail>) => {
    // 保存钱包 provider，key 用 rdns 更稳定。
    eip6963Providers.set(event.detail.info.rdns, event.detail);
  }) as EventListener);
  // 主动请求钱包广播 provider。
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

// 模块初始化时尝试开启 EIP-6963 监听。
listenForEip6963Providers();

// requestEip6963Provider 主动请求并等待指定钱包的 EIP-6963 provider。
async function requestEip6963Provider(wallet: WalletId): Promise<Eip1193Provider | undefined> {
  // 非浏览器环境没有钱包 provider。
  if (typeof window === 'undefined') return undefined;
  // 确保监听已开启。
  listenForEip6963Providers();
  // 请求钱包重新广播 provider。
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  // 给钱包扩展一点时间响应广播。
  await new Promise((resolve) => window.setTimeout(resolve, 50));
  // 返回符合目标钱包的 provider。
  return findCachedEip6963Provider(wallet);
}

// findCachedEip6963Provider 从已经发现的钱包列表里同步取 provider。
function findCachedEip6963Provider(wallet: WalletId): Eip1193Provider | undefined {
  // 找到符合目标钱包的 provider。
  const detail = [...eip6963Providers.values()].find((item) => isMatchingEip6963Wallet(wallet, item));
  // 返回匹配的钱包 provider。
  return detail?.provider;
}

// isMatchingEip6963Wallet 判断 EIP-6963 钱包信息是否匹配目标钱包。
function isMatchingEip6963Wallet(wallet: WalletId, detail: Eip6963ProviderDetail): boolean {
  // rdns 转小写，方便兼容大小写差异。
  const rdns = detail.info.rdns.toLowerCase();
  // name 转小写，作为 rdns 不标准时的兜底。
  const name = detail.info.name.toLowerCase();
  // MetaMask 常见 rdns 是 io.metamask。
  if (wallet === 'metamask') return rdns.includes('metamask') || name.includes('metamask');
  // OKX 常见 rdns 可能包含 okx 或 okex。
  if (wallet === 'okx') return rdns.includes('okx') || rdns.includes('okex') || name.includes('okx');
  // 这个文件只处理 EVM 钱包。
  return false;
}

// pickInjectedProvider 负责从浏览器 window 上找到指定钱包注入的 provider。
function pickInjectedProvider(wallet: WalletId): Eip1193Provider | undefined {
  // 如果当前不是浏览器环境，例如服务端渲染，就没有 window，也就找不到插件。
  if (typeof window === 'undefined') return undefined;

  // 如果 EIP-6963 已经发现了精准 provider，优先返回它。
  const cachedEip6963Provider = findCachedEip6963Provider(wallet);
  // 这样连接、切网、监听事件会尽量落在同一个钱包对象上。
  if (cachedEip6963Provider) return cachedEip6963Provider;

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

// pickInjectedProviderAsync 优先通过 EIP-6963 精准选择钱包，再回退到传统注入字段。
async function pickInjectedProviderAsync(wallet: WalletId): Promise<Eip1193Provider | undefined> {
  // EIP-6963 可以避免多个钱包共存时 window.ethereum 触发选择钱包弹窗。
  const eip6963Provider = await requestEip6963Provider(wallet);
  // 如果发现了目标钱包 provider，就直接用它。
  if (eip6963Provider) return eip6963Provider;
  // 否则回退到传统 window.ethereum/window.okxwallet 逻辑。
  return pickInjectedProvider(wallet);
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

// normalizeChainId 把钱包事件里可能出现的十六进制 chainId 统一转成数字。
function normalizeChainId(chainId: string | number): string | number {
  // 字符串且 0x 开头时按十六进制转成数字。
  if (typeof chainId === 'string' && chainId.startsWith('0x')) return hexToNumber(chainId) ?? chainId;
  // 其它格式直接返回。
  return chainId;
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

// tryRequest 尝试调用钱包 request，失败时返回 false，方便按多个断开方案兜底。
async function tryRequest(provider: Eip1193Provider, method: string, params?: unknown[]): Promise<boolean> {
  // try/catch 避免某个钱包不支持某个方法时中断后续兜底方案。
  try {
    // 调用指定钱包 RPC 方法。
    await provider.request({ method, params });
    // 调用成功返回 true。
    return true;
  } catch {
    // 调用失败返回 false。
    return false;
  }
}

// getConnectedAccounts 读取当前站点还能访问的钱包账户。
async function getConnectedAccounts(provider: Eip1193Provider): Promise<string[]> {
  // eth_accounts 不会弹窗，只返回当前站点已经授权的账户。
  const accounts = await provider.request<string[]>({ method: 'eth_accounts' }).catch(() => []);
  // 钱包正常会返回字符串数组，这里做类型兜底。
  return Array.isArray(accounts) ? accounts : [];
}

// disconnectEvmProvider 尽量撤销当前站点在 EVM 钱包里的账户授权。
async function disconnectEvmProvider(provider: Eip1193Provider, walletName: string): Promise<void> {
  // 先记录断开前是否真的有账户授权。
  const beforeAccounts = await getConnectedAccounts(provider);
  // 如果本来就没有授权账户，直接认为已断开。
  if (!beforeAccounts.length) return;

  // wallet_revokePermissions 是 MetaMask 官方支持的撤销当前站点账户权限方法。
  const revoked = await tryRequest(provider, 'wallet_revokePermissions', [{ eth_accounts: {} }]);
  // wallet_disconnect 是部分 EVM 钱包可能提供的非标准断开方法。
  const disconnectedByRpc = await tryRequest(provider, 'wallet_disconnect');
  // disconnect 是 OKX 等部分 provider 可能提供的非标准 JS 方法。
  const disconnectedByMethod = await provider
    .disconnect?.()
    .then(() => true)
    .catch(() => false);

  // 断开后再次读取账户，确认钱包扩展里已经撤销当前站点授权。
  const afterAccounts = await getConnectedAccounts(provider);
  // 如果账户为空，说明钱包已经真正断开。
  if (!afterAccounts.length) return;

  // 有些钱包会异步更新授权状态，稍等一下再检查一次。
  await new Promise((resolve) => window.setTimeout(resolve, 150));
  // 再次读取账户。
  const finalAccounts = await getConnectedAccounts(provider);
  // 如果最终为空，说明断开成功。
  if (!finalAccounts.length) return;

  // 如果所有断开方案都没让账户授权消失，就明确抛错，不再假装成功。
  throw new WalletKitError(
    'DISCONNECT_FAILED',
    `${walletName} did not revoke the current site connection. Please disconnect this site in the wallet extension.`,
    { revoked, disconnectedByRpc, disconnectedByMethod },
  );
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
  // activeProvider 记录最近一次真实使用的钱包 provider。
  let activeProvider: Eip1193Provider | undefined;

  // rememberProvider 保存 provider，保证后续事件监听和断开用的是同一个对象。
  const rememberProvider = (provider: Eip1193Provider) => {
    // 保存当前钱包实际使用的 provider。
    activeProvider = provider;
    // 返回原 provider，方便调用处链式使用。
    return provider;
  };

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
      const provider = await pickInjectedProviderAsync(options.id);
      // 如果没有 provider，说明浏览器没有检测到对应钱包。
      if (!provider) {
        // 抛出统一的未找到钱包错误。
        throw new WalletKitError('PROVIDER_NOT_FOUND', `${options.name} provider was not found.`);
      }
      // 记住这次连接真正使用的钱包对象。
      rememberProvider(provider);

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
      const provider = await pickInjectedProviderAsync(options.id);
      // 如果 provider 不存在，就抛出未找到钱包错误。
      if (!provider) throw new WalletKitError('PROVIDER_NOT_FOUND', `${options.name} provider was not found.`);
      // 记住签名使用的钱包对象。
      rememberProvider(provider);
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
      const provider = await pickInjectedProviderAsync(options.id);
      // 如果 provider 不存在，就抛出未找到钱包错误。
      if (!provider) throw new WalletKitError('PROVIDER_NOT_FOUND', `${options.name} provider was not found.`);
      // 记住切网使用的钱包对象。
      rememberProvider(provider);
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
    // disconnect 尝试撤销当前站点的钱包账户授权。
    disconnect: async (): Promise<void> => {
      // 断开时优先使用当前真实连接过的 provider。
      const provider = activeProvider ?? (await pickInjectedProviderAsync(options.id));
      // 如果没有 provider，就没有可撤销的授权。
      if (!provider) return;
      // 记住断开使用的钱包对象。
      rememberProvider(provider);
      // 尝试真正撤销当前站点的钱包账户授权。
      await disconnectEvmProvider(provider, options.name);
      // 断开成功后清掉当前 provider 记忆。
      activeProvider = undefined;
    },
    // subscribe 监听钱包扩展主动发出的链切换、账户切换、断开事件。
    subscribe: (handlers: WalletAdapterEventHandlers): (() => void) => {
      // 优先使用最近一次连接/切网时的 provider，保证事件监听绑定到真实连接的钱包。
      const provider = activeProvider ?? pickInjectedProvider(options.id);
      // 如果 provider 不支持事件监听，就返回空清理函数。
      if (!provider?.on) return () => undefined;

      // chainChanged 是 EVM 钱包手动切链时触发的事件。
      const handleChainChanged = (chainId: unknown) => {
        // 把 chainId 统一格式后通知 Provider。
        handlers.onChainChanged?.(normalizeChainId(chainId as string | number));
      };
      // accountsChanged 是 EVM 钱包手动切账号或断开账号时触发的事件。
      const handleAccountsChanged = (accounts: unknown) => {
        // 钱包通常返回 string[]，这里做一下兜底判断。
        handlers.onAccountsChanged?.(Array.isArray(accounts) ? (accounts as string[]) : []);
      };
      // disconnect 是钱包扩展断开连接时触发的事件。
      const handleDisconnect = () => {
        // 通知 Provider 当前钱包已断开。
        handlers.onDisconnect?.();
      };

      // 注册链切换事件。
      provider.on('chainChanged', handleChainChanged);
      // 注册账户切换事件。
      provider.on('accountsChanged', handleAccountsChanged);
      // 注册断开事件。
      provider.on('disconnect', handleDisconnect);

      // 返回清理函数，Provider 卸载或切换钱包时会调用。
      return () => {
        // 如果 provider 支持 removeListener，就移除链切换监听。
        provider.removeListener?.('chainChanged', handleChainChanged);
        // 移除账户切换监听。
        provider.removeListener?.('accountsChanged', handleAccountsChanged);
        // 移除断开监听。
        provider.removeListener?.('disconnect', handleDisconnect);
      };
    },
    // getDeepLink 生成移动端打开当前钱包 App 的链接。
    getDeepLink: (targetUrl: string) => getWalletDeepLink(options.id, targetUrl, options.deepLinks),
  };
}
