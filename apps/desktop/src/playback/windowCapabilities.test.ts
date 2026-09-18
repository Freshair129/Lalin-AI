import { describe, expect, it } from "vitest";
import defaultCapability from "../../src-tauri/capabilities/default.json";
import playCapability from "../../src-tauri/capabilities/play.json";
import aclManifests from "../../src-tauri/gen/schemas/acl-manifests.json";

type Capability = {
  identifier: string;
  windows: string[];
  permissions: string[];
};

type PermissionManifest = {
  permissions: Record<string, { commands: { allow: string[] } }>;
};

const mainCapability = defaultCapability as Capability;
const playCapabilityConfig = playCapability as Capability;
const installedManifests = aclManifests as unknown as Record<
  string,
  PermissionManifest
>;

const requiredPlayPermissions = {
  "core:event:allow-listen": ["core:event", "allow-listen"],
  "core:event:allow-unlisten": ["core:event", "allow-unlisten"],
  "core:window:allow-hide": ["core:window", "allow-hide"],
  "core:window:allow-minimize": ["core:window", "allow-minimize"],
  "core:window:allow-is-maximized": ["core:window", "allow-is-maximized"],
  "core:window:allow-maximize": ["core:window", "allow-maximize"],
  "core:window:allow-unmaximize": ["core:window", "allow-unmaximize"],
  "core:window:allow-is-fullscreen": ["core:window", "allow-is-fullscreen"],
  "core:window:allow-set-fullscreen": ["core:window", "allow-set-fullscreen"],
} as const;

describe("native window capability contract", () => {
  it("uses ACL names present in the installed Tauri manifests", () => {
    for (const [permission, [plugin, name]] of Object.entries(
      requiredPlayPermissions
    )) {
      expect(installedManifests[plugin]?.permissions[name]).toBeDefined();
      expect(playCapabilityConfig.permissions).toContain(permission);
    }
  });

  it("grants main only the launcher operations added by this slice", () => {
    expect(mainCapability.windows).toEqual(["main"]);
    expect(
      mainCapability.permissions.filter((permission) =>
        permission.startsWith("core:window:")
      )
    ).toEqual([
      "core:window:allow-show",
      "core:window:allow-unminimize",
      "core:window:allow-set-focus",
    ]);
  });

  it("matches the Play capability to the fixed play label and minimal operations", () => {
    expect(playCapabilityConfig.identifier).toBe("play");
    expect(playCapabilityConfig.windows).toEqual(["play"]);
    expect(playCapabilityConfig.permissions).toEqual(
      Object.keys(requiredPlayPermissions)
    );
    expect(playCapabilityConfig.permissions).not.toContain("core:default");
    expect(
      playCapabilityConfig.permissions.some((permission) =>
        /^(shell|updater|process|dialog):/.test(permission)
      )
    ).toBe(false);
    expect(playCapabilityConfig.permissions).not.toContain(
      "core:window:allow-create"
    );
    expect(playCapabilityConfig.permissions).not.toContain(
      "core:window:allow-show"
    );
    expect(playCapabilityConfig.permissions).not.toContain(
      "core:window:allow-set-focus"
    );
  });

  it("keeps launcher permissions out of the Play caller boundary", () => {
    expect(playCapabilityConfig.permissions).not.toContain(
      "core:window:allow-unminimize"
    );
    expect(playCapabilityConfig.permissions).not.toContain(
      "core:window:allow-set-focus"
    );
  });
});
