import { describe, expect, it } from "vitest";
import { previewBranchName } from "../../src/branch-pump";
import { pumpConfigDefaults } from "../../src/config";
import {
  mergeTokenProviders,
  normalizePumpConfig,
} from "../../src/type-registry";
import { buildBuiltinProviders } from "../../src/utils/token-providers";
import { createFakeDeps } from "../helpers/fake-deps";

function baseConfig() {
  const c = normalizePumpConfig(pumpConfigDefaults);
  c.tokenProviders = mergeTokenProviders(
    buildBuiltinProviders(),
    c.tokenProviders,
  );
  return c;
}

describe("previewBranchName", () => {
  it("returns missing interactive tokens in pattern order", async () => {
    const { deps } = createFakeDeps({ gitUser: "Alice Bob" });
    const cfg = baseConfig();
    cfg.types.style = {
      ...cfg.types.feature,
      name: "style",
      pattern: "style({module})/{username}-{desc?}",
    };
    cfg.tokenProviders = mergeTokenProviders(cfg.tokenProviders, [
      { name: "module", interactive: true, resolve: () => undefined },
    ]);

    const preview = await previewBranchName("style", { config: cfg }, deps);

    expect(preview.missing).toEqual([
      { name: "module", optional: false, interactive: true },
      { name: "desc", optional: true, interactive: true },
    ]);
  });

  it("renderWith applies token patches without re-running IO", async () => {
    const { deps } = createFakeDeps({ gitUser: "Alice Bob" });
    const cfg = baseConfig();
    cfg.types.style = {
      ...cfg.types.feature,
      name: "style",
      pattern: "style({module})/{username}-{desc?}",
    };
    cfg.tokenProviders = mergeTokenProviders(cfg.tokenProviders, [
      { name: "module", interactive: true, resolve: () => undefined },
    ]);

    const preview = await previewBranchName("style", { config: cfg }, deps);

    expect(preview.renderWith({ module: "layout" })).toBe(
      "style(layout)/alice-bob-{desc?}",
    );
    expect(preview.renderWith({ module: "layout", desc: "sidebar-fix" })).toBe(
      "style(layout)/alice-bob-sidebar-fix",
    );
  });

  it("keeps legacy desc append behavior when pattern omits {desc}", async () => {
    const { deps } = createFakeDeps({
      manifestValue: "1.2.3",
      now: new Date(2026, 3, 22),
    });
    const cfg = baseConfig();

    const preview = await previewBranchName(
      "release",
      {
        config: {
          ...cfg,
          types: {
            ...cfg.types,
            release: {
              ...cfg.types.release,
              pattern: "release/{version}-{date}",
            },
          },
        },
      },
      deps,
    );

    expect(preview.renderWith({ desc: "rc1" })).toBe(
      "release/1.2.3-20260422-rc1",
    );
  });

  it("preserves seeded desc until explicitly cleared", async () => {
    const { deps } = createFakeDeps();
    const cfg = baseConfig();

    const preview = await previewBranchName(
      "feature",
      {
        config: cfg,
        desc: "Initial Draft",
      },
      deps,
    );

    expect(preview.branchName).toBe("feature/alice-initial-draft");
    expect(preview.tokens.desc).toBe("initial-draft");
    expect(preview.missing).not.toContainEqual({
      name: "desc",
      optional: true,
      interactive: true,
    });
    expect(preview.renderWith({})).toBe("feature/alice-initial-draft");
    expect(preview.renderWith({ desc: "Refined Copy" })).toBe(
      "feature/alice-refined-copy",
    );
    expect(preview.renderWith({ desc: "" })).toBe("feature/alice-{desc?}");
  });
});
