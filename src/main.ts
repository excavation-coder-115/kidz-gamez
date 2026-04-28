import './style.css';
import type { KernelContext } from './contracts/arcade';
import { Kernel, PluginRegistry } from './kernel';
import { createMxMiniPlugin } from './games/mx-mini/plugin';
import { decideBootPath } from './runtime-guardrails';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('App root was not found.');
}

const probeCanvas = document.createElement('canvas');
const webglContext = (probeCanvas.getContext('webgl') ??
  probeCanvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
const bootDecision = decideBootPath({
  hasWebGLRenderingContext: typeof WebGLRenderingContext !== 'undefined',
  webglContextAvailable: Boolean(webglContext),
  maxTextureSize: webglContext ? Number(webglContext.getParameter(webglContext.MAX_TEXTURE_SIZE)) : 0,
  userAgent: navigator.userAgent,
});

if (bootDecision.type === 'unsupported-device') {
  app.innerHTML = `
    <section class="panel">
      <h1>Device unsupported</h1>
      <p>${bootDecision.message}</p>
      <p>${bootDecision.reasons.join(' ')}</p>
    </section>
  `;
} else {
  const context: KernelContext = {
    profile: null,
    agePolicy: { canLaunch: () => ({ allowed: true }) },
    telemetry: {
      emit: (eventType, payload) => {
        if (import.meta.env?.DEV) {
          // eslint-disable-next-line no-console
          console.debug('[telemetry]', eventType, payload);
        }
      },
    },
    mount: app,
  };

  const registry = new PluginRegistry();
  registry.register(createMxMiniPlugin());

  const kernel = new Kernel(context, registry, {
    emit: (event) => {
      // eslint-disable-next-line no-console
      console.error('[kernel]', event);
    },
  });

  void kernel.navigateTo('/games/mx-mini');
}
