import type { ArcadePlugin, ArcadeScene, KernelContext, LaunchCheck } from './contracts/arcade';
import { buildTelemetryPayload } from './telemetry';

export type KernelErrorCode = 'DUPLICATE_PLUGIN_ID' | 'ROUTE_NOT_FOUND' | 'CAN_LAUNCH_DENIED' | 'LIFECYCLE_FAILURE';

export interface KernelLogEvent {
  level: 'error';
  code: KernelErrorCode;
  stage: 'registry' | 'canLaunch' | 'onExit' | 'scene' | 'onEnter';
  route: string;
  pluginId?: string;
  message: string;
  cause?: unknown;
}

export interface KernelLogger {
  emit(event: KernelLogEvent): void;
}

export interface NavigationResult {
  ok: boolean;
  route: string;
  reason?: string;
  errorMessage?: string;
}

export class DuplicatePluginError extends Error {
  readonly code = 'DUPLICATE_PLUGIN_ID' as const;

  constructor(pluginId: string) {
    super(`Plugin with id "${pluginId}" is already registered.`);
    this.name = 'DuplicatePluginError';
  }
}

export class PluginRegistry {
  private readonly byId = new Map<string, ArcadePlugin>();
  private readonly byRoute = new Map<string, ArcadePlugin>();

  register(plugin: ArcadePlugin): void {
    if (this.byId.has(plugin.id)) {
      throw new DuplicatePluginError(plugin.id);
    }

    this.byId.set(plugin.id, plugin);
    this.byRoute.set(plugin.route, plugin);
  }

  getById(pluginId: string): ArcadePlugin | undefined {
    return this.byId.get(pluginId);
  }

  getByRoute(route: string): ArcadePlugin | undefined {
    return this.byRoute.get(route);
  }
}

export class Kernel {
  private current: {
    route: string;
    plugin: ArcadePlugin;
    scene: ArcadeScene;
  } | null = null;

  constructor(
    private readonly context: KernelContext,
    private readonly registry: PluginRegistry,
    private readonly logger?: KernelLogger,
  ) {}

  async navigateTo(route: string): Promise<NavigationResult> {
    const nextPlugin = this.registry.getByRoute(route);
    if (!nextPlugin) {
      const message = `No game is available for route "${route}".`;
      this.log({ level: 'error', code: 'ROUTE_NOT_FOUND', stage: 'registry', route, message });
      return { ok: false, route, errorMessage: message };
    }

    const launchCheck = this.safeCanLaunch(nextPlugin, route);
    if (!launchCheck.allowed) {
      return {
        ok: false,
        route,
        reason: launchCheck.reason,
        errorMessage: launchCheck.reason,
      };
    }

    const previous = this.current;

    try {
      if (previous) {
        await previous.plugin.onExit(this.context);
        await previous.scene.dispose();
        this.current = null;
      }

      const scene = await nextPlugin.createScene(this.context);
      await scene.activate();
      await nextPlugin.onEnter(this.context);

      this.current = { route, plugin: nextPlugin, scene };
      this.context.telemetry.emit(
        'game_runtime_loaded',
        buildTelemetryPayload({
          profile: this.context.profile,
          gameId: nextPlugin.id,
          manifestId: nextPlugin.manifest?.id,
        }),
      );

      return { ok: true, route };
    } catch (cause) {
      const message = 'We could not switch games right now. Please try again.';
      this.log({
        level: 'error',
        code: 'LIFECYCLE_FAILURE',
        stage: 'scene',
        route,
        pluginId: nextPlugin.id,
        message,
        cause,
      });

      return { ok: false, route, errorMessage: message };
    }
  }

  private safeCanLaunch(nextPlugin: ArcadePlugin, route: string): LaunchCheck {
    try {
      if (nextPlugin.manifest) {
        const policyCheck = this.context.agePolicy.canLaunch(nextPlugin.manifest, this.context.profile);
        if (!policyCheck.allowed) {
          this.log({
            level: 'error',
            code: 'CAN_LAUNCH_DENIED',
            stage: 'canLaunch',
            route,
            pluginId: nextPlugin.id,
            message: policyCheck.reason ?? 'Launch blocked by policy.',
          });
          return policyCheck;
        }
      }

      const launchCheck = nextPlugin.canLaunch(this.context.profile);
      if (!launchCheck.allowed) {
        this.log({
          level: 'error',
          code: 'CAN_LAUNCH_DENIED',
          stage: 'canLaunch',
          route,
          pluginId: nextPlugin.id,
          message: launchCheck.reason ?? 'Launch blocked by policy.',
        });
      }
      return launchCheck;
    } catch (cause) {
      const message = 'This game is unavailable right now.';
      this.log({
        level: 'error',
        code: 'LIFECYCLE_FAILURE',
        stage: 'canLaunch',
        route,
        pluginId: nextPlugin.id,
        message,
        cause,
      });
      return { allowed: false, reason: message };
    }
  }

  private log(event: KernelLogEvent): void {
    this.logger?.emit(event);
  }
}
