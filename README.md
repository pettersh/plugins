# GitHub Copilot CLI Plugin Marketplace

This repository is a plugin marketplace for GitHub Copilot CLI. The marketplace catalog lives at `.github/plugin/marketplace.json`; plugins are stored under `plugins/`.

## Repository layout

```text
.
|-- .github/
|   `-- plugin/
|       `-- marketplace.json       # Marketplace name and plugin catalog
|-- plugins/
|   `-- repo-guide/
|       |-- plugin.json            # Plugin metadata and version
|       |-- skills/
|       |   |-- hello/SKILL.md     # Hello World skill
|       |   `-- guide/SKILL.md     # Repository guidance and update instructions
|       |-- com.github.copilot/
|       |   `-- hooks/hooks.json   # Copilot-specific lifecycle hooks
|       `-- scripts/
|           `-- check-version.js   # Marketplace version check used by the hook
`-- README.md
```

The marketplace entry's `source` is relative to the repository root. The plugin version appears in both `plugins/repo-guide/plugin.json` and the matching entry in `.github/plugin/marketplace.json`; keep these values identical.

## Install

Add the marketplace once:

```sh
copilot plugin marketplace add pettersh/plugins
```

Install the plugin from the marketplace:

```sh
copilot plugin install repo-guide@pettersh-plugins
```

Check that the marketplace and plugin are registered:

```sh
copilot plugin marketplace browse pettersh-plugins
copilot plugin list
```

For local development, install directly from a checkout instead:

```sh
copilot plugin install ./plugins/repo-guide
```

## Update

Refresh the locally cached marketplace catalog:

```sh
copilot plugin marketplace update pettersh-plugins
```

Update the installed plugin:

```sh
copilot plugin update repo-guide
```

The plugin's `sessionStart` hook independently checks the public `main` branch of this repository, so its notification does not depend on the local marketplace cache being refreshed first.

## Version check hook

The hook is declared in `plugins/repo-guide/com.github.copilot/hooks/hooks.json`. On each Copilot CLI session start, it runs `plugins/repo-guide/scripts/check-version.js` using Node.js.

The script reads the installed version from `plugin.json`, fetches `.github/plugin/marketplace.json` from this repository's public `main` branch over HTTPS, and compares the two versions using SemVer ordering. If the marketplace version is newer, the hook adds context telling Copilot to notify the user and giving the update command. It never runs the update command itself.

If GitHub cannot be reached, the hook searches the current repository and its parent directories for a local `.github/plugin/marketplace.json`. A result from this fallback is explicitly marked unverified as a published release. If neither source is available, the hook reports that the version could not be checked. Requests are limited to four seconds and redirects are restricted to HTTPS.

The hook reports status to Copilot as `additionalContext`; Copilot then communicates the result to the user. It does not display an independent terminal popup.

## Release a version

1. Update `version` in `plugins/repo-guide/plugin.json`.
2. Set the same `version` on the `repo-guide` entry in `.github/plugin/marketplace.json`.
3. Check that both manifests are valid JSON and their version fields match.
4. Push the changes to `main`. The hook will then compare installed copies with the published marketplace version.
