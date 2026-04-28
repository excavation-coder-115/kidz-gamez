export interface DeviceCapabilityInput {
  hasWebGLRenderingContext: boolean;
  webglContextAvailable: boolean;
  maxTextureSize: number;
  userAgent: string;
}

export interface DeviceSupportResult {
  supported: boolean;
  reasons: string[];
}

export function detectDeviceSupport(input: DeviceCapabilityInput): DeviceSupportResult {
  const reasons: string[] = [];

  if (!input.hasWebGLRenderingContext || !input.webglContextAvailable) {
    reasons.push('WebGL is not available in this environment.');
  }

  return {
    supported: reasons.length === 0,
    reasons,
  };
}
