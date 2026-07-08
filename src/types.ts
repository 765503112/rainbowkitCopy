// 只引入 ReactNode 这个类型，用来描述 Provider 接收的 children。
import type { ReactNode } from 'react';

// ChainType 表示当前钱包属于哪一种链生态，evm 是以太坊兼容链，solana 是 Solana 链。
export type ChainType = 'evm' | 'solana';
// WalletId 是这个包内置支持的钱包标识，后续连接时会用这个 id 找到对应适配器。
export type WalletId = 'metamask' | 'okx' | 'phantom';
// WalletStatus 表示钱包连接流程当前处于什么状态，方便 UI 展示不同内容。
export type WalletStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

// WalletNetwork 描述一个可以让钱包切换到的网络。
export interface WalletNetwork {
  // id 是组件内部使用的网络唯一标识。
  id: string;
  // name 是展示给用户看的网络名称。
  name: string;
  // chainType 表示这个网络属于 EVM 还是 Solana。
  chainType: ChainType;
  // chainId 是钱包切换网络时用到的链 ID。
  chainId: string | number;
  // rpcUrls 是钱包添加新 EVM 网络时需要的 RPC 地址。
  rpcUrls?: string[];
  // nativeCurrency 是钱包添加新 EVM 网络时展示的原生代币信息。
  nativeCurrency?: {
    // name 是代币名称。
    name: string;
    // symbol 是代币符号。
    symbol: string;
    // decimals 是代币小数位。
    decimals: number;
  };
  // blockExplorerUrls 是区块浏览器地址。
  blockExplorerUrls?: string[];
}

// WalletAccount 描述一次钱包连接成功后拿到的账户信息。
export interface WalletAccount {
  // address 是钱包地址，EVM 是 0x 开头地址，Solana 是 publicKey 字符串。
  address: string;
  // chainType 说明这个地址来自 EVM 生态还是 Solana 生态。
  chainType: ChainType;
  // chainId 是链 ID，EVM 常见是数字，Solana 这里用字符串标识。
  chainId?: string | number;
  // publicKey 是 Solana 常用字段，EVM 钱包一般不需要。
  publicKey?: string;
}

// WalletState 是组件库内部保存的钱包总状态。
export interface WalletState {
  // status 表示当前连接状态，比如 connected 表示已连接。
  status: WalletStatus;
  // wallet 表示当前选中或已连接的钱包，比如 metamask。
  wallet?: WalletId;
  // account 表示连接成功后得到的钱包账户。
  account?: WalletAccount;
  // auth 表示签名登录后后端返回的登录态，例如 JWT。
  auth?: AuthSession;
  // error 保存最近一次钱包连接或认证失败的错误。
  error?: WalletKitError;
  // updatedAt 记录状态更新时间，用来解决多 Tab 同步时的新旧状态比较。
  updatedAt: number;
}

// AuthSession 表示后端认证成功后返回的会话信息。
export interface AuthSession {
  // token 通常是 JWT，业务请求可以用它证明用户已经登录。
  token: string;
  // expiresAt 是 token 过期时间戳，单位通常是毫秒。
  expiresAt: number;
  // refreshToken 是可选的刷新令牌，用来换取新的 JWT。
  refreshToken?: string;
}

// NonceRequest 表示前端向后端请求 nonce 时传递的信息。
export interface NonceRequest {
  // wallet 表示用户正在用哪个钱包登录。
  wallet: WalletId;
  // address 表示当前钱包地址。
  address: string;
  // chainType 表示当前链生态。
  chainType: ChainType;
  // audience 是可选的业务系统名，用来写进签名文案。
  audience?: string;
}

// VerifySignaturePayload 表示前端把签名结果交给后端验签时的数据。
export interface VerifySignaturePayload extends NonceRequest {
  // nonce 是后端生成的一次性随机字符串，用来防止旧签名被重复使用。
  nonce: string;
  // message 是用户钱包实际签名的完整文本。
  message: string;
  // signature 是钱包对 message 签出来的结果。
  signature: string;
}

// JwtRefreshRequest 表示前端请求后端刷新 JWT 时传递的数据。
export interface JwtRefreshRequest {
  // token 是当前快过期或需要刷新的 JWT。
  token: string;
  // refreshToken 是可选的刷新令牌。
  refreshToken?: string;
  // wallet 表示当前登录的钱包类型。
  wallet: WalletId;
  // address 表示当前登录的钱包地址。
  address: string;
}

// WalletAuthConfig 是钱包签名登录相关配置。
export interface WalletAuthConfig {
  // enabled 决定是否启用 nonce 签名登录流程。
  enabled?: boolean;
  // audience 是写进签名消息里的业务名称。
  audience?: string;
  // renewalWindowMs 表示 JWT 到期前多久开始自动续期。
  renewalWindowMs?: number;
  // getNonce 是业务方提供的函数，负责从后端拿一次性 nonce。
  getNonce?: (request: NonceRequest) => Promise<string>;
  // verifySignature 是业务方提供的函数，负责把签名交给后端验证。
  verifySignature?: (payload: VerifySignaturePayload) => Promise<AuthSession>;
  // refreshJwt 是业务方提供的函数，负责自动续期 JWT。
  refreshJwt?: (request: JwtRefreshRequest) => Promise<AuthSession>;
}

// DeepLinkConfig 是移动端跳转钱包 App 的配置。
export interface DeepLinkConfig {
  // enabled 控制是否允许使用 DeepLink 功能。
  enabled?: boolean;
  // openOnConnect 控制未检测到扩展时，点击钱包是否自动跳转 App。
  openOnConnect?: boolean;
  // dappUrl 是要传给钱包 App 打开的当前 DApp 地址。
  dappUrl?: string;
  // metamask 可以覆盖默认 MetaMask DeepLink 前缀。
  metamask?: string;
  // okx 可以覆盖默认 OKX Wallet DeepLink 前缀。
  okx?: string;
  // phantom 可以覆盖默认 Phantom DeepLink 前缀。
  phantom?: string;
}

// WalletKitOptions 是 WalletProvider 可以接收的通用配置。
export interface WalletKitOptions {
  // auth 是签名登录配置。
  auth?: WalletAuthConfig;
  // deepLinks 是移动端钱包 App 跳转配置。
  deepLinks?: DeepLinkConfig;
  // connectTimeoutMs 是连接钱包的超时时间。
  connectTimeoutMs?: number;
  // storageKey 是多 Tab 同步时写入 localStorage 的 key。
  storageKey?: string;
  // networks 是业务方可以自定义的网络列表，不传时使用默认 EVM 网络列表。
  networks?: WalletNetwork[];
}

// WalletProviderProps 是 React Provider 组件的 props。
export interface WalletProviderProps extends WalletKitOptions {
  // children 是被 Provider 包住的业务组件。
  children: ReactNode;
  // initialWallet 是可选的默认钱包。
  initialWallet?: WalletId;
  // autoConnect 控制是否在 Provider 初始化时自动连接 initialWallet。
  autoConnect?: boolean;
}

// WalletKitErrorCode 统一描述钱包组件可能抛出的错误类型。
export type WalletKitErrorCode =
  // PROVIDER_NOT_FOUND 表示没有检测到对应钱包插件。
  | 'PROVIDER_NOT_FOUND'
  // USER_REJECTED 表示用户在钱包弹窗里拒绝了操作。
  | 'USER_REJECTED'
  // CONNECT_TIMEOUT 表示连接钱包超时。
  | 'CONNECT_TIMEOUT'
  // REQUEST_PENDING 表示钱包扩展里已经有一个同类请求在等待用户处理。
  | 'REQUEST_PENDING'
  // SIGNATURE_REJECTED 表示用户拒绝签名或签名失败。
  | 'SIGNATURE_REJECTED'
  // AUTH_FAILED 表示签名登录配置或后端认证失败。
  | 'AUTH_FAILED'
  // JWT_REFRESH_FAILED 表示 JWT 自动续期失败。
  | 'JWT_REFRESH_FAILED'
  // UNSUPPORTED_CHAIN 表示当前链不支持。
  | 'UNSUPPORTED_CHAIN'
  // SWITCH_NETWORK_FAILED 表示钱包切换网络失败。
  | 'SWITCH_NETWORK_FAILED'
  // DISCONNECT_FAILED 表示组件请求钱包断开授权失败。
  | 'DISCONNECT_FAILED'
  // UNKNOWN 表示无法归类的未知错误。
  | 'UNKNOWN';

// WalletKitError 是组件库统一抛出的错误类。
export class WalletKitError extends Error {
  // code 保存机器可读的错误码。
  code: WalletKitErrorCode;
  // cause 保存原始错误，方便调试底层钱包报错。
  cause?: unknown;

  // constructor 在创建错误对象时保存错误码、错误消息和原始原因。
  constructor(code: WalletKitErrorCode, message: string, cause?: unknown) {
    // 调用 Error 父类构造函数，保存 message。
    super(message);
    // name 帮助调试时看出这是钱包组件库的错误。
    this.name = 'WalletKitError';
    // code 保存统一错误码。
    this.code = code;
    // cause 保存原始错误对象。
    this.cause = cause;
  }
}

// WalletAdapter 是每个钱包适配器必须实现的统一接口。
export interface WalletAdapter {
  // id 是钱包唯一标识。
  id: WalletId;
  // name 是展示给用户看的钱包名称。
  name: string;
  // chainType 表示钱包所属链生态。
  chainType: ChainType;
  // icon 是简化版图标文本，用于按钮左侧展示。
  icon: string;
  // installed 用来判断浏览器里是否检测到这个钱包插件。
  installed: () => boolean;
  // connect 负责真正调用钱包插件并返回账户信息。
  connect: () => Promise<WalletAccount>;
  // disconnect 是可选断开方法，有些钱包提供，有些没有。
  disconnect?: () => Promise<void>;
  // signMessage 负责让钱包对一段文本签名。
  signMessage: (message: string, account: WalletAccount) => Promise<string>;
  // switchNetwork 负责请求钱包切换网络，不支持的钱包可以不实现。
  switchNetwork?: (network: WalletNetwork) => Promise<WalletAccount | undefined>;
  // subscribe 负责监听钱包扩展自己的事件，例如手动切链或切账号。
  subscribe?: (handlers: WalletAdapterEventHandlers) => () => void;
  // getDeepLink 负责生成移动端打开钱包 App 的链接。
  getDeepLink: (targetUrl: string) => string;
}

// WalletAdapterEventHandlers 是钱包适配器对外通知事件时使用的回调集合。
export interface WalletAdapterEventHandlers {
  // onChainChanged 在钱包扩展手动切换网络时触发。
  onChainChanged?: (chainId: string | number) => void;
  // onAccountsChanged 在钱包扩展手动切换账户或断开账户时触发。
  onAccountsChanged?: (accounts: string[]) => void;
  // onDisconnect 在钱包扩展断开连接时触发。
  onDisconnect?: () => void;
}

// WalletEventMap 定义 EventEmitter 里支持的事件和对应数据。
export type WalletEventMap = {
  // state 事件在钱包总状态变化时触发。
  state: WalletState;
  // accountChanged 事件在账户变化时触发。
  accountChanged: WalletAccount | undefined;
  // disconnect 事件在断开钱包时触发。
  disconnect: undefined;
  // error 事件在发生钱包错误时触发。
  error: WalletKitError;
};

// WalletContextValue 是 useWallet 能拿到的上下文能力。
export interface WalletContextValue {
  // state 是当前钱包状态。
  state: WalletState;
  // wallets 是所有内置钱包适配器列表。
  wallets: WalletAdapter[];
  // networks 是当前可切换网络列表。
  networks: WalletNetwork[];
  // connect 用来连接指定钱包。
  connect: (wallet: WalletId) => Promise<void>;
  // switchNetwork 用来切换当前钱包网络。
  switchNetwork: (networkId: string) => Promise<void>;
  // disconnect 用来断开当前钱包。
  disconnect: () => Promise<void>;
  // openWalletApp 用来显式打开移动端钱包 App。
  openWalletApp: (wallet: WalletId) => void;
  // refreshAuth 用来手动刷新 JWT 登录态。
  refreshAuth: () => Promise<void>;
}
