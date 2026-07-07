// 引入 React 的 useMemo 和 useState。
import { useMemo, useState } from 'react';
// 引入钱包 id 类型，用来限制 preferredWallets 的取值。
import type { WalletId } from '../types';
// 引入 useWallet，用来读取钱包状态和连接、切网方法。
import { useWallet } from './useWallet';

// ConnectWalletButtonProps 描述连接按钮组件支持的配置。
export interface ConnectWalletButtonProps {
  // label 是未连接时按钮上显示的文字。
  label?: string;
  // className 允许业务方给最外层追加自定义类名。
  className?: string;
  // preferredWallets 允许业务方控制钱包列表显示顺序或只显示部分钱包。
  preferredWallets?: WalletId[];
  // onError 是连接或切网出错时的回调。
  onError?: (error: unknown) => void;
}

// ModalView 表示当前打开的是哪个弹窗。
type ModalView = 'wallets' | 'account' | 'networks' | null;

// ConnectWalletButton 是用户页面上看到的连接钱包按钮。
export function ConnectWalletButton({
  // 默认按钮文字。
  label = 'Connect Wallet',
  // 默认不追加类名。
  className = '',
  // 钱包展示顺序。
  preferredWallets,
  // 错误回调。
  onError,
}: ConnectWalletButtonProps) {
  // 从 Provider 里拿到状态、钱包、网络、连接、断开、切网函数。
  const { state, wallets, networks, connect, disconnect, switchNetwork } = useWallet();
  // modal 控制当前打开的钱包弹窗、账户弹窗或网络弹窗。
  const [modal, setModal] = useState<ModalView>(null);
  // activeWallet 记录正在连接的钱包，用于右侧状态区显示。
  const [activeWallet, setActiveWallet] = useState<WalletId | undefined>();
  // switchingNetwork 记录正在切换的网络，用于按钮 loading 文案。
  const [switchingNetwork, setSwitchingNetwork] = useState<string | undefined>();

  // orderedWallets 根据 preferredWallets 计算最终展示的钱包列表。
  const orderedWallets = preferredWallets?.length
    ? preferredWallets.flatMap((id) => wallets.filter((wallet) => wallet.id === id))
    : wallets;

  // activeNetwork 根据当前 chainId 找到当前网络。
  const activeNetwork = useMemo(() => {
    // 取出当前账户的 chainId。
    const chainId = state.account?.chainId;
    // 没有 chainId 时没有当前网络。
    if (chainId === undefined) return undefined;
    // 用字符串比较，兼容数字和字符串两种 chainId。
    return networks.find((network) => String(network.chainId) === String(chainId));
  }, [networks, state.account?.chainId]);

  // selectedWallet 是正在连接的钱包适配器。
  const selectedWallet = activeWallet ? wallets.find((wallet) => wallet.id === activeWallet) : undefined;

  // handleConnect 处理点击钱包列表项后的连接流程。
  const handleConnect = (walletId: WalletId) => {
    // 记录当前点击的钱包，右侧会显示正在打开它。
    setActiveWallet(walletId);
    // 调用 Provider 的 connect。
    void connect(walletId)
      // 连接成功后关闭弹窗。
      .then(() => {
        setModal(null);
        setActiveWallet(undefined);
      })
      // 连接失败时把错误交给外部，同时保留弹窗让用户看到错误。
      .catch((error) => {
        onError?.(error);
        setActiveWallet(undefined);
      });
  };

  // handleSwitchNetwork 处理点击网络列表项后的切网流程。
  const handleSwitchNetwork = (networkId: string) => {
    // 记录正在切换的网络。
    setSwitchingNetwork(networkId);
    // 调用 Provider 的 switchNetwork。
    void switchNetwork(networkId)
      // 切换成功后关闭网络弹窗。
      .then(() => setModal(null))
      // 切换失败时交给外部处理。
      .catch((error) => onError?.(error))
      // 无论成功失败都结束 loading 状态。
      .finally(() => setSwitchingNetwork(undefined));
  };

  // renderWalletModal 渲染连接钱包弹窗。
  const renderWalletModal = () => (
    // 遮罩层覆盖页面背景。
    <div className="rwk-overlay" role="presentation" onMouseDown={() => setModal(null)}>
      {/* 弹窗主体阻止点击冒泡，避免点击内容区也关闭。 */}
      <div className="rwk-modal rwk-wallet-modal" role="dialog" aria-label="Connect wallet" onMouseDown={(event) => event.stopPropagation()}>
        {/* 左侧钱包列表。 */}
        <div className="rwk-modal-sidebar">
          <div className="rwk-modal-title">连接钱包</div>
          <div className="rwk-modal-section-label">可用钱包</div>
          {orderedWallets.map((wallet) => (
            <button
              className={`rwk-wallet ${activeWallet === wallet.id ? 'rwk-wallet-active' : ''}`}
              disabled={Boolean(activeWallet)}
              key={wallet.id}
              type="button"
              onClick={() => handleConnect(wallet.id)}
            >
              <img className="rwk-wallet-logo" src={wallet.icon} alt={`${wallet.name} logo`} />
              <span>{wallet.name}</span>
              <small>{wallet.installed() ? '已安装' : '未安装'}</small>
            </button>
          ))}
        </div>

        {/* 右侧连接状态。 */}
        <div className="rwk-modal-main">
          <button className="rwk-close" type="button" aria-label="Close" onClick={() => setModal(null)}>
            ×
          </button>
          <div className="rwk-connect-status">
            {selectedWallet ? (
              <>
                <img className="rwk-status-logo" src={selectedWallet.icon} alt={`${selectedWallet.name} logo`} />
                <strong>正在打开 {selectedWallet.name}...</strong>
                <span>请在钱包扩展中确认连接</span>
                <i className="rwk-spinner" />
              </>
            ) : (
              <>
                <strong>选择一个钱包</strong>
                <span>点击左侧钱包后会唤起对应扩展</span>
              </>
            )}
          </div>
          {state.error ? <p className="rwk-error">{state.error.message}</p> : null}
        </div>
      </div>
    </div>
  );

  // renderNetworkModal 渲染网络切换弹窗。
  const renderNetworkModal = () => (
    <div className="rwk-overlay" role="presentation" onMouseDown={() => setModal(null)}>
      <div className="rwk-modal rwk-network-modal" role="dialog" aria-label="Switch network" onMouseDown={(event) => event.stopPropagation()}>
        <button className="rwk-close" type="button" aria-label="Close" onClick={() => setModal(null)}>
          ×
        </button>
        <div className="rwk-modal-title">切换网络</div>
        <div className="rwk-network-list">
          {networks.map((network) => {
            const isActive = String(network.chainId) === String(state.account?.chainId);
            return (
              <button
                className={`rwk-network-item ${isActive ? 'rwk-network-active' : ''}`}
                disabled={Boolean(switchingNetwork)}
                key={network.id}
                type="button"
                onClick={() => handleSwitchNetwork(network.id)}
              >
                <span>
                  <strong>{network.name}</strong>
                  <small>{network.chainType === 'evm' ? `Chain ID ${network.chainId}` : 'Solana 网络'}</small>
                </span>
                <em>{switchingNetwork === network.id ? '切换中' : isActive ? '当前' : '切换'}</em>
              </button>
            );
          })}
        </div>
        {state.error ? <p className="rwk-error">{state.error.message}</p> : null}
      </div>
    </div>
  );

  // renderAccountModal 渲染已连接账户弹窗。
  const renderAccountModal = () => (
    <div className="rwk-overlay" role="presentation" onMouseDown={() => setModal(null)}>
      <div className="rwk-modal rwk-account-modal" role="dialog" aria-label="Wallet account" onMouseDown={(event) => event.stopPropagation()}>
        <button className="rwk-close" type="button" aria-label="Close" onClick={() => setModal(null)}>
          ×
        </button>
        <div className="rwk-modal-title">钱包账户</div>
        <div className="rwk-account-row">
          <span>{state.wallet}</span>
          <strong>{state.account ? shortenAddress(state.account.address) : '-'}</strong>
        </div>
        <button className="rwk-disconnect" type="button" onClick={() => void disconnect().then(() => setModal(null))}>
          Disconnect
        </button>
      </div>
    </div>
  );

  // 已连接状态展示网络按钮和账户按钮。
  if (state.status === 'connected' && state.account) {
    return (
      <div className={`rwk-root ${className}`}>
        <div className="rwk-actions">
          <button className="rwk-network-button" type="button" onClick={() => setModal('networks')}>
            {activeNetwork?.name ?? `Chain ${state.account.chainId ?? '-'}`}
          </button>
          <button className="rwk-account" type="button" onClick={() => setModal('account')}>
            <span className="rwk-status-dot" />
            <span>{shortenAddress(state.account.address)}</span>
          </button>
        </div>
        {modal === 'networks' ? renderNetworkModal() : null}
        {modal === 'account' ? renderAccountModal() : null}
      </div>
    );
  }

  // 未连接状态展示蓝色连接按钮。
  return (
    <div className={`rwk-root ${className}`}>
      <button className="rwk-connect" type="button" disabled={state.status === 'connecting'} onClick={() => setModal('wallets')}>
        {state.status === 'connecting' ? 'Connecting...' : label}
      </button>
      {modal === 'wallets' ? renderWalletModal() : null}
    </div>
  );
}

// shortenAddress 把很长的钱包地址缩短显示。
function shortenAddress(address: string): string {
  // 如果地址本来就不长，就直接原样返回。
  if (address.length <= 12) return address;
  // 长地址显示前 6 位和后 4 位，中间用省略号。
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
