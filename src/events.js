/* =========================================================================
   events.js — synchronous pub/sub bus.

   Any module may emit. Only achievements.js subscribes.
   Zero imports — this is a dependency-graph leaf.
   ========================================================================= */
const _listeners = {}; // { [eventName: string]: Set<Function> }

export function emit(eventName, payload = {}) {
  for (const handler of (_listeners[eventName] ?? [])) {
    try { handler(payload); }
    catch (e) { console.error(`[events] handler error for "${eventName}":`, e); }
  }
}

export function on(eventName, handler) {
  if (!_listeners[eventName]) _listeners[eventName] = new Set();
  _listeners[eventName].add(handler);
}

export function off(eventName, handler) {
  _listeners[eventName]?.delete(handler);
}
