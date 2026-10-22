const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const https = require("node:https");
const { dirname, join, resolve } = require("node:path");

const marketplaceUrl = "https://raw.githubusercontent.com/pettersh/plugins/HEAD/.github/plugin/marketplace.json";
const marketplaceName = "pettersh-plugins";
const pluginName = "repo-guide";

function writeContext(message) {
  process.stdout.write(`${JSON.stringify({ additionalContext: message })}\n`);
}

function readMarketplaceFile(startDirectory) {
  let directory = resolve(startDirectory);

  while (true) {
    const marketplacePath = join(directory, ".github", "plugin", "marketplace.json");
    if (existsSync(marketplacePath)) {
      return {
        catalog: JSON.parse(readFileSync(marketplacePath, "utf8")),
        source: marketplacePath,
      };
    }

    const parent = dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

function fetchMarketplace(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "repo-guide-version-check" } }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        if (redirectCount >= 3) {
          reject(new Error("too many redirects"));
          return;
        }

        const redirectUrl = new URL(response.headers.location, url);
        if (redirectUrl.protocol !== "https:") {
          reject(new Error("marketplace redirected to a non-HTTPS URL"));
          return;
        }

        resolve(fetchMarketplace(redirectUrl, redirectCount + 1));
        return;
      }

      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1024 * 1024) {
          request.destroy(new Error("marketplace response exceeded 1 MiB"));
        }
      });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          reject(new Error(`GitHub returned HTTP ${response.statusCode}`));
          return;
        }

        try {
          resolve({ catalog: JSON.parse(body), source: "GitHub marketplace" });
        } catch (error) {
          reject(new Error(`invalid marketplace JSON: ${error.message}`));
        }
      });
    });

    request.setTimeout(4000, () => request.destroy(new Error("GitHub request timed out")));
    request.on("error", reject);
  });
}

function getMarketplaceVersion(catalog) {
  if (!Array.isArray(catalog.plugins)) {
    throw new Error("marketplace does not contain a plugins array");
  }

  const plugin = catalog.plugins.find((entry) => entry.name === pluginName);
  if (!plugin || typeof plugin.version !== "string" || plugin.version.length === 0) {
    return undefined;
  }
  return plugin.version;
}

async function getMarketplace() {
  try {
    return await fetchMarketplace(new URL(marketplaceUrl));
  } catch (remoteError) {
    const localMarketplace = readMarketplaceFile(process.cwd()) || readMarketplaceFile(process.env.COPILOT_PLUGIN_ROOT || process.cwd());
    if (!localMarketplace) {
      throw new Error(`GitHub marketplace unavailable (${remoteError.message}) and no local marketplace manifest was found`);
    }
    return { ...localMarketplace, fallbackReason: remoteError.message };
  }
}

async function main() {
  const hookInput = JSON.parse(readFileSync(0, "utf8"));
  const pluginRoot = process.env.COPILOT_PLUGIN_ROOT || process.env.PLUGIN_ROOT;
  if (!pluginRoot) {
    writeContext("repo-guide could not determine its installed plugin directory, so its version was not checked.");
    process.exit(0);
  }

  const manifestPath = join(pluginRoot, "plugin.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const installedVersion = manifest.version;
  if (typeof installedVersion !== "string" || installedVersion.length === 0) {
    writeContext("repo-guide could not read a version from its installed plugin.json.");
    process.exit(0);
  }

  const marketplace = await getMarketplace();
  const marketplaceVersion = getMarketplaceVersion(marketplace.catalog);
  const marketplaceSource = marketplace.source;
  const fallbackNote = marketplace.fallbackReason
    ? ` GitHub could not be reached (${marketplace.fallbackReason}); this is a local check, not confirmation of the published version.`
    : "";

  if (!marketplaceVersion) {
    writeContext(`repo-guide ${installedVersion} is installed, but ${marketplaceSource} does not declare a marketplace version for ${pluginName}.${fallbackNote}`);
  } else if (marketplaceVersion === installedVersion) {
    writeContext(`repo-guide version check passed: installed ${installedVersion} matches ${marketplaceSource} version ${marketplaceVersion}.${fallbackNote}`);
  } else {
    writeContext(`repo-guide version mismatch: installed ${installedVersion}, but ${marketplaceSource} lists ${marketplaceVersion}. Do not update automatically; ask the user how to proceed.${fallbackNote}`);
  }
}

main().catch((error) => {
  writeContext(`repo-guide version check failed: ${error.message}`);
});

module.exports = { getMarketplaceVersion, readMarketplaceFile };