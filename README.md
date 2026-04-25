# pumpp-cli

English | [简体中文](./README.zh-CN.md)

> Turn Git branch naming rules into shared project commands.

`pumpp-cli` lets a team define branch naming rules once in `pumpp.config`, then create branches with the same command locally and in CI. It renders tokens, validates the branch name, checks the base branch, creates the branch, optionally checks it out, and optionally pushes it.

For the full manual, see [`docs/usage.md`](./docs/usage.md).

## When To Use It

- Your team creates release branches often and is tired of hand-writing `git checkout -b ...`.
- Branch naming rules currently live in docs, chats, or memory.
- Release, feature, and hotfix branches need the same format across the team.
- Local development and CI should share the same branch creation logic.

## Features

- Works with zero config: built-in `release`, `feature`, and `hotfix` branch types.
- Uses pattern tokens like `{version}`, `{date}`, `{username}`, and `{desc?}`.
- Controls where a branch is created from with `base`, including `main`, `HEAD`, or `.`.
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
# Create a starter config file
pnpm pumpp init

# Add a shared project command
pnpm pkg set scripts.branch="pumpp"

# Pick a branch type interactively
pnpm branch

# Create a release branch
pnpm branch release

# Preview the branch name without changing Git
pnpm branch feature --desc login --dry-run

# Create and push a hotfix branch
pnpm branch hotfix --desc cve-fix --push -y
```

You can also run the CLI directly with `pnpm pumpp release`, `pnpm pumpp feature --desc login`, or `pumpp release` if installed globally. For teams, a `package.json` script keeps the entrypoint visible and consistent.

Default patterns match `pumpConfigDefaults` in `src/config.ts`:

| Type | Default Pattern |
| --- | --- |
| `release` | `release/{version}-{date}` |
| `feature` | `feature/{username}-{desc?}` |
| `hotfix` | `hotfix/{username}-{desc?}` |

## Team Setup

Recommended project entrypoints:

```json
{
  "scripts": {
    "branch": "pumpp",
    "branch:release": "pumpp release",
    "branch:feature": "pumpp feature",
    "branch:hotfix": "pumpp hotfix"
  }
}
```

Then contributors can use:

```bash
pnpm branch
pnpm branch:release
pnpm branch:feature --desc login
```

This keeps branch creation close to the project, like `pnpm test` or `pnpm build`, instead of relying on everyone to remember a raw `git checkout -b` command.

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
    feature: { pattern: 'feature/{username}-{desc?}', base: 'HEAD' },
    hotfix: { pattern: 'hotfix/{username}-{desc?}' },
    chore: { pattern: 'chore/{username}-{desc}' },
  },
})
```

`pattern` controls the branch name. `base` controls where the branch is created from. A top-level `base: 'main'` is a safe default for release and hotfix flows; a type can override it with `base: 'HEAD'` or `base: '.'` when a branch should start from the current checkout.

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
          return `prerelease/${ctx.tokens.version}-${ctx.tokens.date}`
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
