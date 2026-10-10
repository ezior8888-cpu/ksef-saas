#!/usr/bin/env node
// Preparation only: command descriptions are data. There is deliberately no executor.
import { closeSync, fstatSync, openSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MAX_INPUT_BYTES = 64 * 1024;
const SOURCES = [
  { id: "postgresql", host: "db-1" },
  { id: "app-minio", host: "ops-1" },
  { id: "supabase-minio", host: "db-1" },
];
const CONFIG_KEYS = ["schemaVersion", "scope", "pgContainer", "stagingRoot", "credentialRoot"];

function invalid() { throw new Error("INVALID_PREPARATION_CONFIG"); }
function directory(value) {
  if (typeof value !== "string" || value.length > 200 ||
      !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(value)) invalid();
  return value;
}

export function validateConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config) ||
      Object.keys(config).length !== CONFIG_KEYS.length ||
      CONFIG_KEYS.some((key) => !Object.hasOwn(config, key)) ||
      config.schemaVersion !== 1 || config.scope !== "preparation-only" ||
      typeof config.pgContainer !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(config.pgContainer)) invalid();
  const stagingRoot = directory(config.stagingRoot);
  const credentialRoot = directory(config.credentialRoot);
  if (stagingRoot === credentialRoot || stagingRoot.startsWith(credentialRoot + "/") ||
      credentialRoot.startsWith(stagingRoot + "/")) invalid();
  return { ...config };
}

function command(id, host, executable, args, options = {}) {
  return { id, host, executable, args, requiredExitCode: 0, ...options };
}

export function prepareBackupPlan(rawConfig, runId) {
  const config = validateConfig(rawConfig);
  // A run ID identifies a future set, never evidence that it has happened.
  if (typeof runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(runId)) {
    throw new Error("INVALID_RUN_ID");
  }
  const runRoot = path.posix.join(config.stagingRoot, runId);
  const pgDirectory = path.posix.join(runRoot, "postgresql");
  const dbCommands = [];
  for (const database of ["postgres", "_supabase"]) {
    const dump = path.posix.join(pgDirectory, database + ".dump");
    dbCommands.push(command("dump-" + database, "db-1", "docker", [
      "exec", config.pgContainer, "pg_dump", "--username=supabase_admin",
      "--no-password", "--dbname=" + database, "--format=custom", "--compress=6",
    ], { stdoutFile: dump, outputMustBeNew: true }));
    // No --dbname: pg_restore --list only inspects the archive table of contents.
    dbCommands.push(command("inspect-" + database, "db-1", "docker", [
      "exec", "-i", config.pgContainer, "pg_restore", "--list",
    ], { stdinFile: dump, stdoutFile: dump + ".toc", outputMustBeNew: true }));
  }
  dbCommands.push(command("dump-globals", "db-1", "docker", [
    "exec", config.pgContainer, "pg_dumpall", "--username=supabase_admin",
    "--no-password", "--globals-only",
  ], { stdoutFile: path.posix.join(pgDirectory, "globals.sql"), outputMustBeNew: true }));

  const repositories = SOURCES.map(({ id, host }) => {
    const sourceDirectory = path.posix.join(runRoot, id);
    const common = [
      "--repository-file", path.posix.join(config.credentialRoot, id + ".repository"),
      "--password-file", path.posix.join(config.credentialRoot, id + ".password"),
      "--no-cache",
    ];
    return {
      source: id, host, sourceDirectory,
      prerequisites: ["source-export-complete", "source-manifest-and-sha256-present",
        "approved-consistency-window-covered", "target-eu-off-host-verified", "recovery-keys-escrowed"],
      commands: [
        command("upload-" + id, host, "restic", [...common, "backup", "--json",
          "--host", host, "--tag", "f0", "--tag", "source:" + id,
          "--tag", "run:" + runId, "--group-by", "host", sourceDirectory]),
        command("verify-data-" + id, host, "restic", [...common, "check", "--read-data"]),
        command("identify-snapshot-" + id, host, "restic", [...common, "snapshots", "--json",
          "--host", host, "--tag", "f0,source:" + id + ",run:" + runId]),
      ],
    };
  });
  return {
    schemaVersion: 1, status: "PREPARATION_ONLY", executable: false, runId,
    authorization: { purchase: false, serverChanges: false, backup: false, restore: false, f1: false },
    f0Gate: "NOT_ASSESSED", sourceExportsImplemented: false,
    note: "Descriptions only. No commands are run, no credentials are read, no evidence is collected.",
    scheduleProposal: { timezone: "UTC", start: "00:30", finishBy: "03:30", maximumAgeHours: 26 },
    retentionProposal: { daily: 7, weekly: 4, monthly: 12, unit: "complete-common-run",
      deletionImplemented: false, selection: "Union of latest complete runs in UTC calendar periods; protect all three source snapshots and the later manifest snapshot together." },
    blockers: [
      "No authorization to buy, initialize repositories, export data or change servers.",
      "Refresh private container and source inventories; verify dump privileges and versions.",
      "Choose and verify an encrypted EU target outside all source hosts; no target provisioned here.",
      "Approve a bounded consistency window and identify ALL writers/deleters, including background jobs and lifecycle rules.",
      "Integrate the prepared S3 export library with an authorized source client; verify the declared MinIO profile, credentials and separate recovery configuration.",
      "Versioning Enabled/Suspended, delete markers or active multipart uploads require a revised export plan.",
      "Extract complete DB references using the reviewed storage map and pass them with both export manifests to the offline checker; unknown references block completion.",
      "Prepare recovery configuration, encryption keys and independent key custody; verify access from a separate client.",
      "Implement orchestration, cross-source locking, timeouts and signal delivery; authenticate the retention planner input and review its proposed sets before separately authorized execution.",
    ],
    preparationTools: {
      s3Export: { module: "scripts/ops/export-backup-s3.mjs", mode: "library-with-injected-client",
        productionClientConfigured: false, minioRecoveryConfigurationComplete: false },
      references: { module: "scripts/ops/check-backup-references.mjs", mode: "local-normalized-input",
        mapping: "ops/observability/backup/storage-reference-map.json",
        inputAdapter: "scripts/ops/prepare-backup-reference-input.mjs", databaseExtractionImplemented: false },
      retention: { module: "scripts/ops/plan-backup-retention.mjs", mode: "local-plan-only",
        authenticatedEvidenceRequiredBeforeDeletion: true, deletionImplemented: false },
    },
    localStagingRequirements: { root: runRoot, exclusiveRunDirectory: true, directoryMode: "0700",
      fileMode: "0600", symlinksAllowed: false, failedOutputMustNotBeReused: true,
      sufficientSpaceMustBeMeasured: true, plaintextMayExistUntilSecureCleanup: true },
    sourceCommands: dbCommands,
    manualExports: [
      { source: "app-minio", host: "ops-1", directory: path.posix.join(runRoot, "app-minio") },
      { source: "supabase-minio", host: "db-1", directory: path.posix.join(runRoot, "supabase-minio") },
    ],
    recoveryBundle: { location: path.posix.join(pgDirectory, "recovery-bundle"),
      required: ["runtime-and-image-inventory", "database-globals-and-extensions", "app-and-worker-config",
        "supabase-auth-jwt-and-storage-config", "application-encryption-keys", "pgsodium-key-if-used",
        "both-minio-config-and-access-policies"],
      note: "Repository passwords and access/recovery keys also need custody outside the encrypted repository." },
    repositories,
    completion: { validator: "scripts/ops/check-backup-set.mjs", automaticSuccessSignal: false,
      required: "All three snapshots, matching run ID, complete source exports, references and independent off-host read evidence.",
      limit: "A structurally valid declaration is not authentic evidence, successful restore or F0 acceptance." },
  };
}

function readConfig(file) {
  if (typeof file !== "string" || !file || file.startsWith("-") ||
      /^[\\/]{2}/.test(file) || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(file)) invalid();
  const descriptor = openSync(file, "r");
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) invalid();
    const content = readFileSync(descriptor);
    if (content.byteLength > MAX_INPUT_BYTES) invalid();
    return JSON.parse(content.toString("utf8").replace(/^\uFEFF/, ""));
  } finally { closeSync(descriptor); }
}

export function main(args, { stdout = process.stdout, stderr = process.stderr } = {}) {
  if (args.length === 1 && args[0] === "--help") {
    stdout.write("Usage: node scripts/ops/prepare-backup-plan.mjs --config <local-json> --run-id <planned-id>\nPreparation only; prints JSON descriptions. There is no execute option. Keep real configurations and output outside Git.\n");
    return 0;
  }
  try {
    if (args.length !== 4 || args[0] !== "--config" || args[2] !== "--run-id") invalid();
    const plan = prepareBackupPlan(readConfig(args[1]), args[3]);
    stdout.write(JSON.stringify(plan, null, 2) + "\n");
    return 0;
  } catch {
    // Do not reflect file paths, unexpected JSON fields, credentials or parser diagnostics.
    stderr.write("Preparation failed: check the local configuration and arguments against the example.\n");
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
