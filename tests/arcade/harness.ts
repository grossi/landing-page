import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../public/arcade/vendor/three.module.min.js';

/** Execute the shipped scripts, replacing only browser surfaces and drawing. */
export function mountGame(name: string) {
  let now = 0;
  let frame: ((now: number) => void) | undefined;
  const elements = new Map<string, any>();
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    body: { appendChild() {} },
    getElementById(id: string) {
      if (!elements.has(id)) elements.set(id, {
        style: {}, textContent: '', classList: { add() {}, remove() {} },
      });
      return elements.get(id);
    },
    createElement() {
      return { getContext: () => ({
        createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
      }) };
    },
  });
  const target = new EventTarget();
  const host: Record<string, any> = {
    THREE: { ...THREE, WebGLRenderer: class {
      domElement = {};
      setPixelRatio() {} setSize() {} render() {}
    } },
    URLSearchParams, location: { search: '' },
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    performance: { now: () => now }, document,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    requestAnimationFrame(callback: (now: number) => void) { frame = callback; return 1; },
    cancelAnimationFrame() { frame = undefined; },
    setTimeout() {}, localStorage: { getItem() { return null; }, setItem() {} },
  };
  host.window = host;
  const context = vm.createContext(host);
  const html = readFileSync(new URL(`../../public/arcade/${name}/index.html`, import.meta.url), 'utf8');
  const code = html.match(/<script type="module">([\s\S]*?)<\/script>/)![1]
    .replace("import * as THREE from 'three';", '')
    .replace(/import \{.*\} from '\.\.\/shared\/runtime.js';/, '')
    // Retain handles for inspection/cleanup only in the fixture.
    .replace(/^startLoop\(tick\);/m, 'const loop = startLoop(tick);')
    .replace(/^createInput\(/m, 'const input = createInput(');
  const runtime = readFileSync(new URL('../../public/arcade/shared/runtime.js', import.meta.url), 'utf8')
    .replace(/export function /g, 'function ');
  vm.runInContext(runtime, context);
  vm.runInContext(code, context);
  return {
    run<T = any>(code: string): T { return vm.runInContext(code, context); },
    advance(ms: number) { now += ms; const next = frame; frame = undefined; next?.(now); },
    event(type: string, fields = {}) { target.dispatchEvent(Object.assign(new Event(type), fields)); },
    visibility(hidden: boolean) { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); },
    get scheduled() { return frame !== undefined; },
  };
}
