const fs = require("fs");
const path = require("path");

/* -------------------- Helpers -------------------- */

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function cleanVersion(version) {
  if (!version) return null;
  return String(version).trim().replace(/^[^\d]*/, "");
}

function firstExisting(paths) {
  for (const p of paths) {
    if (fileExists(p)) return p;
  }
  return null;
}

// shields.io static badge path encoding:
// hyphens → "--", underscores → "__", spaces → "_", then percent-encode
function shieldsEncode(str) {
  return encodeURIComponent(
    String(str)
      .replace(/-/g, "--")
      .replace(/_/g, "__")
      .replace(/\s+/g, "_")
  );
}

function badge(label, message, color, logo, logoColor = null) {
  let url = `https://img.shields.io/badge/${shieldsEncode(label)}-${shieldsEncode(message)}-${color}?style=for-the-badge`;
  if (logo) url += `&logo=${encodeURIComponent(logo)}`;
  if (logoColor) url += `&logoColor=${encodeURIComponent(logoColor)}`;
  return `<img alt="${label}" src="${url}" />`;
}

/* -------------------- Config -------------------- */

// In CI: GITHUB_REPOSITORY = "owner/repo" (provided automatically by GitHub Actions)
// Locally: fallback to default values
const [githubOwner, githubRepo] = (process.env.GITHUB_REPOSITORY || "Xenovyrion/BGS-Translator").split("/");

/* -------------------- Paths -------------------- */

const root = process.cwd();

const packageJsonPath = path.join(root, "package.json");

const cargoTomlPath = firstExisting([
  path.join(root, "src-tauri", "Cargo.toml"),
  path.join(root, "Cargo.toml"),
]);

const rustToolchainPath = firstExisting([
  path.join(root, "src-tauri", "rust-toolchain.toml"),
  path.join(root, "rust-toolchain.toml"),
  path.join(root, "rust-toolchain"),
]);

const readmePath = path.join(root, "README.md");

/* -------------------- Validation -------------------- */

if (!fileExists(readmePath)) {
  throw new Error("README.md not found.");
}

/* -------------------- Load files -------------------- */

let pkg = null;
if (fileExists(packageJsonPath)) {
  pkg = readJson(packageJsonPath);
}

let cargoToml = null;
if (cargoTomlPath) {
  cargoToml = readText(cargoTomlPath);
}

let rustToolchain = null;
if (rustToolchainPath) {
  rustToolchain = readText(rustToolchainPath);
}

/* -------------------- Extract versions -------------------- */

const allDeps = {
  ...(pkg?.dependencies || {}),
  ...(pkg?.devDependencies || {}),
};

const tsVersion = cleanVersion(allDeps.typescript);
const reactVersion = cleanVersion(allDeps.react);

/* Node */
let nodeVersion = null;
if (pkg?.engines?.node) {
  nodeVersion = pkg.engines.node;
} else {
  const nvmrc = path.join(root, ".nvmrc");
  if (fileExists(nvmrc)) {
    nodeVersion = readText(nvmrc).trim();
  }
}

/* Tauri */
let tauriVersion = null;

if (allDeps["@tauri-apps/api"]) {
  tauriVersion = cleanVersion(allDeps["@tauri-apps/api"]);
}

if (!tauriVersion && allDeps["@tauri-apps/cli"]) {
  tauriVersion = cleanVersion(allDeps["@tauri-apps/cli"]);
}

if (!tauriVersion && cargoToml) {
  const match = cargoToml.match(/tauri\s*=\s*["{]\s*([^"\n}]+)/);
  if (match) {
    tauriVersion = cleanVersion(match[1]);
  }
}

/* Rust */
let rustVersion = null;

if (rustToolchain) {
  const match = rustToolchain.match(/channel\s*=\s*"([^"]+)"/);
  if (match) {
    rustVersion = match[1];
  } else {
    rustVersion = rustToolchain.trim();
  }
}

if (!rustVersion && cargoTomlPath) {
  rustVersion = "stable";
}

/* License */
let license = null;

if (pkg?.license) {
  license = pkg.license;
} else {
  const licenseFiles = [
    path.join(root, "LICENSE"),
    path.join(root, "LICENSE.md"),
  ];

  const found = licenseFiles.find(fileExists);

  if (found) {
    const content = readText(found).toLowerCase();

    if (content.includes("mit license")) license = "MIT";
    else if (content.includes("apache")) license = "Apache-2.0";
    else if (content.includes("gnu")) license = "GPL-3.0";
    else license = "Custom";
  }
}

/* -------------------- Build badge rows -------------------- */

/* ── Row 1 — General (release, license, platform) ── */
const generalBadges = [];

if (githubOwner && githubRepo) {
  generalBadges.push(
    `<img alt="Release" src="https://img.shields.io/github/v/release/${githubOwner}/${githubRepo}?style=for-the-badge" />`
  );
}

if (license) {
  generalBadges.push(
    badge("License", license, "F4C430")
  );
}

// Platform
generalBadges.push(
  badge("Platform", "Windows", "0078D4", "windows11", "white")
);

/* ── Row 2 — Tech stack (languages & frameworks) ── */
const stackBadges = [];

if (tauriVersion) {
  stackBadges.push(
    badge("Tauri", tauriVersion, "24C8DB", "tauri", "white")
  );
}

if (rustVersion) {
  stackBadges.push(
    badge("Rust", rustVersion, "000000", "rust")
  );
}

if (tsVersion) {
  stackBadges.push(
    badge("TypeScript", tsVersion, "3178C6", "typescript", "white")
  );
}

if (reactVersion) {
  stackBadges.push(
    badge("React", reactVersion, "20232A", "react", "61DAFB")
  );
}

if (nodeVersion) {
  stackBadges.push(
    badge("Node.js", nodeVersion, "339933", "nodedotjs", "white")
  );
}

/* Tailwind CSS (fixed) */
stackBadges.push(
  badge("Tailwind_CSS", "3.4", "06B6D4", "tailwindcss", "white")
);

/* -------------------- Inject into README -------------------- */

let readme = readText(readmePath);

function injectBlock(content, startMarker, endMarker, badges) {
  if (!content.includes(startMarker) || !content.includes(endMarker)) {
    throw new Error(`Markers ${startMarker} not found in README.md`);
  }
  // No blank line between marker and badges — keeps <p align="center"> centering intact
  const newBlock = `${startMarker}\n${badges.join("\n")}\n${endMarker}`;
  return content.replace(
    new RegExp(`${escapeRegex(startMarker)}([\\s\\S]*?)${escapeRegex(endMarker)}`),
    newBlock
  );
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

readme = injectBlock(readme, "<!-- BADGES:START -->", "<!-- BADGES:END -->", generalBadges);
readme = injectBlock(readme, "<!-- STACK:START -->",  "<!-- STACK:END -->",  stackBadges);

fs.writeFileSync(readmePath, readme, "utf8");

console.log("✅ README updated with badges!");
console.log(`   General : ${generalBadges.length} badge(s)`);
console.log(`   Stack   : ${stackBadges.length} badge(s)`);
