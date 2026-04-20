import fs from "node:fs/promises";
import path from "node:path";
import { PumppError } from "../errors";

export type InitFormat = "ts" | "mjs" | "json";

export interface InitOptions {
  cwd: string;
  format: InitFormat;
  force: boolean;
}

export interface InitResult {
  path: string;
  created: boolean;
  overwrote: boolean;
}

const KNOWN_CONFIG_FILES = [
  "pumpp.config.ts",
  "pumpp.config.mts",
  "pumpp.config.mjs",
  "pumpp.config.cjs",
  "pumpp.config.js",
  "pumpp.config.json",
];

export async function runInit(opts: InitOptions): Promise<InitResult> {
  const filename = `pumpp.config.${opts.format}`;
  const target = path.resolve(opts.cwd, filename);

  const existing = await findExisting(opts.cwd);
  if (existing && !opts.force) {
    throw new PumppError(`Found existing ${path.basename(existing)}`, {
      code: "INVALID_ARGUMENT",
      hint: "Pass --force to overwrite, or delete the file manually",
    });
  }

  await fs.writeFile(target, buildTemplate(opts.format), "utf8");

  return {
    path: target,
    created: !existing,
    overwrote: Boolean(existing),
  };
}

async function findExisting(cwd: string): Promise<string | undefined> {
  for (const name of KNOWN_CONFIG_FILES) {
    const p = path.resolve(cwd, name);
    try {
      await fs.access(p);
      return p;
    } catch {
      /* not found */
    }
  }
  return undefined;
}

const TEMPLATE_TS = `import { definePumpConfig } from 'pumpp-cli'

export default definePumpConfig({
  base: 'main',
  remote: 'origin',

  manifest: {
    file: 'package.json',
    versionKey: 'version',
  },

  types: {
    release: {
      pattern: 'release/{version}-{date}',
      description: 'Create a release branch',
    },
    feature: {
      pattern: 'feature/{username}-{desc?}-{date}',
      description: 'Create a feature branch',
      // base: 'HEAD', // Cut from the current branch instead of 'main'. '.' works too.
    },
    hotfix: {
      pattern: 'hotfix/{username}-{desc?}-{date}',
      description: 'Create a hotfix branch',
    },
  },

  // Custom token providers: expose new {tokens} or override built-ins.
  // User providers with the same name override built-ins.
  // tokenProviders: [
  //   {
  //     name: 'ticket',
  //     resolve: () => process.env.JIRA_TICKET?.toLowerCase(),
  //   },
  // ],

  // Post-render branch-name hook.
  // Priority: runtime > types.X.customBranchName > customBranchName.
  // Return a string to override; return undefined to keep the default name.
  // customBranchName: (ctx) => {
  //   if (/-(alpha|beta|rc)/.test(ctx.tokens.version ?? ''))
  //     return ctx.branchName.replace(/^release\\//, 'prerelease/')
  // },
})
`;

const TEMPLATE_MJS = `/** @type {import('pumpp-cli').PumpInputConfig} */
export default {
  base: 'main',
  remote: 'origin',

  manifest: {
    file: 'package.json',
    versionKey: 'version',
  },

  types: {
    release: {
      pattern: 'release/{version}-{date}',
      description: 'Create a release branch',
    },
    feature: {
      pattern: 'feature/{username}-{desc?}-{date}',
      description: 'Create a feature branch',
      // base: 'HEAD', // Cut from the current branch instead of 'main'. '.' works too.
    },
    hotfix: {
      pattern: 'hotfix/{username}-{desc?}-{date}',
      description: 'Create a hotfix branch',
    },
  },

  // tokenProviders: [
  //   { name: 'ticket', resolve: () => process.env.JIRA_TICKET?.toLowerCase() },
  // ],

  // customBranchName: (ctx) => {
  //   if (/-(alpha|beta|rc)/.test(ctx.tokens.version ?? ''))
  //     return ctx.branchName.replace(/^release\\//, 'prerelease/')
  // },
}
`;

const TEMPLATE_JSON = `{
  "base": "main",
  "remote": "origin",
  "manifest": {
    "file": "package.json",
    "versionKey": "version"
  },
  "types": {
    "release": {
      "pattern": "release/{version}-{date}",
      "description": "Create a release branch"
    },
    "feature": {
      "pattern": "feature/{username}-{desc?}-{date}",
      "description": "Create a feature branch"
    },
    "hotfix": {
      "pattern": "hotfix/{username}-{desc?}-{date}",
      "description": "Create a hotfix branch"
    }
  }
}
`;

export function buildTemplate(format: InitFormat): string {
  switch (format) {
    case "ts":
      return TEMPLATE_TS;
    case "mjs":
      return TEMPLATE_MJS;
    case "json":
      return TEMPLATE_JSON;
  }
}
