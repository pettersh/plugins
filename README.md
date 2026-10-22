# GitHub Copilot CLI Plugin Marketplace

This repository hosts plugins for GitHub Copilot CLI. The marketplace manifest is `.github/plugin/marketplace.json`.

Add the marketplace with:

```sh
copilot plugin marketplace add <OWNER>/<REPOSITORY>
```

## Plugins

`repo-guide` is the starter plugin. It includes a Hello World skill, repository-aware guidance, and a `sessionStart` hook that compares the installed version with the GitHub marketplace catalog. Before this repository is pushed, the hook falls back to the local marketplace manifest. It only reports status; it never updates the plugin.

The plugin is in `plugins/repo-guide`. When releasing a change, increment the version in `plugins/repo-guide/plugin.json` and keep the marketplace entry's `version` in sync. Repositories that use the plugin can refresh the marketplace with `copilot plugin marketplace update pettersh-plugins` before checking for updates.

Validate the marketplace by registering it and confirming its catalog with `copilot plugin marketplace browse pettersh-plugins`. You can install the plugin directly for testing with `copilot plugin install ./plugins/repo-guide`.

To check for a remote update, refresh the catalog with `copilot plugin marketplace update pettersh-plugins`, then compare `copilot plugin list --json` with `copilot plugin marketplace browse pettersh-plugins --json`. Confirm before running `copilot plugin update repo-guide`, since it installs an update.
