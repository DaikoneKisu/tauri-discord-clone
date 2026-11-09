export type Unsubscribe = () => void;

/** Minimal typed event emitter shared by every RtcClient implementation. */
export class Emitter<Events extends Record<string, unknown>> {
  #handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(
    event: K,
    cb: (payload: Events[K]) => void,
  ): Unsubscribe {
    let set = this.#handlers.get(event);
    if (!set) {
      set = new Set();
      this.#handlers.set(event, set);
    }
    const handler = cb as (payload: never) => void;
    set.add(handler);
    return () => {
      this.#handlers.get(event)?.delete(handler);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.#handlers.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      (cb as (p: Events[K]) => void)(payload);
    }
  }

  clear(): void {
    this.#handlers.clear();
  }
}
