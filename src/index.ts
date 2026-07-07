// 引入组件库样式，用户导入包时可以通过 exports 引到这份 CSS。
import './style.css';

// 导出连接钱包按钮组件，业务项目最常用的 UI 入口。
export { ConnectWalletButton } from './react/ConnectWalletButton';
// 导出连接钱包按钮组件的 props 类型，方便业务项目写类型。
export type { ConnectWalletButtonProps } from './react/ConnectWalletButton';
// 导出钱包上下文和 Provider，业务项目需要用 Provider 包住应用。
export { WalletContext, WalletProvider } from './react/WalletProvider';
// 导出 useWallet Hook，业务组件可以读取钱包状态和调用连接方法。
export { useWallet } from './react/useWallet';
// 导出 EventEmitter，方便高级使用者复用或扩展事件系统。
export { EventEmitter } from './core/eventEmitter';
// 导出 WalletStateSync，方便高级使用者了解或复用多 Tab 同步能力。
export { WalletStateSync } from './core/storageSync';
// 导出认证相关函数，方便业务方复用签名消息生成或认证流程。
export { createNonceMessage, authenticateWallet, refreshJwtSession } from './core/auth';
// 导出错误处理工具，方便业务方做统一错误处理。
export { normalizeWalletError, withTimeout } from './core/errors';
// 导出默认网络列表，业务方可以复用或在此基础上扩展。
export { DEFAULT_NETWORKS } from './core/networks';
// 导出钱包适配器创建函数，方便业务方自定义钱包列表。
export { createWalletAdapters } from './wallets';
// 导出统一错误类，业务方可以判断错误类型。
export { WalletKitError } from './types';
// 导出所有公开类型，方便 TypeScript 项目接入。
export type {
  // AuthSession 表示后端返回的登录会话。
  AuthSession,
  // ChainType 表示链生态类型。
  ChainType,
  // DeepLinkConfig 表示移动端跳转配置。
  DeepLinkConfig,
  // JwtRefreshRequest 表示刷新 JWT 的请求参数。
  JwtRefreshRequest,
  // NonceRequest 表示请求 nonce 的参数。
  NonceRequest,
  // VerifySignaturePayload 表示后端验签参数。
  VerifySignaturePayload,
  // WalletAccount 表示连接成功后的账户。
  WalletAccount,
  // WalletAdapter 表示钱包适配器接口。
  WalletAdapter,
  // WalletAdapterEventHandlers 表示钱包扩展事件监听回调。
  WalletAdapterEventHandlers,
  // WalletAuthConfig 表示签名登录配置。
  WalletAuthConfig,
  // WalletContextValue 表示 useWallet 返回值。
  WalletContextValue,
  // WalletEventMap 表示事件总线支持的事件。
  WalletEventMap,
  // WalletId 表示钱包 id。
  WalletId,
  // WalletKitErrorCode 表示统一错误码。
  WalletKitErrorCode,
  // WalletKitOptions 表示 Provider 通用配置。
  WalletKitOptions,
  // WalletNetwork 表示可切换网络配置。
  WalletNetwork,
  // WalletProviderProps 表示 Provider props。
  WalletProviderProps,
  // WalletState 表示钱包总状态。
  WalletState,
  // WalletStatus 表示钱包连接状态。
  WalletStatus,
} from './types';
