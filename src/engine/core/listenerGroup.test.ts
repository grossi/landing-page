import { describe, expect, it } from 'vitest';
import { createListenerGroup } from 'engine/core/listenerGroup';

describe('createListenerGroup', () => {
  it('add registers a live listener; dispose removes it', () => {
    const group = createListenerGroup();
    const target = new EventTarget();
    let calls = 0;
    group.add(target, 'ping', () => { calls++; });
    target.dispatchEvent(new Event('ping'));
    expect(calls).toBe(1);
    group.dispose();
    target.dispatchEvent(new Event('ping'));
    expect(calls).toBe(1);
  });

  it('dispose removes every registration across targets and types', () => {
    const group = createListenerGroup();
    const a = new EventTarget();
    const b = new EventTarget();
    const seen: string[] = [];
    group.add(a, 'move', () => { seen.push('a-move'); });
    group.add(a, 'down', () => { seen.push('a-down'); });
    group.add(b, 'move', () => { seen.push('b-move'); });
    a.dispatchEvent(new Event('move'));
    a.dispatchEvent(new Event('down'));
    b.dispatchEvent(new Event('move'));
    expect(seen).toEqual(['a-move', 'a-down', 'b-move']);
    group.dispose();
    a.dispatchEvent(new Event('move'));
    a.dispatchEvent(new Event('down'));
    b.dispatchEvent(new Event('move'));
    expect(seen).toEqual(['a-move', 'a-down', 'b-move']);
  });

  it('removes a passive-true listener (the deep-field touchmove shape)', () => {
    const group = createListenerGroup();
    const target = new EventTarget();
    let calls = 0;
    group.add(target, 'touchmove', () => { calls++; }, { passive: true });
    target.dispatchEvent(new Event('touchmove'));
    expect(calls).toBe(1);
    group.dispose();
    target.dispatchEvent(new Event('touchmove'));
    expect(calls).toBe(1);
  });

  it('dispose is idempotent and the group is reusable after it', () => {
    const group = createListenerGroup();
    const target = new EventTarget();
    let calls = 0;
    group.add(target, 'ping', () => { calls++; });
    group.dispose();
    group.dispose();
    group.add(target, 'ping', () => { calls++; });
    target.dispatchEvent(new Event('ping'));
    expect(calls).toBe(1);
    group.dispose();
  });
});
