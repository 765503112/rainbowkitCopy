// Eip1193Provider 描述 EVM 钱包扩展注入到网页里的 provider 形状。
export interface Eip1193Provider {
  // isMetaMask 是 MetaMask 常用的识别标记。
  isMetaMask?: boolean;
  // isOkxWallet 是 OKX Wallet 某些版本使用的识别标记。
  isOkxWallet?: boolean;
  // isOKExWallet 是 OKX/OKEx 旧版本可能使用的识别标记。
  isOKExWallet?: boolean;
  // isOKXWallet 是 OKX 另一些版本可能使用的识别标记。
  isOKXWallet?: boolean;
  // chainId 是当前 EVM 链 ID，通常是十六进制字符串。
  chainId?: string;
  // providers 是多个钱包共存时，聚合注入对象里保存的 provider 数组。
  providers?: Eip1193Provider[];
  // request 是 EIP-1193 的核心方法，网页通过它请求钱包执行操作。
  request: <T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<T>;
  // isConnected 是部分钱包提供的连接状态检查方法。
  isConnected?: () => boolean;
  // on 用来监听钱包事件，比如账号切换、链切换。
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  // removeListener 用来移除钱包事件监听。
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

// Eip6963ProviderInfo 是 EIP-6963 标准里钱包上报的元信息。
export interface Eip6963ProviderInfo {
  // uuid 是钱包 provider 的唯一标识。
  uuid: string;
  // name 是钱包名称。
  name: string;
  // icon 是钱包图标。
  icon: string;
  // rdns 是钱包反向域名标识，例如 io.metamask。
  rdns: string;
}

// Eip6963ProviderDetail 是 EIP-6963 钱包发现事件里携带的数据。
export interface Eip6963ProviderDetail {
  // info 是钱包元信息。
  info: Eip6963ProviderInfo;
  // provider 是对应钱包的 EIP-1193 provider。
  provider: Eip1193Provider;
}

// PhantomSolanaProvider 描述 Phantom 注入的 Solana provider 形状。
export interface PhantomSolanaProvider {
  // isPhantom 是 Phantom 常用识别标记。
  isPhantom?: boolean;
  // publicKey 是 Phantom 当前账户公钥。
  publicKey?: { toString: () => string };
  // connect 用来请求连接 Phantom，成功后返回 publicKey。
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  // disconnect 用来断开 Phantom 连接。
  disconnect?: () => Promise<void>;
  // signMessage 用来让 Phantom 签名字节消息。
  signMessage: (message: Uint8Array, encoding?: string) => Promise<{ signature: Uint8Array }>;
}

// declare global 用来扩展浏览器 Window 类型，让 TypeScript 认识钱包注入字段。
declare global {
  // 扩展全局 Window 接口。
  interface Window {
    // ethereum 是 MetaMask 等 EVM 钱包最常见的注入字段。
    ethereum?: Eip1193Provider;
    // okxwallet 是 OKX Wallet 常见的注入字段。
    okxwallet?: Eip1193Provider & {
      // ethereum 是 OKX 里的 EVM 子 provider。
      ethereum?: Eip1193Provider;
      // solana 是 OKX 可能提供的 Solana 子 provider。
      solana?: PhantomSolanaProvider;
    };
    // phantom 是 Phantom 钱包常见的注入字段。
    phantom?: {
      // solana 是 Phantom 的 Solana provider。
      solana?: PhantomSolanaProvider;
      // ethereum 是 Phantom 可能提供的 EVM provider。
      ethereum?: Eip1193Provider;
    };
    // solana 是 Phantom 早期或部分环境会直接注入的字段。
    solana?: PhantomSolanaProvider;
  }
}
