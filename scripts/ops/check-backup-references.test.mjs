import assert from "node:assert/strict";
import { closeSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateBackupReferences, runCli } from "./check-backup-references.mjs";

const MAP = JSON.parse(readFileSync(new URL("../../ops/observability/backup/storage-reference-map.json", import.meta.url), "utf8"));
const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);
function fixture() {
  return { schemaVersion: 1, runId: "synthetic-run", mapId: MAP.mapId, sourceRevision: MAP.sourceRevision,
    referenceScope: { complete: true, databaseNames: ["postgres", "_supabase"], mappingIds: MAP.mappings.map(m => m.id),
      rowCounts: Object.fromEntries(MAP.mappings.map(m => [m.id, 0])), unresolvedMappings: 0,
      bucketBindings: { applicationPrimary: "synthetic-primary", applicationBackups: { mode: "shared", bucket: "synthetic-primary" } },
      supabasePhysicalMapping: { complete: true, evidenceSha256: HASH } }, references: [],
    objectManifests: ["application", "supabase"].map(source => ({ source, runId: "synthetic-run", complete: true, versioning: "Unversioned", objects: [] })) };
}
function add(f, { mappingId = "invoices.xml_storage_path", referenceId = "synthetic-row", source = "application", bucket = "synthetic-primary", key = "synthetic/Invoice.xml", originalKey = key, sha256 = null, ...extra } = {}) {
  f.references.push({ mappingId, referenceId, source, bucket, key, originalKey, sha256, ...extra });
  if (Object.hasOwn(f.referenceScope.rowCounts, mappingId)) f.referenceScope.rowCounts[mappingId]++;
  return f.references.at(-1);
}
function object(f, { source = "application", bucket = "synthetic-primary", key = "synthetic/Invoice.xml", bytes = 12, sha256 = HASH, ...extra } = {}) {
  f.objectManifests.find(m => m.source === source).objects.push({ bucket, key, bytes, sha256, ...extra });
}
const check = f => validateBackupReferences(f, MAP);
function rejected(mutate, count) { const f = fixture(); mutate(f); const result = check(f); assert.equal(result.ok, false); if (count) assert(result.counts[count] > 0); }
function capture() { let out = "", err = ""; return { stdout: { write(v) { out += v; } }, stderr: { write(v) { err += v; } }, text: () => out + err, output: () => out }; }
function temp() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "f0-refs-synthetic-"));
  return { directory, cleanup() { const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(directory)); assert(relative && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep)); rmSync(directory, { recursive: true, force: true }); } };
}

test("complete empty synthetic sources are consistent claims, never authentic evidence", () => { const r = check(fixture()); assert.equal(r.ok, true); assert.equal(r.evidenceVerified, false); assert.equal(r.g09Accepted, false); assert.equal(r.counts.exportedOrphans, 0); });
test("matches literal keys and optional absent hashes", () => { const f = fixture(); add(f); object(f); const r = check(f); assert.equal(r.ok, true); assert.equal(r.counts.matchedReferences, 1); assert.equal(r.counts.referencesWithoutExpectedHash, 1); });
test("checks payload SHA-256 when present and allows zero-byte objects", () => { const f = fixture(); add(f, { sha256: HASH }); object(f, { bytes: 0 }); assert.equal(check(f).ok, true); f.references[0].sha256 = OTHER_HASH; assert.equal(check(f).counts.hashMismatches, 1); });
test("case, slashes, percent encodings, dot segments and Unicode stay distinct", () => {
  const f = fixture(); const keys = ["A.xml", "a.xml", "a/b", "a%2Fb", "a//b", "a/../b", "../b", "b", "é", "e\u0301", " spaced "];
  keys.forEach((key, i) => { add(f, { key, referenceId: "row-" + i }); object(f, { key }); });
  assert.equal(check(f).ok, true); assert.equal(check(f).counts.exportedObjects, keys.length);
  f.references[0].key = "a.XML"; f.references[0].originalKey = "a.XML"; assert.equal(check(f).counts.missing, 1);
});
test("same key in different backend/bucket is not a match", () => { const f = fixture(); add(f); object(f, { source: "supabase" }); assert.equal(check(f).counts.missing, 1); object(f, { bucket: "different" }); assert.equal(check(f).counts.missing, 1); });
test("wrong backend cannot override the repository mapping", () => rejected(f => { add(f, { source: "supabase" }); object(f, { source: "supabase" }); }, "unknown"));
test("unknown mappings and required NULL paths fail without showing them", () => {
  rejected(f => add(f, { mappingId: "private-unknown" }), "unknown");
  rejected(f => add(f, { mappingId: "ocr_jobs.source_file_path", bucket: null, key: null, originalKey: null }), "unknown");
});
test("NULL optional references are explicit and do not imply objects; undefined is not NULL", () => {
  const f = fixture(); add(f, { bucket: null, key: null, originalKey: null }); assert.equal(check(f).ok, true); assert.equal(check(f).counts.optionalNullReferences, 1);
  delete f.references[0].key; assert.equal(check(f).ok, false);
});
test("pending OCR marker is unknown even if an object named pending is exported", () => rejected(f => { add(f, { mappingId: "ocr_jobs.source_file_path", key: "pending" }); object(f, { key: "pending" }); }, "unknown"));
test("required DB hashes cannot be nulled and unknown providers cannot fall back", () => {
  rejected(f => { add(f, { mappingId: "xml_documents.storage_path", provider: "r2", sha256: null }); object(f); }, "unknown");
  rejected(f => { add(f, { mappingId: "xml_documents.storage_path", provider: "unknown", sha256: HASH }); object(f); }, "unknown");
  const f = fixture(); add(f, { mappingId: "xml_documents.storage_path", provider: "r2", sha256: HASH }); object(f); assert.equal(check(f).ok, true);
});
test("Glacier references never become application MinIO by assertion", () => {
  rejected(f => add(f, { mappingId: "invoices.archive_storage_path", source: "glacier" }), "unknown");
  rejected(f => { add(f, { mappingId: "invoices.archive_storage_path" }); object(f); }, "unknown");
  const f = fixture(); add(f, { mappingId: "invoices.archive_storage_path", source: "glacier", bucket: null, key: null, originalKey: null }); assert.equal(check(f).ok, true);
});
test("backup relative keys require the explicitly declared bucket mode/prefix", () => {
  const f = fixture(); add(f, { mappingId: "backup_log.r2_key", originalKey: "db/report.gz", key: "backups/db/report.gz", sha256: HASH }); object(f, { key: "backups/db/report.gz" }); assert.equal(check(f).ok, true);
  f.references[0].key = "db/report.gz"; assert.equal(check(f).counts.unknown, 1);
  f.referenceScope.bucketBindings.applicationBackups = { mode: "dedicated", bucket: "synthetic-backups" }; f.references[0].bucket = "synthetic-backups"; object(f, { bucket: "synthetic-backups", key: "db/report.gz" }); assert.equal(check(f).ok, true);
  delete f.referenceScope.bucketBindings.applicationBackups; assert.equal(check(f).ok, false);
});
test("unresolved Supabase translation stays unknown despite complete/hash claims and a matching export", () => {
  const f = fixture(); add(f, { mappingId: "storage.objects.name", source: "supabase", bucket: "synthetic-physical", key: "reported-prefix/logical-bucket/file", originalKey: "file", logicalBucketId: "logical-bucket" }); object(f, { source: "supabase", bucket: "synthetic-physical", key: "reported-prefix/logical-bucket/file" });
  assert.equal(check(f).ok, false); assert.equal(check(f).counts.unknown, 1);
  f.references[0].key = "wrong-normalization"; object(f, { source: "supabase", bucket: "synthetic-physical", key: "wrong-normalization" }); assert.equal(check(f).counts.unknown, 1);
  f.referenceScope.supabasePhysicalMapping.complete = false; assert.equal(check(f).counts.unknown, 1);
  delete f.referenceScope.supabasePhysicalMapping; assert.equal(check(f).ok, false);
});
test("different DB rows may share a target; repeated row/member identity is rejected", () => {
  const f = fixture(); add(f, { referenceId: "row-a" }); add(f, { referenceId: "row-b" }); object(f); assert.equal(check(f).ok, true); assert.equal(check(f).counts.exportedOrphans, 0);
  f.references[1].referenceId = "row-a"; assert.equal(check(f).counts.duplicateReferences, 1);
});
test("duplicate exported objects/sources and versioned payloads fail", () => {
  rejected(f => { object(f); object(f, { sha256: OTHER_HASH }); }, "duplicateExportedObjects");
  rejected(f => { f.objectManifests[1].source = "application"; }, "scopeErrors");
  rejected(f => { f.objectManifests[0].versioning = "Enabled"; }, "scopeErrors");
  rejected(f => object(f, { versionId: "version" }), "invalidObjects");
  rejected(f => object(f, { deleteMarker: true }), "invalidObjects");
});
test("full export preserves and counts orphan objects without blocking", () => { const f = fixture(); object(f); object(f, { source: "supabase", key: "unreferenced" }); const r = check(f); assert.equal(r.ok, true); assert.equal(r.counts.exportedOrphans, 2); });
test("scope must cover both databases, every map, complete listings and matching run/revision", () => {
  for (const change of [f => { f.referenceScope.complete = false; }, f => { f.objectManifests[1].complete = false; }, f => { f.referenceScope.mappingIds.pop(); }, f => { f.referenceScope.mappingIds[1] = f.referenceScope.mappingIds[0]; }, f => { delete f.referenceScope.rowCounts[MAP.mappings[0].id]; }, f => { f.referenceScope.unresolvedMappings = 1; }, f => { f.referenceScope.databaseNames = ["postgres"]; }, f => { f.objectManifests[0].runId = "other"; }, f => { f.sourceRevision = "f".repeat(40); }]) rejected(change, "scopeErrors");
});
test("declared row counts catch omitted normalized references", () => rejected(f => { f.referenceScope.rowCounts["invoices.xml_storage_path"] = 1; }, "scopeErrors"));
test("malformed JSON types and unsafe integer/hash shapes fail without mutation", () => {
  for (const value of [null, [], 1, "private", { referenceScope: { rowCounts: { toString: "private" } } }]) assert.equal(check(value).ok, false);
  const f = fixture(); object(f, { bytes: Number.MAX_SAFE_INTEGER + 1 }); assert.equal(check(f).ok, false);
  const good = fixture(); add(good); object(good); const before = JSON.stringify(good); check(good); assert.equal(JSON.stringify(good), before);
  rejected(v => { add(v, { sha256: "ETag-not-SHA256" }); object(v); }, "unknown");
});
test("CLI help and invalid paths never open inputs", () => { const io = capture(); const files = { openSync() { throw Error('must-not-open'); } }; assert.equal(runCli(["--help"], { ...io, files }), 0); for (const args of [[],["--other"],["https://private.invalid/input"],["\\\\private\\share"],["a","b"]]) assert.equal(runCli(args, { ...io, files }), 2); });
test("CLI output contains counts/status, never keys, hashes, row IDs, source values or input paths", () => {
  const t = temp(); try { const f = fixture(); add(f, { referenceId: "PRIVATE_ROW", key: "PRIVATE_KEY", bucket: "PRIVATE_BUCKET" }); object(f, { key: "PRIVATE_KEY", bucket: "PRIVATE_BUCKET" }); const file = path.join(t.directory, "PRIVATE_PATH.json"); writeFileSync(file, JSON.stringify(f)); const io = capture(); assert.equal(runCli([file], { ...io, referenceMap: MAP }), 1); for (const s of ["PRIVATE_ROW","PRIVATE_KEY","PRIVATE_BUCKET","PRIVATE_PATH",HASH,f.runId]) assert(!io.text().includes(s)); assert.equal(JSON.parse(io.output()).g09Accepted,false); } finally { t.cleanup(); }
});
test("CLI holds one descriptor across actual pathname replacement", () => {
  const t = temp(); try { const file = path.join(t.directory,"input.json"), replacement=path.join(t.directory,"replacement.json"), held=path.join(t.directory,"held.json"); const original=JSON.stringify(fixture()); const substitute='PRIVATE_MALFORMED'; writeFileSync(file,original); writeFileSync(replacement,substitute);
    const fs = { ...awaitlessFs(), fstatSync(fd) { const stat=awaitlessFs().fstatSync(fd); renameSync(file,held); renameSync(replacement,file); return stat; } }; const io=capture(); assert.equal(runCli([file],{...io,files:fs,referenceMap:MAP}),0); assert.equal(readFileSync(held,'utf8'),original); assert.equal(readFileSync(file,'utf8'),substitute); assert(!io.text().includes(substitute));
  } finally { t.cleanup(); }
});
// Node's namespace bindings are immutable; inject a small copy for the FD tests.
import * as nativeFs from "node:fs";
function awaitlessFs() { return { openSync:nativeFs.openSync, fstatSync:nativeFs.fstatSync, readSync:nativeFs.readSync, closeSync }; }
test("non-regular input and growing files are rejected before/private during bounded read", () => {
  let read=false,closed=false;const io=capture();assert.equal(runCli(['synthetic'],{...io,referenceMap:MAP,files:{openSync(){return 9;},fstatSync(){return {isFile:()=>false,size:0};},readSync(){read=true;throw Error('PRIVATE');},closeSync(){closed=true;}}}),2);assert.equal(read,false);assert.equal(closed,true);assert(!io.text().includes('PRIVATE'));
  let bytes=0;const grown=capture();assert.equal(runCli(['synthetic'],{...grown,referenceMap:MAP,files:{openSync(){return 9;},fstatSync(){return {isFile:()=>true,size:1};},readSync(fd,buffer,offset,length){buffer.fill(32,offset,offset+length);bytes+=length;return length;},closeSync(){}}}),2);assert.equal(bytes,1024*1024+1);
});
test("repository map distinguishes preparation revision from reviewed production-source revision", () => { assert.equal(MAP.sourceRevision,"face09c57f7de756546e58d092dbe6d280f93c91"); assert.equal(MAP.preparationRevision,"bf55afe287342fce7f994b515532bf170cfa12ae"); assert.equal(MAP.observedRuntimeSchema,false); assert.equal(MAP.mappings.find(m=>m.id==='xml_documents.storage_path').nullable,false); });