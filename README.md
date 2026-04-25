# pumpp-cli

English | [简体中文](./README.zh-CN.md)

> Create convention-based Git branches from project config and manifest version.

`pumpp-cli` is a small CLI for turning branch naming rules into repeatable commands. Define your patterns once, then let `pumpp` render the branch name, validate it, create it, optionally check it out, and optionally push it.

For the full manual, see [`docs/usage.md`](./docs/usage.md).

## When To Use It

- Release branches need a stable version/date format.
- Feature and hotfix branches should follow the same team naming rules.
- You want fewer hand-written branch names and fewer typos.
- Local development and CI should share the same branch creation logic.

## Features

- Works with zero config: built-in `release`, `feature`, and `hotfix` branch types.
- Uses pattern tokens like `{version}`, `{date}`, `{username}`, and `{desc?}`.
- Cleans optional token separators automatically, so empty `{desc?}` does not leave a dangling `-`.
- Prompts before creating a branch, with `Accept`, `Edit`, and `Cancel`.
- Runs Git safety checks for dirty worktrees, invalid branch names, and branch name collisions.
- Supports custom branch types, custom token providers, `customBranchName`, and a programmatic API.

## Install

```bash
pnpm add -D pumpp-cli
# or
pnpm add -g pumpp-cli
```

Requires Node.js `>= 18`.

## Quick Start

```bash
# Optional: create a starter config file
pumpp init

# Create a release branch
pumpp release

# Pick a branch type interactively
pumpp

# Preview the branch name without changing Git
pumpp feature --desc login --dry-run

# Create and push a hotfix branch
pumpp hotfix --desc cve-fix --push -y
```

Default patterns match `pumpConfigDefaults` in `src/config.ts`:

| Type | Default Pattern |
| --- | --- |
| `release` | `release/{version}-{date}` |
| `feature` | `feature/{username}-{desc?}` |
| `hotfix` | `hotfix/{username}-{desc?}` |

## Built-In Tokens

| Token | Source |
| --- | --- |
| `version` | Manifest version, by default `package.json#version` |
| `major` / `minor` / `patch` | SemVer parts parsed from `version` |
| `date` | Current date as `YYYYMMDD`, or `--date` |
| `year` / `month` / `day` | Parts derived from `date` |
| `username` | Git user name, environment user, or OS user, then slugified |
| `desc` | `--desc` or interactive input, then slugified |
| `branch` | Current Git branch name, then slugified |
| `random` | Six-character random hex string |

Tokens are only resolved when they appear in a pattern as `{name}` or `{name?}`. Use `requiredTokens` if a type should require a token even when it is not written directly in the pattern.

## Config Example

Create `pumpp.config.ts` in your project root:

```ts
import { definePumpConfig } from 'pumpp-cli'

export default definePumpConfig({
  base: 'main',
  types: {
    release: { pattern: 'release/{version}-{date}' },
    feature: { pattern: 'feature/{username}-{desc?}' },
    hotfix: { pattern: 'hotfix/{username}-{desc?}' },
    chore: { pattern: 'chore/{username}-{desc}' },
  },
})
```

## Custom Tokens

Add a token provider when branch names need data from your own project, such as a ticket ID:

```ts
import { definePumpConfig } from 'pumpp-cli'

export default definePumpConfig({
  types: {
    feature: { pattern: 'feature/{ticket}-{desc}' },
  },
  tokenProviders: [
    {
      name: 'ticket',
      resolve: () => process.env.JIRA_TICKET?.toLowerCase(),
    },
  ],
})
```

If a token may need user input, mark it as `interactive: true`. In non-interactive mode, unresolved required tokens fail instead of being skipped silently.

## Custom Final Names

Use `customBranchName` when pattern rendering is not enough:

```ts
import { definePumpConfig } from 'pumpp-cli'

export default definePumpConfig({
  types: {
    release: {
      pattern: 'release/{version}-{date}',
      customBranchName: (ctx) => {
        if (/-(?:alpha|beta|rc)/.test(ctx.tokens.version ?? ''))
          return ctx.branchName.replace(/^release\//, 'prerelease/')
      },
    },
  },
})
```

## Programmatic API

```ts
import { pumpBranch } from 'pumpp-cli'

const { branchName } = await pumpBranch('release', {
  desc: 'v2-launch',
  push: true,
  yes: true,
})
```

## License

MIT
