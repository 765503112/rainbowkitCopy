// 引入包内事件总线，用来把跨 Tab 收到的状态继续广播给 React 层。
import { EventEmitter } from './eventEmitter';
// 引入钱包事件和状态类型。
import type { WalletEventMap, WalletState } from '../types';

// SYNC_EVENT 是 BroadcastChannel 的频道名，多 Tab 会通过同一个名字通信。
const SYNC_EVENT = 'rainbow-wallet-kit:state';
// SyncPayload 是跨 Tab 传输的钱包状态消息格式。
type SyncPayload = {
  // tabId 标记消息来自哪个 Tab。
  tabId: string;
  // storageKey 标记消息属于哪一个业务实例，避免 demo 和真实项目互相串状态。
  storageKey: string;
  // state 是要同步的钱包状态。
  state: WalletState;
};

// WalletStateSync 负责把钱包状态同步到其它浏览器 Tab。
export class WalletStateSync {
  // channel 保存 BroadcastChannel 实例，不支持的浏览器里它是 undefined。
  private channel?: BroadcastChannel;
  // tabId 是当前 Tab 的随机 id，用来避免收到自己发出的消息后重复处理。
  private tabId = Math.random().toString(36).slice(2);

  // constructor 在创建同步器时接收事件总线和 localStorage key。
  constructor(
    // emitter 用来把跨 Tab 收到的状态继续 emit 给应用内部。
    private emitter: EventEmitter<WalletEventMap>,
    // storageKey 是 localStorage 里存钱包状态的 key。
    private storageKey: string,
  ) {
    // 如果不是浏览器环境，就不做任何同步。
    if (typeof window === 'undefined') return;

    // 如果浏览器支持 BroadcastChannel，就优先使用它做实时同步。
    if ('BroadcastChannel' in window) {
      // 创建指定频道名的 BroadcastChannel。
      this.channel = new BroadcastChannel(SYNC_EVENT);
      // 监听其它 Tab 发来的消息。
      this.channel.onmessage = (event: MessageEvent<SyncPayload>) => {
        // 如果消息不是当前 Tab 自己发的，并且属于同一个 storageKey，就处理它。
        if (event.data?.tabId !== this.tabId && event.data?.storageKey === this.storageKey) {
          // 把其它 Tab 的状态通过事件总线发给 React Provider。
          this.emitter.emit('state', event.data.state);
        }
      };
    }

    // storage 事件用于兜底同步，也能兼容不支持 BroadcastChannel 的场景。
    window.addEventListener('storage', this.handleStorage);
  }

  // publish 用来把当前 Tab 的钱包状态广播出去。
  publish(state: WalletState): void {
    // 非浏览器环境不支持 localStorage 和 BroadcastChannel。
    if (typeof window === 'undefined') return;
    // payload 里带 tabId，方便其它 Tab 判断消息来源。
    const payload: SyncPayload = { tabId: this.tabId, storageKey: this.storageKey, state };
    // 写入 localStorage，刷新页面或新 Tab 可以读取最近状态。
    localStorage.setItem(this.storageKey, JSON.stringify(payload));
    // 通过 BroadcastChannel 实时通知其它 Tab。
    this.channel?.postMessage(payload);
  }

  // read 用来从 localStorage 读取最近一次钱包状态。
  read(): WalletState | undefined {
    // 非浏览器环境无法读取 localStorage。
    if (typeof window === 'undefined') return undefined;
    // 从 localStorage 读取原始字符串。
    const raw = localStorage.getItem(this.storageKey);
    // 没有缓存就返回 undefined。
    if (!raw) return undefined;

    // try/catch 防止 localStorage 里数据损坏导致页面崩溃。
    try {
      // 把 JSON 字符串解析成对象。
      const parsed = JSON.parse(raw) as Partial<SyncPayload>;
      // 如果上一次页面关闭或刷新时还在 connecting，不能恢复这个临时状态。
      if (parsed.state?.status === 'connecting') {
        // 恢复成 disconnected，避免按钮刷新后永远显示 Connecting。
        return {
          status: 'disconnected',
          wallet: parsed.state.wallet,
          updatedAt: Date.now(),
        };
      }
      // 返回里面的钱包状态。
      return parsed.state;
    } catch {
      // 解析失败说明缓存数据不可用，直接忽略。
      return undefined;
    }
  }

  // destroy 用来清理事件监听和 BroadcastChannel。
  destroy(): void {
    // 关闭 BroadcastChannel，释放浏览器资源。
    this.channel?.close();
    // 如果在浏览器环境，移除 storage 监听。
    if (typeof window !== 'undefined') {
      // 移除构造函数里注册的 storage 事件。
      window.removeEventListener('storage', this.handleStorage);
    }
  }

  // handleStorage 是 localStorage 变化时触发的处理函数。
  private handleStorage = (event: StorageEvent) => {
    // 只处理当前钱包状态对应的 key，并且必须有新值。
    if (event.key !== this.storageKey || !event.newValue) return;
    // try/catch 防止其它脚本写入异常 JSON 导致报错。
    try {
      // 解析其它 Tab 写入的状态 payload。
      const payload = JSON.parse(event.newValue) as SyncPayload;
      // 如果不是当前 Tab 自己写的，就继续同步。
      if (payload.tabId !== this.tabId && payload.storageKey === this.storageKey) {
        // 通过事件总线发出 state 事件。
        this.emitter.emit('state', payload.state);
      }
    } catch {
      // 忽略旧版本或其它脚本写入的异常跨 Tab 数据。
    }
  };
}
