import { detectDeviceSupport, type DeviceCapabilityInput } from './device-capability';

export interface BootScreenDecision {
  type: 'game' | 'unsupported-device';
  message: string;
  reasons: string[];
}

export function decideBootPath(input: DeviceCapabilityInput): BootScreenDecision {
  const support = detectDeviceSupport(input);

  if (support.supported) {
    return {
      type: 'game',
      message: 'Ready to play.',
      reasons: [],
    };
  }

  return {
    type: 'unsupported-device',
    message: 'Try a modern desktop browser with WebGL enabled. If this is managed hardware, ask a parent/guardian for help.',
    reasons: support.reasons,
  };
}
