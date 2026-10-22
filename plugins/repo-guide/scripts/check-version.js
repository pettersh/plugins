const { existsSync, readFileSync } = require("node:fs");
const https = require("node:https");
const { dirname, join, resolve } = require("node:path");

const marketplaceUrl = "https://raw.githubusercontent.com/pettersh/plugins/main/.github/plugin/marketplace.json";
const pluginName = "repo-guide";
const updateCommand = `copilot plugin update ${pluginName}`;

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

function parseVersion(version) {
  const match = version.match(/^[vV]?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
  if (!match) {
    return undefined;
  }

  return {
    core: match.slice(1, 4).map(BigInt),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function compareVersions(left, right) {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  if (!leftVersion || !rightVersion) {
    return undefined;
  }

  for (let index = 0; index < leftVersion.core.length; index += 1) {
    if (leftVersion.core[index] !== rightVersion.core[index]) {
      return leftVersion.core[index] > rightVersion.core[index] ? 1 : -1;
    }
  }

  const leftPrerelease = leftVersion.prerelease;
  const rightPrerelease = rightVersion.prerelease;
  if (leftPrerelease.length === 0 || rightPrerelease.length === 0) {
    if (leftPrerelease.length === rightPrerelease.length) {
      return 0;
    }
    return leftPrerelease.length === 0 ? 1 : -1;
  }

  for (let index = 0; index < Math.max(leftPrerelease.length, rightPrerelease.length); index += 1) {
    if (leftPrerelease[index] === undefined) {
      return -1;
    }
    if (rightPrerelease[index] === undefined) {
      return 1;
    }
    if (leftPrerelease[index] === rightPrerelease[index]) {
      continue;
    }

    const leftIsNumeric = /^\d+$/.test(leftPrerelease[index]);
    const rightIsNumeric = /^\d+$/.test(rightPrerelease[index]);
    if (leftIsNumeric && rightIsNumeric) {
      return BigInt(leftPrerelease[index]) > BigInt(rightPrerelease[index]) ? 1 : -1;
    }
    if (leftIsNumeric !== rightIsNumeric) {
      return leftIsNumeric ? -1 : 1;
    }
    return leftPrerelease[index] > rightPrerelease[index] ? 1 : -1;
  }

  return 0;
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

async function getMarketplace(startDirectory) {
  try {
    return await fetchMarketplace(new URL(marketplaceUrl));
  } catch (remoteError) {
    const localMarketplace = readMarketplaceFile(startDirectory) || readMarketplaceFile(process.env.COPILOT_PLUGIN_ROOT || process.cwd());
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

  const marketplace = await getMarketplace(hookInput.cwd || process.cwd());
  const marketplaceVersion = getMarketplaceVersion(marketplace.catalog);
  const marketplaceSource = marketplace.source;
  const fallbackNote = marketplace.fallbackReason
    ? ` GitHub could not be reached (${marketplace.fallbackReason}); this local fallback does not confirm the published version.`
    : "";

  if (!marketplaceVersion) {
    writeContext(`repo-guide ${installedVersion} is installed, but ${marketplaceSource} does not declare a marketplace version for ${pluginName}.${fallbackNote}`);
    return;
  }

  const versionOrder = compareVersions(marketplaceVersion, installedVersion);
  if (versionOrder === 0) {
    writeContext(`repo-guide version check passed: installed ${installedVersion} matches ${marketplaceSource} version ${marketplaceVersion}.${fallbackNote}`);
  } else if (versionOrder === 1) {
    const releaseStatus = marketplace.fallbackReason ? "A newer version is listed in the local marketplace, but its published availability is unverified." : "A new version is available.";
    writeContext(`${releaseStatus} Installed repo-guide version: ${installedVersion}. Marketplace version: ${marketplaceVersion}. Tell the user to update with \`${updateCommand}\`. Do not run the command automatically.${fallbackNote}`);
  } else if (versionOrder === -1) {
    writeContext(`Installed repo-guide version ${installedVersion} is newer than ${marketplaceSource} version ${marketplaceVersion}.${fallbackNote}`);
  } else {
    writeContext(`repo-guide versions differ: installed ${installedVersion}, marketplace ${marketplaceVersion}. They are not valid SemVer values, so do not claim that an update is available.${fallbackNote}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    writeContext(`repo-guide version check failed: ${error.message}`);
  });
}

module.exports = { compareVersions, getMarketplaceVersion, readMarketplaceFile };