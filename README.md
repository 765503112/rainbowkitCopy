# Rainbow Wallet Kit

RainbowKit-style React wallet component packaged as ESM, CJS, UMD and TypeScript declarations.

## Features

- MetaMask, OKX Wallet and Phantom adapters
- OKX Wallet detection supports both `window.okxwallet` and EIP-1193 provider arrays
- Phantom detection supports both `window.phantom.solana` and `window.solana`
- Centered wallet modal with backdrop, wallet logos and extension confirmation status
- EVM network switcher with common default chains
- EventEmitter-driven wallet state with BroadcastChannel/localStorage multi-tab sync
- Nonce signature verification hooks
- JWT auto-renewal helper
- Unified timeout, rejection and provider errors
- Duplicate wallet connection clicks are guarded to avoid pending permission requests
- Mobile H5 deep links exposed as explicit wallet-app actions

## Install

```bash
npm install @qinzhehan/rainbow-wallet-kit
```

```tsx
import { WalletProvider, ConnectWalletButton } from '@qinzhehan/rainbow-wallet-kit';
import '@qinzhehan/rainbow-wallet-kit/style.css';

export function App() {
  return (
    <WalletProvider
      auth={{
        enabled: true,
        audience: 'example-dapp',
        getNonce: async ({ address }) => fetch(`/api/nonce?address=${address}`).then((r) => r.text()),
        verifySignature: async (payload) =>
          fetch('/api/wallet/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          }).then((r) => r.json()),
        refreshJwt: async ({ token }) =>
          fetch('/api/session/refresh', {
            method: 'POST',
            headers: { authorization: `Bearer ${token}` },
          }).then((r) => r.json()),
      }}
    >
      <ConnectWalletButton />
    </WalletProvider>
  );
}
```

`ConnectWalletButton` opens a wallet selection panel first. Selecting MetaMask, OKX Wallet or
Phantom calls the detected browser extension provider and lets that extension show its own
connection popup. It does not redirect to a wallet page by default.

For mobile H5 pages, deep links are opt-in. Set `deepLinks.openOnConnect: true` if selecting an
uninstalled wallet should open the wallet app, or call `openWalletApp(walletId)` from `useWallet()`
from your own UI.

If a wallet extension says a permission request is already pending, open the extension and approve
or reject the existing request first. The component also guards repeated clicks so future duplicate
requests are not sent while one connection is already in progress.

UMD usage:

```html
<script src="https://unpkg.com/react/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom/umd/react-dom.production.min.js"></script>
<script src="./dist/index.umd.js"></script>
```
