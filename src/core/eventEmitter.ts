// Listener 表示一个事件监听函数，它接收某个事件对应的数据 payload。
type Listener<T> = (payload: T) => void;

// EventEmitter 是一个轻量事件总线，用来在钱包状态变化时通知其它逻辑。
export class EventEmitter<Events extends Record<string, unknown>> {
  // listeners 保存所有事件名和对应的监听函数集合。
  private listeners = new Map<keyof Events, Set<Listener<Events[keyof Events]>>>();

  // on 用来注册事件监听，并返回一个取消监听的函数。
  on<Key extends keyof Events>(event: Key, listener: Listener<Events[Key]>): () => void {
    // 先取出这个事件已有的监听集合，如果没有就创建一个新的 Set。
    const listeners = this.listeners.get(event) ?? new Set();
    // 把当前监听函数加入集合，类型断言是为了适配泛型事件映射。
    listeners.add(listener as Listener<Events[keyof Events]>);
    // 把更新后的监听集合保存回 Map。
    this.listeners.set(event, listeners);
    // 返回取消函数，调用它就能移除刚才注册的监听。
    return () => this.off(event, listener);
  }

  // off 用来移除某个事件上的某个监听函数。
  off<Key extends keyof Events>(event: Key, listener: Listener<Events[Key]>): void {
    // 如果事件存在，就从 Set 中删除这个监听函数。
    this.listeners.get(event)?.delete(listener as Listener<Events[keyof Events]>);
  }

  // emit 用来触发事件，把 payload 发给所有监听者。
  emit<Key extends keyof Events>(event: Key, payload: Events[Key]): void {
    // 遍历这个事件的所有监听函数，并把 payload 传进去。
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }

  // removeAllListeners 用来清空所有事件监听。
  removeAllListeners(): void {
    // 清空 Map，释放所有监听引用。
    this.listeners.clear();
  }
}
