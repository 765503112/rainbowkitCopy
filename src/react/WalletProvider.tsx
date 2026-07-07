// 引入 React 创建 Context、Hook 和状态管理需要的 API。
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
// 引入钱包签名认证、JWT 续期时间计算、JWT 刷新函数。
import { authenticateWallet, getRenewalDelay, refreshJwtSession } from '../core/auth';
// 引入移动端判断和 DApp URL 解析函数。
import { isMobileH5, resolveDappUrl } from '../core/deepLinks';
// 引入轻量事件总线。
import { EventEmitter } from '../core/eventEmitter';
// 引入错误归一化和超时包装函数。
import { normalizeWalletError, withTimeout } from '../core/errors';
// 引入默认网络列表。
import { DEFAULT_NETWORKS } from '../core/networks';
// 引入多 Tab 状态同步类。
import { WalletStateSync } from '../core/storageSync';
// 引入统一错误类。
import { WalletKitError } from '../types';
// 引入创建钱包适配器列表的函数。
import { createWalletAdapters } from '../wallets';
// 引入 Provider 需要的类型定义。
import type { WalletContextValue, WalletEventMap, WalletId, WalletProviderProps, WalletState } from '../types';

// DEFAULT_TIMEOUT_MS 是默认钱包连接超时时间，30 秒。
const DEFAULT_TIMEOUT_MS = 30_000;
// CONNECTING_TIMEOUT_GRACE_MS 是兜底计时器的缓冲时间，避免和真实连接 Promise 同一毫秒竞争。
const CONNECTING_TIMEOUT_GRACE_MS = 1_000;
// DEFAULT_STORAGE_KEY 是 localStorage 里保存钱包同步状态的默认 key。
const DEFAULT_STORAGE_KEY = 'rainbow-wallet-kit:wallet-state';

// initialState 是钱包组件初始状态。
const initialState: WalletState = {
  // 初始状态是 idle，表示还没有开始连接。
  status: 'idle',
  // 初始化时记录当前时间，方便后续多 Tab 状态比较。
  updatedAt: Date.now(),
};

// WalletContext 是 React Context，子组件会通过 useWallet 读取它。
export const WalletContext = createContext<WalletContextValue | undefined>(undefined);

// WalletProvider 是整个钱包系统的大脑，负责状态、连接、认证、同步。
export function WalletProvider({
  // children 是被 Provider 包裹的业务组件。
  children,
  // auth 是签名登录配置。
  auth,
  // deepLinks 是移动端打开钱包 App 配置。
  deepLinks,
  // connectTimeoutMs 是连接超时时间，默认 30 秒。
  connectTimeoutMs = DEFAULT_TIMEOUT_MS,
  // storageKey 是多 Tab 同步使用的 localStorage key。
  storageKey = DEFAULT_STORAGE_KEY,
  // initialWallet 是可选默认钱包。
  initialWallet,
  // autoConnect 控制是否自动连接 initialWallet。
  autoConnect,
  // networks 是业务方传入的网络列表，不传时使用默认列表。
  networks: configuredNetworks,
}: WalletProviderProps) {
  // emitterRef 保存事件总线实例，useRef 保证它在组件重渲染时不重新创建。
  const emitterRef = useRef(new EventEmitter<WalletEventMap>());
  // syncRef 保存多 Tab 同步实例，初始为 null。
  const syncRef = useRef<WalletStateSync | null>(null);
  // pendingConnectionsRef 保存正在进行的钱包连接，避免连点按钮触发重复授权请求。
  const pendingConnectionsRef = useRef(new Map<WalletId, Promise<void>>());
  // state 保存当前钱包状态，setState 用来更新它。
  const [state, setState] = useState<WalletState>(initialState);
  // wallets 创建钱包适配器列表，deepLinks 变化时才重新创建。
  const wallets = useMemo(() => createWalletAdapters(deepLinks), [deepLinks]);
  // networks 是最终用于 UI 展示和切换的钱包网络列表。
  const networks = useMemo(() => configuredNetworks ?? DEFAULT_NETWORKS, [configuredNetworks]);

  // publishState 是统一更新钱包状态的方法。
  const publishState = useCallback((nextState: WalletState) => {
    // 更新当前 React 组件状态。
    setState(nextState);
    // 通过事件总线通知当前页面内部监听者。
    emitterRef.current.emit('state', nextState);
    // 通过 WalletStateSync 同步给其它浏览器 Tab。
    syncRef.current?.publish(nextState);
  }, []);

  // connect 是连接指定钱包的核心方法。
  const connect = useCallback(
    // walletId 表示用户想连接哪个钱包。
    async (walletId: WalletId) => {
      // 如果这个钱包已经有连接请求在进行，就复用那次请求，不再向钱包扩展发第二次请求。
      const pendingConnection = pendingConnectionsRef.current.get(walletId);
      // 直接返回已有 Promise，可以避免 MetaMask 报 wallet_requestPermissions already pending。
      if (pendingConnection) return pendingConnection;

      // 从钱包列表中找到用户选择的钱包适配器。
      const wallet = wallets.find((item) => item.id === walletId);
      // 如果没有找到适配器，直接结束。
      if (!wallet) return;

      // 如果未安装插件，并且业务开启 openOnConnect，并且当前是移动端，就打开钱包 App。
      if (!wallet.installed() && deepLinks?.enabled !== false && deepLinks?.openOnConnect && isMobileH5()) {
        // 通过 deep link 跳转到对应钱包 App。
        window.location.href = wallet.getDeepLink(resolveDappUrl(deepLinks));
        // 跳转后不继续执行浏览器扩展连接逻辑。
        return;
      }

      // 如果没有安装钱包插件，并且没有走 DeepLink，就给出明确错误。
      if (!wallet.installed()) {
        // 创建统一的未找到插件错误。
        const error = new WalletKitError('PROVIDER_NOT_FOUND', `${wallet.name} extension was not found.`);
        // 把状态更新为 error，UI 可以展示错误信息。
        publishState({
          // 标记状态为错误。
          status: 'error',
          // 记录这次尝试连接的钱包。
          wallet: walletId,
          // 保存错误对象。
          error,
          // 更新时间戳。
          updatedAt: Date.now(),
        });
        // 通过事件总线发出 error 事件。
        emitterRef.current.emit('error', error);
        // 抛出错误，让按钮组件的 catch 或业务 onError 能收到。
        throw error;
      }

      // 创建 connecting 状态，表示正在连接钱包。
      const connectingState: WalletState = {
        // 保留原状态里的其它字段。
        ...state,
        // 状态改成 connecting。
        status: 'connecting',
        // 记录当前要连接的钱包。
        wallet: walletId,
        // 清除上一次错误。
        error: undefined,
        // 更新时间戳。
        updatedAt: Date.now(),
      };
      // 发布 connecting 状态。
      publishState(connectingState);

      // connectionTask 是真正的钱包连接任务，会被保存到 pendingConnectionsRef。
      const connectionTask = (async () => {
        // try/catch 用来把连接、签名、认证过程中的错误统一处理。
        try {
          // 调用钱包适配器的 connect，并加上超时控制。
          const account = await withTimeout(
            // wallet.connect 会真正唤起钱包扩展授权弹窗。
            wallet.connect(),
            // 使用配置的连接超时时间。
            connectTimeoutMs,
            // 超时时显示的钱包名称错误信息。
            `${wallet.name} connection timed out.`,
          );
          // 如果启用了 auth，这里会继续走 nonce 签名登录。
          const session = await authenticateWallet({
            // 传入认证配置。
            auth,
            // 传入当前钱包 id。
            wallet: walletId,
            // 传入刚连接成功的账户。
            account,
            // 告诉认证函数如何让当前钱包签名。
            signMessage: (message) => wallet.signMessage(message, account),
          });
          // 连接和可选认证都成功后，发布 connected 状态。
          publishState({
            // 标记已经连接。
            status: 'connected',
            // 保存当前钱包 id。
            wallet: walletId,
            // 保存钱包账户。
            account,
            // 保存认证会话，未启用 auth 时可能是 undefined。
            auth: session,
            // 更新时间戳。
            updatedAt: Date.now(),
          });
          // 发出 accountChanged 事件，通知账户已经可用。
          emitterRef.current.emit('accountChanged', account);
        } catch (error) {
          // 把任意底层错误转换成 WalletKitError。
          const normalized = normalizeWalletError(error);
          // 用户取消、重复请求、超时都应恢复成可点击状态，避免按钮一直 Connecting。
          const recoverableStatus =
            normalized.code === 'USER_REJECTED' || normalized.code === 'REQUEST_PENDING' || normalized.code === 'CONNECT_TIMEOUT'
              ? 'disconnected'
              : 'error';
          // 发布错误状态，方便 UI 展示。
          publishState({
            // 可恢复错误标记为 disconnected，其它错误标记为 error。
            status: recoverableStatus,
            // 记录出错的钱包。
            wallet: walletId,
            // 保存归一化错误。
            error: normalized,
            // 更新时间戳。
            updatedAt: Date.now(),
          });
          // 发出 error 事件。
          emitterRef.current.emit('error', normalized);
          // 继续抛出错误，让调用方也能处理。
          throw normalized;
        } finally {
          // 不管成功还是失败，连接任务结束后都要移除防重复锁。
          pendingConnectionsRef.current.delete(walletId);
        }
      })();

      // 把当前连接任务记录下来，下一次点击会复用它。
      pendingConnectionsRef.current.set(walletId, connectionTask);
      // 等待连接任务完成。
      return connectionTask;
    },
    // 这些依赖变化时，connect 函数会重新创建。
    [auth, connectTimeoutMs, deepLinks, publishState, state, wallets],
  );

  // openWalletApp 是显式打开移动端钱包 App 的方法。
  const openWalletApp = useCallback(
    // walletId 表示要打开哪个钱包 App。
    (walletId: WalletId) => {
      // 找到对应钱包适配器。
      const wallet = wallets.find((item) => item.id === walletId);
      // 没找到钱包、禁用 DeepLink、或不是浏览器环境时不做任何事。
      if (!wallet || deepLinks?.enabled === false || typeof window === 'undefined') return;
      // 跳转到该钱包的 DeepLink。
      window.location.href = wallet.getDeepLink(resolveDappUrl(deepLinks));
    },
    // deepLinks 或 wallets 变化时重新创建函数。
    [deepLinks, wallets],
  );

  // disconnect 用来断开当前钱包连接。
  const disconnect = useCallback(async () => {
    // 根据当前 state.wallet 找到对应钱包适配器。
    const wallet = wallets.find((item) => item.id === state.wallet);
    // 如果钱包适配器提供 disconnect，就调用它。
    await wallet?.disconnect?.();
    // 创建断开后的状态。
    const nextState: WalletState = {
      // 标记为 disconnected。
      status: 'disconnected',
      // 更新时间戳。
      updatedAt: Date.now(),
    };
    // 发布断开状态。
    publishState(nextState);
    // 发出 disconnect 事件。
    emitterRef.current.emit('disconnect', undefined);
  }, [publishState, state.wallet, wallets]);

  // switchNetwork 用来请求当前钱包切换网络。
  const switchNetwork = useCallback(
    // networkId 是要切换到的网络 id。
    async (networkId: string) => {
      // 找到目标网络配置。
      const network = networks.find((item) => item.id === networkId);
      // 如果没有找到网络，抛出不支持错误。
      if (!network) throw new WalletKitError('UNSUPPORTED_CHAIN', `Network ${networkId} is not configured.`);
      // 当前必须已经选择或连接了某个钱包。
      const wallet = wallets.find((item) => item.id === state.wallet);
      // 没有当前钱包时抛出错误。
      if (!wallet) throw new WalletKitError('PROVIDER_NOT_FOUND', 'Connect a wallet before switching networks.');
      // 钱包适配器没有实现 switchNetwork 时，说明不支持程序化切网。
      if (!wallet.switchNetwork) throw new WalletKitError('UNSUPPORTED_CHAIN', `${wallet.name} does not support network switching.`);

      // try/catch 用来把钱包切网失败包装成统一错误。
      try {
        // 调用适配器切换网络，EVM 会唤起钱包扩展确认弹窗。
        const account = await wallet.switchNetwork(network);
        // 如果适配器返回了新账户状态，就更新当前 state。
        if (account && state.status === 'connected') {
          // 发布带新 chainId 的状态。
          publishState({
            ...state,
            account,
            updatedAt: Date.now(),
          });
        }
      } catch (error) {
        // 如果本来就是 UNSUPPORTED_CHAIN，就保持原错误码。
        const normalized =
          error instanceof WalletKitError && error.code === 'UNSUPPORTED_CHAIN'
            ? error
            : new WalletKitError('SWITCH_NETWORK_FAILED', 'Failed to switch wallet network.', error);
        // 切网失败不应该断开钱包，所以保留当前 status，只记录错误信息。
        publishState({ ...state, error: normalized, updatedAt: Date.now() });
        // 抛出错误给按钮组件或业务方。
        throw normalized;
      }
    },
    [networks, publishState, state, wallets],
  );

  // refreshAuth 用来手动或自动刷新 JWT 登录态。
  const refreshAuth = useCallback(async () => {
    // 调用核心认证层的刷新函数。
    const session = await refreshJwtSession({
      // 传入认证配置。
      auth,
      // 传入当前登录态。
      session: state.auth,
      // 传入当前钱包 id。
      wallet: state.wallet,
      // 传入当前账户。
      account: state.account,
    });
    // 如果刷新成功并且当前仍然是 connected，就更新 auth。
    if (session && state.status === 'connected') {
      // 发布带新 session 的状态。
      publishState({
        // 保留原钱包状态。
        ...state,
        // 覆盖 auth 为新 session。
        auth: session,
        // 更新时间戳。
        updatedAt: Date.now(),
      });
    }
  }, [auth, publishState, state]);

  // 这个 effect 初始化多 Tab 同步，并读取 localStorage 里的历史状态。
  useEffect(() => {
    // 创建多 Tab 同步实例。
    const sync = new WalletStateSync(emitterRef.current, storageKey);
    // 保存同步实例到 ref，publishState 会用到。
    syncRef.current = sync;
    // 读取 localStorage 中缓存的钱包状态。
    const stored = sync.read();
    // 如果有缓存状态，就先恢复到 React state。
    if (stored) setState(stored);

    // 监听 EventEmitter 的 state 事件。
    const unsubscribe = emitterRef.current.on('state', (nextState) => {
      // 只有收到的状态不比当前状态旧，才更新当前 React state。
      setState((current) => (nextState.updatedAt >= current.updatedAt ? nextState : current));
    });

    // 组件卸载时执行清理函数。
    return () => {
      // 取消事件监听。
      unsubscribe();
      // 销毁多 Tab 同步实例。
      sync.destroy();
    };
  }, [storageKey]);

  // 这个 effect 处理可选的自动连接功能。
  useEffect(() => {
    // 如果开启 autoConnect 并且提供 initialWallet，就尝试连接。
    if (autoConnect && initialWallet) {
      // 自动连接失败时静默忽略，避免页面初始化直接崩溃。
      void connect(initialWallet).catch(() => undefined);
    }
  }, [autoConnect, connect, initialWallet]);

  // 这个 effect 是连接状态兜底：如果钱包弹窗没有返回结果，也会自动结束 Connecting。
  useEffect(() => {
    // 只有正在连接时才需要兜底计时。
    if (state.status !== 'connecting') return;
    // 计算这次 connecting 已经持续了多久。
    const elapsedMs = Date.now() - state.updatedAt;
    // 真实超时时间再加一点缓冲，避免正常连接刚完成时被兜底覆盖。
    const timeoutMs = Math.max(0, connectTimeoutMs + CONNECTING_TIMEOUT_GRACE_MS - elapsedMs);
    // 设置兜底定时器。
    const timer = window.setTimeout(() => {
      // 创建统一的连接超时错误。
      const error = new WalletKitError('CONNECT_TIMEOUT', 'Wallet connection timed out.');
      // 如果这个钱包还有 pending 连接锁，先清理掉，用户才能再次点击连接。
      if (state.wallet) pendingConnectionsRef.current.delete(state.wallet);
      // 发布 disconnected，避免按钮一直显示 Connecting。
      publishState({
        status: 'disconnected',
        wallet: state.wallet,
        error,
        updatedAt: Date.now(),
      });
      // 通过事件总线通知外部错误监听者。
      emitterRef.current.emit('error', error);
    }, timeoutMs);
    // 状态变化或组件卸载时清理定时器。
    return () => window.clearTimeout(timer);
  }, [connectTimeoutMs, publishState, state.status, state.updatedAt, state.wallet]);

  // 这个 effect 监听钱包扩展自身的事件，例如用户在 MetaMask 里手动切网络。
  useEffect(() => {
    // 只有 connected 状态且当前有钱包时才需要监听。
    if (state.status !== 'connected' || !state.wallet || !state.account) return;
    // 找到当前钱包适配器。
    const wallet = wallets.find((item) => item.id === state.wallet);
    // 如果适配器没有 subscribe 方法，就无法监听钱包事件。
    if (!wallet?.subscribe) return;

    // 注册钱包事件监听，并拿到取消监听函数。
    const unsubscribe = wallet.subscribe({
      // 钱包扩展手动切链时触发。
      onChainChanged: (chainId) => {
        // 只更新 chainId，保持当前连接状态和地址不变。
        publishState({
          ...state,
          account: {
            ...state.account!,
            chainId,
          },
          error: undefined,
          updatedAt: Date.now(),
        });
      },
      // 钱包扩展手动切账户或断开账户时触发。
      onAccountsChanged: (accounts) => {
        // 如果账户数组为空，说明用户在钱包里断开了当前站点授权。
        if (!accounts.length) {
          void disconnect();
          return;
        }
        // 否则把地址更新成钱包当前选中的第一个账户。
        publishState({
          ...state,
          account: {
            ...state.account!,
            address: accounts[0],
          },
          error: undefined,
          updatedAt: Date.now(),
        });
      },
      // 钱包扩展主动断开时同步断开组件状态。
      onDisconnect: () => {
        void disconnect();
      },
    });

    // 组件状态变化或卸载时移除事件监听，避免重复注册。
    return unsubscribe;
  }, [disconnect, publishState, state, wallets]);

  // 这个 effect 处理 JWT 自动续期。
  useEffect(() => {
    // 如果没有 auth 或当前不是 connected，就不需要续期。
    if (!state.auth || state.status !== 'connected') return;
    // 计算距离下一次续期还要等多久。
    const delay = getRenewalDelay(state.auth, auth?.renewalWindowMs);
    // 设置定时器，在合适时间触发刷新。
    const timer = window.setTimeout(() => {
      // 调用 refreshAuth，并捕获刷新失败。
      void refreshAuth().catch((error) => {
        // 把刷新失败错误归一化。
        const normalized = normalizeWalletError(error);
        // 把状态更新成 error，方便 UI 或业务处理。
        publishState({ ...state, status: 'error', error: normalized, updatedAt: Date.now() });
      });
    }, delay);
    // 依赖变化或组件卸载时清理定时器。
    return () => window.clearTimeout(timer);
  }, [auth?.renewalWindowMs, publishState, refreshAuth, state]);

  // value 是提供给 useWallet 的上下文对象。
  const value = useMemo<WalletContextValue>(
    // 返回所有钱包状态和操作方法。
    () => ({
      // 当前钱包状态。
      state,
      // 所有钱包适配器。
      wallets,
      // 网络列表。
      networks,
      // 连接钱包函数。
      connect,
      // 切换网络函数。
      switchNetwork,
      // 断开钱包函数。
      disconnect,
      // 显式打开钱包 App 函数。
      openWalletApp,
      // 刷新认证函数。
      refreshAuth,
    }),
    // 这些依赖变化时才重新生成 value。
    [connect, disconnect, networks, openWalletApp, refreshAuth, state, switchNetwork, wallets],
  );

  // 把钱包上下文提供给所有子组件。
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
