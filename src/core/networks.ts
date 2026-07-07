// 引入网络类型。
import type { WalletNetwork } from '../types';

// DEFAULT_NETWORKS 是组件内置的常用 EVM 网络列表。
export const DEFAULT_NETWORKS: WalletNetwork[] = [
  {
    id: 'ethereum',
    name: 'Ethereum',
    chainType: 'evm',
    chainId: 1,
    rpcUrls: ['https://rpc.ankr.com/eth'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://etherscan.io'],
  },
  {
    id: 'polygon',
    name: 'Polygon',
    chainType: 'evm',
    chainId: 137,
    rpcUrls: ['https://polygon-rpc.com'],
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    blockExplorerUrls: ['https://polygonscan.com'],
  },
  {
    id: 'bsc',
    name: 'BNB Smart Chain',
    chainType: 'evm',
    chainId: 56,
    rpcUrls: ['https://bsc-dataseed.binance.org'],
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    blockExplorerUrls: ['https://bscscan.com'],
  },
  {
    id: 'arbitrum',
    name: 'Arbitrum One',
    chainType: 'evm',
    chainId: 42161,
    rpcUrls: ['https://arb1.arbitrum.io/rpc'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://arbiscan.io'],
  },
  {
    id: 'optimism',
    name: 'Optimism',
    chainType: 'evm',
    chainId: 10,
    rpcUrls: ['https://mainnet.optimism.io'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://optimistic.etherscan.io'],
  },
  {
    id: 'solana-mainnet',
    name: 'Solana Mainnet',
    chainType: 'solana',
    chainId: 'solana:mainnet',
  },
];
