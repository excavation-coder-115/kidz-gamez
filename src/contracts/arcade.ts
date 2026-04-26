export type VehicleSupport = 'required' | 'optional' | 'none';
export type LaunchMode = 'seamless' | 'load-screen';

export interface AgeBand {
  min: number;
  max: number;
}

export interface GameManifestV1 {
  id: string;
  name: string;
  route: string;
  description: string;
  tags: string[];
  ageBand: AgeBand;
  cabinetType: 'racing' | 'puzzle' | 'builder' | 'arcade';
  vehicleSupport: VehicleSupport;
  launchMode: LaunchMode;
}

export interface VehicleGraphNodeV1 {
  id: string;
  moduleId: string;
  parentId?: string;
  socketId?: string;
  transform: {
    tx: number;
    ty: number;
    tz: number;
    rx: number;
    ry: number;
    rz: number;
    sx: number;
    sy: number;
    sz: number;
  };
}

export interface VehicleGraphV1 {
  schemaVersion: 1;
  classId: string;
  nodes: VehicleGraphNodeV1[];
  cosmetics?: {
    paintId?: string;
    decalIds?: string[];
  };
}

export interface VehicleValidationResult {
  valid: boolean;
  repaired: boolean;
  errors: string[];
  warnings: string[];
  output: VehicleGraphV1;
}

export interface ChildProfile {
  id: string;
  name: string;
  ageBand: AgeBand;
}

export interface LaunchCheck {
  allowed: boolean;
  reason?: string;
}

export interface KernelContext {
  profile: ChildProfile | null;
  agePolicy: {
    canLaunch: (manifest: GameManifestV1, profile: ChildProfile | null) => LaunchCheck;
  };
  telemetry: {
    emit: (eventType: string, payload?: Record<string, unknown>) => void;
  };
}

export interface ArcadePlugin {
  id: string;
  canLaunch(profile: ChildProfile): LaunchCheck;
  onEnter(ctx: KernelContext): Promise<void> | void;
  onExit(ctx: KernelContext): Promise<void> | void;
}
