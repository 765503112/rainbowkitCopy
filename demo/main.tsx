import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectWalletButton, WalletProvider, useWallet } from '../src';
import './style.css';

function WalletDebugPanel() {
  const { state, networks } = useWallet();

  return (
    <section className="demo-panel">
      <h2>当前钱包状态</h2>
      <dl>
        <div>
          <dt>连接状态</dt>
          <dd>{state.status}</dd>
        </div>
        <div>
          <dt>钱包</dt>
          <dd>{state.wallet ?? '-'}</dd>
        </div>
        <div>
          <dt>地址</dt>
          <dd>{state.account?.address ?? '-'}</dd>
        </div>
        <div>
          <dt>Chain ID</dt>
          <dd>{state.account?.chainId ?? '-'}</dd>
        </div>
        <div>
          <dt>内置网络数</dt>
          <dd>{networks.length}</dd>
        </div>
      </dl>
      {state.error ? <p className="demo-error">{state.error.code}: {state.error.message}</p> : null}
    </section>
  );
}

function App() {
  return (
    <WalletProvider>
      <main className="demo-shell">
        <div className="demo-header">
          <div>
            <p>Local Demo</p>
            <h1>Rainbow Wallet Kit</h1>
          </div>
          <ConnectWalletButton label="连接钱包" />
        </div>
        <WalletDebugPanel />
      </main>
    </WalletProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
