/**
 * Explicit source-client factory for the prepared backup runner.
 * Import/validation do not construct clients, read environment/config files or
 * connect. Dynamic dependency loading and connections occur only in open().
 * No pg-boss lifecycle, migrations, public credentials, or readiness assertions.
 */
import { Socket } from "node:net";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import { rootCertificates, checkServerIdentity } from "node:tls";

const SOURCE_NAMES = ["application", "supabase"];
const DB_NAMES = ["postgres", "supabase"];
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value, allowed) => record(value) && Object.keys(value).every(key => allowed.includes(key));
const text = (value, max = 65536) => typeof value === "string" && value.length > 0 && value.length <= max && !value.includes("\0");
const integer = (value, max) => Number.isSafeInteger(value) && value > 0 && value <= max;
const loopback = value => value === "127.0.0.1" || value === "::1" || value === "[::1]";
// Only known PostgreSQL query errors are exposed as codes; an arbitrary
// five-character driver string must not become a public diagnostic.
const SAFE_SQL_STATES = new Set(["42501","42601","42P01","42703","42702","42704","42804","42883","42809","42P18",
  "57014","25006","25P02","25001","40001","40P01","22001","22003","22021","22023","23502","23503","23505","23514","0A000","55P03","XX000"]);
const SILENT_LOGGER = Object.freeze({ debug() {}, info() {}, warn() {}, error() {} });
export class BackupSourceClientError extends Error {
  constructor(code, discardClientRequired = false) {
    super("Backup source client operation failed: " + code);
    this.name = "BackupSourceClientError"; this.code = code; this.discardClientRequired = discardClientRequired;
  }
}
const fail = code => { throw new BackupSourceClientError(code); };
function tlsOptions(value, host, protocol) {
  if (!keys(value, ["mode", "caPem"]) || !["verify-full", "loopback-tunnel"].includes(value.mode)) fail("INVALID_SOURCE_TLS");
  if (value.mode === "loopback-tunnel") {
    if (!loopback(host) || value.caPem !== undefined || (protocol && protocol !== "http:")) fail("INVALID_LOOPBACK_TRANSPORT");
    return false;
  }
  if (protocol && protocol !== "https:") fail("TLS_REQUIRED");
  if (value.caPem !== undefined && (!text(value.caPem, 1024 * 1024) || !value.caPem.includes("-----BEGIN CERTIFICATE-----"))) fail("INVALID_SOURCE_CA");
  const expectedHost = host === "[::1]" ? "::1" : host;
  return { rejectUnauthorized: true, minVersion: "TLSv1.2", ca: value.caPem ?? [...rootCertificates],
    checkServerIdentity: (_host, certificate) => checkServerIdentity(expectedHost, certificate) };
}
function parseConfig(config) {
  if (!keys(config, ["database", "s3", "bucketBindings"]) || !keys(config.database, DB_NAMES) || !keys(config.s3, SOURCE_NAMES)) fail("INVALID_SOURCE_CONFIG");
  const database = {}, s3 = {};
  for (const name of DB_NAMES) {
    const value = config.database[name], databaseName = name === "postgres" ? "postgres" : "_supabase";
    if (!keys(value, ["host","port","user","password","databaseName","tls"]) || !text(value.host,253)
      || /[\s/\\]/.test(value.host) || !integer(value.port,65535) || !text(value.user,256)
      || !text(value.password) || value.databaseName !== databaseName) fail("INVALID_DATABASE_SOURCE");
    database[name] = { host:value.host === "[::1]" ? "::1" : value.host, port:value.port, user:value.user, password:value.password, database:databaseName,
      ssl:tlsOptions(value.tls,value.host), transportMode:value.tls.mode };
  }
  for (const name of SOURCE_NAMES) {
    const value = config.s3[name];
    if (!keys(value,["endpoint","region","accessKeyId","secretAccessKey","sessionToken","tls"]) || !text(value.endpoint,4096)
      || !text(value.region,128) || !text(value.accessKeyId,1024) || !text(value.secretAccessKey)
      || (value.sessionToken !== undefined && !text(value.sessionToken))) fail("INVALID_S3_SOURCE");
    let endpoint; try { endpoint = new URL(value.endpoint); } catch { fail("INVALID_S3_ENDPOINT"); }
    if (!["https:","http:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
      || endpoint.pathname !== "/" || !endpoint.hostname) fail("INVALID_S3_ENDPOINT");
    s3[name] = { endpoint:endpoint.origin, region:value.region, tls:tlsOptions(value.tls,endpoint.hostname,endpoint.protocol),
      transportMode:value.tls.mode, credentials:{accessKeyId:value.accessKeyId,secretAccessKey:value.secretAccessKey,
        ...(value.sessionToken === undefined ? {} : {sessionToken:value.sessionToken})} };
  }
  const bindings = config.bucketBindings;
  if (!keys(bindings,["applicationPrimary","applicationBackups"]) || !text(bindings.applicationPrimary,1024)
    || !keys(bindings.applicationBackups,["mode","bucket"]) || !text(bindings.applicationBackups.bucket,1024)
    || !["shared","dedicated"].includes(bindings.applicationBackups.mode)
    || (bindings.applicationBackups.mode === "shared" && bindings.applicationBackups.bucket !== bindings.applicationPrimary)) fail("INVALID_BUCKET_BINDINGS");
  return { database,s3,bucketBindings:{applicationPrimary:bindings.applicationPrimary,applicationBackups:{...bindings.applicationBackups}} };
}
/** Pure structural validation; no transport, credential, tunnel or readiness proof. */
export function validateBackupSourceConfig(config) {
  const parsed = parseConfig(config);
  return { status:"SOURCE_CONFIG_STRUCTURALLY_VALID",databaseCount:2,s3SourceCount:2,
    transportModes:{database:DB_NAMES.map(name=>parsed.database[name].transportMode),s3:SOURCE_NAMES.map(name=>parsed.s3[name].transportMode)},
    endpointsVerified:false,credentialsVerified:false,tunnelVerified:false,sourceAuthenticityVerified:false };
}
function disposeBody(body) {
  try {
    if (typeof body?.destroy === "function") body.destroy();
    else if (typeof body?.cancel === "function") Promise.resolve(body.cancel()).catch(()=>{});
    else if (typeof body?.return === "function") Promise.resolve(body.return()).catch(()=>{});
  } catch { /* No private transport detail escapes cleanup. */ }
}

/**
 * config contains private plain values supplied by the caller; never returned.
 * constructors is an offline test seam, not production config.
 * Caller must inspect close().status; local closure never certifies server stop.
 */
export async function openBackupSourceClients(config, options = {}) {
  const parsed = parseConfig(config);
  if (!keys(options,["signal","constructors","connectTimeoutMs","requestTimeoutMs","closeTimeoutMs"])
    || (options.signal !== undefined && !(options.signal instanceof AbortSignal))) fail("INVALID_CLIENT_OPTIONS");
  const connectTimeoutMs=options.connectTimeoutMs??10000,requestTimeoutMs=options.requestTimeoutMs??10000,closeTimeoutMs=options.closeTimeoutMs??5000;
  if (!integer(connectTimeoutMs,30000)||!integer(requestTimeoutMs,600000)||!integer(closeTimeoutMs,30000)) fail("INVALID_CLIENT_LIMITS");
  if (options.signal?.aborted) fail("SOURCE_ABORTED");
  if (options.constructors !== undefined && (!keys(options.constructors,["PgClient","S3Client"])
    || typeof options.constructors.PgClient !== "function" || typeof options.constructors.S3Client !== "function")) fail("INVALID_CLIENT_CONSTRUCTORS");
  let constructors;
  try {
    const loaded = options.constructors ?? { PgClient:(await import("pg")).Client,S3Client:(await import("@aws-sdk/client-s3")).S3Client };
    constructors = { PgClient: loaded.PgClient, S3Client: loaded.S3Client };
  } catch { fail("SOURCE_DEPENDENCY_UNAVAILABLE"); }
  if (options.signal?.aborted) fail("SOURCE_ABORTED");
  const lifetime=new AbortController(), dbResources=[],s3Resources=[],bodies=new Set();
  let state="OPENING",activeOperations=0,closePromise,openedDatabases=0,s3Created=0;
  const unavailable=()=>state==="CLOSING"||state==="CLOSED"||state==="CLOSE_INCOMPLETE";
  const checkOpen=()=>{if(unavailable()||lifetime.signal.aborted) throw new BackupSourceClientError("SOURCE_CLIENT_CLOSED",true);};
  const status=()=>({state,databaseConnectionsOpened:openedDatabases,s3ClientsCreated:s3Created,activeOperations,
    trackedBodies:bodies.size,remoteOperationsStoppedVerified:false});
  async function close(force = false) {
    if (closePromise) return closePromise;
    state="CLOSING";
    options.signal?.removeEventListener("abort",callerAbort);
    closePromise=Promise.resolve().then(async()=>{
      lifetime.abort();
      let failed=false;
      for(const body of bodies) disposeBody(body);
      bodies.clear();
      for(const resource of s3Resources) {
        try { resource.client?.destroy(); } catch { failed=true; }
        for(const agent of resource.agents) { try { agent.destroy(); } catch { failed=true; } }
      }
      const endings=dbResources.map(async resource=>{
        if(force||resource.busy) { try { resource.socket.destroy(); } catch { failed=true; } }
        let timer;
        try {
          await Promise.race([Promise.resolve().then(()=>resource.client?.end()),
            new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error()),closeTimeoutMs);})]);
        } catch { failed=true; }
        finally {
          clearTimeout(timer);
          // Always discard our raw transport, including incomplete handshakes.
          try { resource.socket.destroy(); } catch { failed=true; }
        }
      });
      await Promise.all(endings);
      state=failed?"CLOSE_INCOMPLETE":"CLOSED";
      return {status:failed?"LOCAL_CLOSE_INCOMPLETE":"LOCAL_CLOSE_COMPLETED",discardClientRequired:failed,
        databaseClientCount:dbResources.length,s3ClientCount:s3Resources.length,remoteOperationsStoppedVerified:false};
    });
    return closePromise;
  }
  const forceClose=()=>{void close(true).catch(()=>{});};
  const callerAbort=()=>forceClose();
  options.signal?.addEventListener("abort",callerAbort,{once:true});
  function bounded(action,{signal,timeoutMs,timeoutCode,abortCode="SOURCE_ABORTED",stop=forceClose}) {
    checkOpen();
    const combined=signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal;
    if(combined.aborted) { stop(); return Promise.reject(new BackupSourceClientError(abortCode,true)); }
    activeOperations++;
    const started = performance.now();
    let timer,onAbort,expired=false;
    const interrupted=new Promise((_,reject)=>{
      const halt=code=>{expired=true;reject(new BackupSourceClientError(code,true));stop();};
      timer=setTimeout(()=>halt(timeoutCode),timeoutMs);
      onAbort=()=>halt(abortCode);
      combined.addEventListener("abort",onAbort,{once:true});
    });
    const operation=Promise.resolve().then(()=>{if(expired||combined.aborted)throw new BackupSourceClientError(abortCode,true);return action(combined);});
    return Promise.race([operation,interrupted]).then(value=>{
      if(expired||combined.aborted||performance.now()-started>=timeoutMs){
        const code=combined.aborted?abortCode:timeoutCode;stop();throw new BackupSourceClientError(code,true);
      }
      return value;
    }).finally(()=>{
      activeOperations--;clearTimeout(timer);combined.removeEventListener("abort",onAbort);
    });
  }
  try {
    const database={bucketBindings:Object.freeze({applicationPrimary:parsed.bucketBindings.applicationPrimary,
      applicationBackups:Object.freeze(parsed.bucketBindings.applicationBackups)})},s3={};
    for(const name of DB_NAMES) {
      checkOpen();
      const source=parsed.database[name],socket=new Socket(),resource={socket,client:null,busy:false};
      dbResources.push(resource);
      const native=new constructors.PgClient({
        host:source.host,port:source.port,user:source.user,password:source.password,database:source.database,ssl:source.ssl,
        stream:socket,pipeline:false,sslnegotiation:"postgres",replication:"false",client_encoding:"UTF8",binary:false,
        application_name:"faktflow-backup-references",fallback_application_name:"faktflow-backup-references",
        options:"-c default_transaction_read_only=on -c row_security=off -c search_path=pg_catalog -c client_encoding=UTF8",
        connectionTimeoutMillis:connectTimeoutMs,statement_timeout:requestTimeoutMs,query_timeout:requestTimeoutMs,
        lock_timeout:requestTimeoutMs,idle_in_transaction_session_timeout:300000,
        keepAlive:true,keepAliveInitialDelayMillis:1000,enableChannelBinding:true
      });
      resource.client=native;
      // An idle socket error must not become an unhandled EventEmitter error.
      native.on("error",()=>{if(!unavailable())forceClose();});
      resource.busy=true;
      try { await bounded(()=>native.connect(),{timeoutMs:connectTimeoutMs,timeoutCode:"DATABASE_CONNECT_TIMEOUT"}); }
      finally {resource.busy=false;}
      checkOpen();openedDatabases++;
      const wrapper=Object.freeze({async query(query) {
        checkOpen();
        if(!keys(query,["text","values","query_timeout","signal"])||!text(query.text,65536)||!Array.isArray(query.values)
          ||(query.signal!==undefined&&!(query.signal instanceof AbortSignal))
          ||(query.query_timeout!==undefined&&!integer(query.query_timeout,600000))) fail("INVALID_SOURCE_QUERY");
        if(resource.busy) fail("CONCURRENT_DATABASE_QUERY");
        const timeout=Math.min(query.query_timeout??requestTimeoutMs,requestTimeoutMs);resource.busy=true;
        try {
          return await bounded(()=>native.query({text:query.text,values:query.values,query_timeout:timeout}),
            {signal:query.signal,timeoutMs:timeout,timeoutCode:"DATABASE_QUERY_TIMEOUT"});
        } catch(error) {
          if(error instanceof BackupSourceClientError)throw error;
          if(SAFE_SQL_STATES.has(error?.code))throw new BackupSourceClientError(error.code);
          forceClose();throw new BackupSourceClientError("DATABASE_QUERY_FAILED",true);
        } finally {resource.busy=false;}
      }});
      database[name==="postgres"?"client":"supabaseClient"]=wrapper;
    }
    for(const name of SOURCE_NAMES) {
      checkOpen();
      const source=parsed.s3[name],httpAgent=new HttpAgent({keepAlive:true,maxSockets:2}),
        httpsAgent=new HttpsAgent({keepAlive:true,maxSockets:2,...(source.tls||{rejectUnauthorized:true,ca:[...rootCertificates]})}),
        resource={client:null,agents:[httpAgent,httpsAgent]};
      s3Resources.push(resource);
      const native=new constructors.S3Client({
        endpoint:source.endpoint,region:source.region,credentials:source.credentials,forcePathStyle:true,maxAttempts:1,
        retryMode:"standard",defaultsMode:"standard",useArnRegion:false,useAccelerateEndpoint:false,useDualstackEndpoint:false,
        useFipsEndpoint:false,followRegionRedirects:false,disableS3ExpressSessionAuth:true,disableMultiregionAccessPoints:true,
        ignoreConfiguredEndpointUrls:true,endpointDiscoveryEnabled:false,authSchemePreference:["aws.auth#sigv4"],
        sigv4aSigningRegionSet:[],userAgentAppId:"faktflow-backup",logger:SILENT_LOGGER,
        requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED",
        credentialDefaultProvider:()=>async()=>{throw new BackupSourceClientError("AMBIENT_CREDENTIALS_DISABLED");},
        requestHandler:{httpAgent,httpsAgent,connectionTimeout:connectTimeoutMs,requestTimeout:requestTimeoutMs,
          socketTimeout:requestTimeoutMs,throwOnRequestTimeout:true,logger:SILENT_LOGGER}
      });
      resource.client=native;s3Created++;
      s3[name]=Object.freeze({async send(command,sendOptions={}) {
        checkOpen();
        if(!keys(sendOptions,["abortSignal"])||(sendOptions.abortSignal!==undefined&&!(sendOptions.abortSignal instanceof AbortSignal)))fail("INVALID_SOURCE_SEND_OPTIONS");
        let delivered=false;
        const trackResponse=response=>{
          if(response?.Body) {
            if(unavailable()||lifetime.signal.aborted||sendOptions.abortSignal?.aborted){disposeBody(response.Body);throw new BackupSourceClientError("SOURCE_ABORTED",true);}
            bodies.add(response.Body);
            const remove=()=>bodies.delete(response.Body);
            response.Body.once?.("close",remove);response.Body.once?.("end",remove);response.Body.once?.("error",remove);
          }
          return response;
        };
        try {
          const response=await bounded(async abortSignal=>{
            const value=await native.send(command,{abortSignal});
            // A late resolution after stop must never leak an unused Body.
            if(unavailable()||abortSignal.aborted){disposeBody(value?.Body);throw new BackupSourceClientError("SOURCE_ABORTED",true);}
            return trackResponse(value);
          },{signal:sendOptions.abortSignal,timeoutMs:requestTimeoutMs,timeoutCode:"S3_REQUEST_TIMEOUT"});
          delivered=true;return response;
        } catch(error) {
          if(error instanceof BackupSourceClientError)throw error;
          // Only precise absence classifications may reach the S3 exporter.
          const allowed=["NoSuchBucketPolicy","NoSuchTagSet","NoSuchLifecycleConfiguration","ServerSideEncryptionConfigurationNotFoundError",
            "ObjectLockConfigurationNotFoundError","ReplicationConfigurationNotFoundError"];
          if(allowed.includes(error?.name)&&[undefined,404].includes(error?.$metadata?.httpStatusCode)) {
            const safe=new BackupSourceClientError("S3_CONFIGURATION_ABSENT");safe.name=error.name;safe.$metadata={httpStatusCode:404};throw safe;
          }
          forceClose();throw new BackupSourceClientError("S3_REQUEST_FAILED",true);
        } finally {if(!delivered&&lifetime.signal.aborted)for(const body of bodies)disposeBody(body);}
      }});
    }
    checkOpen();state="OPEN";
    return Object.freeze({database:Object.freeze(database),s3:Object.freeze(s3),close:()=>close(false),status});
  } catch(error) {
    const closing=await close(true);
    if(error instanceof BackupSourceClientError)throw new BackupSourceClientError(error.code,error.discardClientRequired||closing.discardClientRequired);
    throw new BackupSourceClientError("SOURCE_CLIENT_OPEN_FAILED",closing.discardClientRequired);
  }
}
