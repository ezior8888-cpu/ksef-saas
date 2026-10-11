/**
 * Prepared composition of the closed service-resume coordinator and pinned SSH
 * Docker transports. Factory/import perform no I/O. No CLI, discovery, freeze,
 * credential provisioning, automatic retry, or host setup is provided.
 *
 * The private plan's hostId selects one reviewed host configuration. Every full
 * container ID belongs to exactly one host; routes and SSH configuration are
 * captured before invocation. The boundary observer still has to establish
 * exclusive control and unchanged external controls across all seven writers.
 * A successful synthetic run proves neither real host readiness nor F0 approval.
 */
import { createBackupResumeDockerTransport } from './backup-resume-docker-command.mjs';
import { createBackupWriteResume } from './backup-write-resume.mjs';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = () => { const error = new Error('Invalid backup service resume wiring'); error.code = 'INVALID_SERVICE_RESUME_WIRING'; throw error; };
function capture(value) {
  let nodes = 0;
  const active = new Set();
  function clone(item, depth) {
    if (++nodes > 20000 || depth > 20) fail();
    if (item === null || typeof item === 'boolean' || typeof item === 'string'
      || (typeof item === 'number' && Number.isFinite(item))) return item;
    if (!item || typeof item !== 'object' || active.has(item) || Object.getOwnPropertySymbols(item).length > 0
      || (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype)) fail();
    active.add(item);
    const result = Array.isArray(item) ? [] : {};
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (Array.isArray(item) && key === 'length') continue;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || ['__proto__', 'constructor', 'prototype'].includes(key)) fail();
      result[key] = clone(descriptor.value, depth + 1);
    }
    active.delete(item);
    return result;
  }
  const copied = clone(value, 0);
  if (Buffer.byteLength(JSON.stringify(copied)) > 256 * 1024) fail();
  return copied;
}

/** Returns resumeWrites(request) from createBackupWriteResume.
 * plan.services[].hostId must reference exactly one key in hosts. Each hosts
 * value is {hostname,user,port,identityFile,knownHostsFile}. Optional command is
 * a trusted dependency seam for offline fake SSH tests. Real default transport
 * still requires separately-authorized mode on Linux and resumeWrites consent.
 */
export function createBackupServiceResume(config) {
  if (!record(config) || Object.getPrototypeOf(config) !== Object.prototype || Object.getOwnPropertySymbols(config).length > 0) fail();
  const descriptors = Object.getOwnPropertyDescriptors(config);
  const accepted = ['plan', 'hosts', 'observeBoundary', 'command', 'persist'];
  if (Object.entries(descriptors).some(([key, descriptor]) => !accepted.includes(key) || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))) fail();
  const values = Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
  if (typeof values.observeBoundary !== 'function' || (values.command !== undefined && typeof values.command !== 'function')
    || (values.persist !== undefined && typeof values.persist !== 'function')) fail();
  const plan = capture(values.plan), hosts = capture(values.hosts);
  if (!record(plan) || !record(hosts) || !Array.isArray(plan.services) || plan.services.length < 1 || plan.services.length > 64) fail();
  const idsByHost = new Map(), allIds = new Set();
  for (const service of plan.services) {
    if (!record(service) || !identifier(service.hostId) || !hash(service.held?.containerId) || allIds.has(service.held.containerId)) fail();
    allIds.add(service.held.containerId);
    if (!idsByHost.has(service.hostId)) idsByHost.set(service.hostId, []);
    idsByHost.get(service.hostId).push(service.held.containerId);
  }
  if (Object.keys(hosts).length !== idsByHost.size || [...idsByHost.keys()].some(hostId => !Object.hasOwn(hosts, hostId))) fail();
  const routes = new Map();
  for (const [hostId, containerIds] of idsByHost) {
    const transport = createBackupResumeDockerTransport({ host: hosts[hostId], containerIds, ...(values.command === undefined ? {} : { command: values.command }) });
    for (const containerId of containerIds) routes.set(containerId, transport);
  }
  const transport = Object.fromEntries(['inspect', 'start', 'updateRestartPolicy'].map(operation => [operation, (spec, context) => {
    const target = routes.get(spec?.containerId);
    if (!target) fail();
    return target[operation](spec, context);
  }]));
  return createBackupWriteResume({ plan, transport, observeBoundary: values.observeBoundary, ...(values.persist === undefined ? {} : { persist: values.persist }) });
}
