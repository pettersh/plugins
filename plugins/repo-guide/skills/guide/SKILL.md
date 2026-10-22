---
name: guide
description: Give repository-specific advice, explain project conventions, or check this plugin's installed version.
---

Help the user understand and work effectively in the repository where this skill is invoked.

For repository guidance:
- Inspect the root README and the smallest relevant set of configuration, source, and test files before making claims.
- Explain conventions and commands only when supported by repository files. Link to the relevant files when possible.
- Keep advice specific to this repository; do not assume this plugin's own marketplace repository is the user's current repository.
- Ask a concise question when the requested guidance depends on missing project context.

When the user asks whether this plugin is up to date:
- Read the status injected by the Copilot `sessionStart` hook, which compares the installed plugin version with the published GitHub marketplace catalog. Before the repository is pushed, the hook falls back to the local `.github/plugin/marketplace.json`.
- If the hook reports a local fallback, explain that the published version could not be verified yet. The hook checks GitHub's default branch directly, so it does not need to refresh Copilot's marketplace cache.
- If the hook reports a newer published version, tell the user to run `copilot plugin update repo-guide@pettersh-plugins`.
- Do not run the update command automatically.

Do not update the plugin or change repository files unless the user explicitly asks.