import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import test from "node:test";
import { openBackupSourceClients, validateBackupSourceConfig, BackupSourceClientError } from "./backup-source-clients.mjs";

function config() {
  const db=databaseName=>({host:"127.0.0.1",port:55432,user:"synthetic-user",password:"PRIVATE_DB_PASSWORD",databaseName,tls:{mode:"loopback-tunnel"}});
  const s3=()=>({endpoint:"http://127.0.0.1:59000",region:"synthetic-region",accessKeyId:"PRIVATE_ACCESS",secretAccessKey:"PRIVATE_SECRET",tls:{mode:"loopback-tunnel"}});
  return {database:{postgres:db("postgres"),supabase:db("_supabase")},s3:{application:s3(),supabase:s3()},
    bucketBindings:{applicationPrimary:"synthetic-primary",applicationBackups:{mode:"shared",bucket:"synthetic-primary"}}};
}
function fakes({connect,query,end,send,destroy}={}) {
  const databases=[],s3s=[];
  class PgClient extends EventEmitter {
    constructor(options) {super();this.config=options;this.connectCalls=0;this.endCalls=0;this.queries=[];databases.push(this);}
    async connect() {this.connectCalls++;return connect?.(this,databases.length);}
    async query(q) {this.queries.push(q);return query ? query(this,q) : {rows:[]};}
    async end() {this.endCalls++;return end?.(this);}
  }
  class S3Client {
    constructor(options) {this.config=options;this.destroyCalls=0;this.calls=[];s3s.push(this);}
    async send(command,options) {this.calls.push({command,options});return send ? send(this,command,options):{};}
    destroy() {this.destroyCalls++;destroy?.(this);}
  }
  return {constructors:{PgClient,S3Client},databases,s3s};
}
const options=f=>({constructors:f.constructors,connectTimeoutMs:50,requestTimeoutMs:50,closeTimeoutMs:20});
const q={text:"SELECT 1",values:[],query_timeout:50};

test("validation is inert and returns structural status with every verification claim false",()=>{
  const c=config(),before=JSON.stringify(c),report=validateBackupSourceConfig(c);
  assert.equal(report.status,"SOURCE_CONFIG_STRUCTURALLY_VALID");
  for(const name of ["endpointsVerified","credentialsVerified","tunnelVerified","sourceAuthenticityVerified"])assert.equal(report[name],false);
  assert.equal(JSON.stringify(c),before);assert(!JSON.stringify(report).includes("PRIVATE"));
});
test("explicit config rejects inferred DB name, empty secrets, ambiguous TLS and remote plaintext",()=>{
  const changes=[
    c=>{c.database.postgres.databaseName="guessed";},
    c=>{c.database.postgres.password="";},
    c=>{delete c.database.postgres.host;},
    c=>{c.database.postgres.host="remote.invalid";},
    c=>{c.s3.application.endpoint="http://remote.invalid:9000";},
    c=>{c.s3.application.endpoint="http://localhost:9000";},
    c=>{c.s3.application.endpoint="https://PRIVATE_SECRET@remote.invalid";},
    c=>{c.s3.application.endpoint="http://127.0.0.1:9000/bucket";},
    c=>{c.s3.application.tls={mode:"verify-full",caPem:"PRIVATE_INVALID_CA"};},
    c=>{c.database.postgres.tls={mode:"verify-full",rejectUnauthorized:false};},
    c=>{c.s3.application.credentials=()=>({});},
    c=>{c.bucketBindings.applicationBackups.bucket="wrong";}
  ];
  for(const change of changes){const c=config();change(c);assert.throws(()=>validateBackupSourceConfig(c),e=>e instanceof BackupSourceClientError&&!e.message.includes("PRIVATE"));}
});
test("validated remote HTTPS/TLS config uses required certificate verification",async()=>{
  const c=config(),f=fakes();
  for(const db of Object.values(c.database)){db.host="synthetic-db.invalid";db.tls={mode:"verify-full"};}
  for(const source of Object.values(c.s3)){source.endpoint="https://synthetic-s3.invalid";source.tls={mode:"verify-full"};}
  const bundle=await openBackupSourceClients(c,options(f));
  try{
    for(const db of f.databases){assert.equal(db.config.ssl.rejectUnauthorized,true);assert.equal(db.config.ssl.minVersion,"TLSv1.2");assert(Array.isArray(db.config.ssl.ca));}
    for(const s3 of f.s3s){assert.equal(s3.config.requestHandler.httpsAgent.options.rejectUnauthorized,true);assert.equal(s3.config.requestHandler.httpsAgent.options.minVersion,"TLSv1.2");}
  }finally{await bundle.close();}
});
test("opening uses dedicated clients, fixed read-only startup and explicit S3 config without provider chains",async()=>{
  const f=fakes(),bundle=await openBackupSourceClients(config(),options(f));
  try{
    assert.deepEqual(f.databases.map(d=>d.config.database),["postgres","_supabase"]);
    for(const db of f.databases){
      assert.equal(db.connectCalls,1);assert.equal(db.config.pipeline,false);assert.equal(db.config.ssl,false);
      assert.equal(db.config.replication,"false");assert.equal(db.config.sslnegotiation,"postgres");
      assert.match(db.config.options,/default_transaction_read_only=on/);assert.match(db.config.options,/row_security=off/);
      assert.equal(db.config.client_encoding,"UTF8");assert.equal(db.config.application_name,"faktflow-backup-references");
      assert.equal(db.config.password,"PRIVATE_DB_PASSWORD");assert(db.config.stream);
    }
    for(const s3 of f.s3s){
      assert.equal(s3.config.maxAttempts,1);assert.equal(s3.config.forcePathStyle,true);assert.equal(s3.config.followRegionRedirects,false);
      assert.equal(s3.config.requestHandler.throwOnRequestTimeout,true);assert.equal(s3.config.useFipsEndpoint,false);assert.equal(s3.config.useDualstackEndpoint,false);
      assert.equal(s3.config.ignoreConfiguredEndpointUrls,true);assert.equal(s3.config.disableS3ExpressSessionAuth,true);
      assert.equal(s3.config.credentials.accessKeyId,"PRIVATE_ACCESS");assert.equal(s3.config.credentials.secretAccessKey,"PRIVATE_SECRET");
      await assert.rejects(s3.config.credentialDefaultProvider()(),{code:"AMBIENT_CREDENTIALS_DISABLED"});
    }
    assert.equal(bundle.status().state,"OPEN");assert.equal(bundle.status().remoteOperationsStoppedVerified,false);
  }finally{await bundle.close();}
});
test("config is captured as owned values and status never includes private endpoints or credentials",async()=>{
  const c=config(),f=fakes(),bundle=await openBackupSourceClients(c,options(f));
  try{
    c.database.postgres.password="changed";c.s3.application.accessKeyId="changed";c.bucketBindings.applicationBackups.bucket="changed";
    assert.equal(f.databases[0].config.password,"PRIVATE_DB_PASSWORD");assert.equal(f.s3s[0].config.credentials.accessKeyId,"PRIVATE_ACCESS");
    assert.equal(bundle.database.bucketBindings.applicationBackups.bucket,"synthetic-primary");
    const status=JSON.stringify(bundle.status());for(const value of ["PRIVATE","127.0.0.1","synthetic-user","synthetic-primary"])assert(!status.includes(value));
  }finally{await bundle.close();}
});
test("pre-abort and invalid options never construct clients",async()=>{
  const f=fakes();
  await assert.rejects(openBackupSourceClients(config(),{...options(f),signal:AbortSignal.abort()}),{code:"SOURCE_ABORTED"});
  await assert.rejects(openBackupSourceClients(config(),{...options(f),requestTimeoutMs:0}),{code:"INVALID_CLIENT_LIMITS"});
  assert.equal(f.databases.length,0);assert.equal(f.s3s.length,0);
});
test("failed second connection closes all constructed clients and hides native details",async()=>{
  const f=fakes({connect:(_db,index)=>{if(index===2)throw new Error("PRIVATE_HOST PRIVATE_PASSWORD");}});
  await assert.rejects(openBackupSourceClients(config(),options(f)),e=>e.code==="SOURCE_CLIENT_OPEN_FAILED"&&!e.message.includes("PRIVATE"));
  assert.equal(f.databases.length,2);assert(f.databases.every(d=>d.endCalls===1&&d.config.stream.destroyed));assert.equal(f.s3s.length,0);
});
test("connection watchdog closes the raw socket even when driver promise never settles",async()=>{
  const f=fakes({connect:()=>new Promise(()=>{})});
  await assert.rejects(openBackupSourceClients(config(),{...options(f),connectTimeoutMs:10}),e=>e.code==="DATABASE_CONNECT_TIMEOUT"&&e.discardClientRequired);
  assert.equal(f.databases[0].endCalls,1);assert.equal(f.databases[0].config.stream.destroyed,true);
});
test("caller abort during connect prevents remaining clients and destroys current transport",async()=>{
  const controller=new AbortController(),f=fakes({connect:()=>{controller.abort();return new Promise(()=>{});}});
  await assert.rejects(openBackupSourceClients(config(),{...options(f),signal:controller.signal}),e=>e.code==="SOURCE_ABORTED"&&e.discardClientRequired);
  assert.equal(f.databases.length,1);assert.equal(f.s3s.length,0);assert(f.databases[0].config.stream.destroyed);
});
test("per-query AbortSignal reaches wrapper but never the native query config",async()=>{
  const f=fakes(),bundle=await openBackupSourceClients(config(),options(f));
  try{await bundle.database.client.query({...q,signal:new AbortController().signal});assert.equal(Object.hasOwn(f.databases[0].queries[0],"signal"),false);}
  finally{await bundle.close();}
});
test("per-query abort force-closes both DB connections without late requests",async()=>{
  const controller=new AbortController(),f=fakes({query:()=>{controller.abort();return new Promise(()=>{});}});
  const bundle=await openBackupSourceClients(config(),options(f));
  await assert.rejects(bundle.database.client.query({...q,signal:controller.signal}),e=>e.code==="SOURCE_ABORTED"&&e.discardClientRequired);
  await bundle.close();assert(f.databases.every(d=>d.endCalls===1&&d.config.stream.destroyed));
  await assert.rejects(bundle.database.supabaseClient.query(q),{code:"SOURCE_CLIENT_CLOSED"});
});
test("native query timeout is bounded and uncertain client cannot be reused",async()=>{
  const f=fakes({query:()=>new Promise(()=>{})}),bundle=await openBackupSourceClients(config(),options(f));
  await assert.rejects(bundle.database.client.query({...q,query_timeout:10}),e=>e.code==="DATABASE_QUERY_TIMEOUT"&&e.discardClientRequired);
  await bundle.close();assert.equal(bundle.status().state,"CLOSED");assert(f.databases.every(d=>d.config.stream.destroyed));
});
test("SQLSTATE is retained without native private message so the extractor may rollback",async()=>{
  let first=true;const f=fakes({query:()=>{if(first){first=false;throw Object.assign(new Error("PRIVATE ROW AND KEY"),{code:"42501"});}return{rows:[]};}});
  const bundle=await openBackupSourceClients(config(),options(f));
  try{
    await assert.rejects(bundle.database.client.query(q),e=>e.code==="42501"&&!e.discardClientRequired&&!e.message.includes("PRIVATE"));
    await bundle.database.client.query({text:"ROLLBACK",values:[]});assert.equal(bundle.status().state,"OPEN");
  }finally{await bundle.close();}
});
test("unknown driver failure shuts down the bundle and is redacted",async()=>{
  const f=fakes({query:()=>{throw new Error("PRIVATE_QUERY");}}),bundle=await openBackupSourceClients(config(),options(f));
  await assert.rejects(bundle.database.client.query(q),e=>e.code==="DATABASE_QUERY_FAILED"&&e.discardClientRequired&&!e.message.includes("PRIVATE"));
  await bundle.close();assert.equal(f.s3s[0].destroyCalls,1);
});
test("concurrent use of a dedicated DB client is refused",async()=>{
  let resolve;const f=fakes({query:()=>new Promise(done=>{resolve=done;})}),bundle=await openBackupSourceClients(config(),options(f));
  try{
    const first=bundle.database.client.query(q);await new Promise(done=>setImmediate(done));
    await assert.rejects(bundle.database.client.query(q),{code:"CONCURRENT_DATABASE_QUERY"});
    resolve({rows:[]});await first;
  }finally{await bundle.close();}
});
test("S3 wrapper forwards cancellation and disposes late response body after timeout",async()=>{
  let resolve,signal;const f=fakes({send:(_client,_command,opts)=>{signal=opts.abortSignal;return new Promise(done=>{resolve=done;});}});
  const bundle=await openBackupSourceClients(config(),{...options(f),requestTimeoutMs:10});
  await assert.rejects(bundle.s3.application.send({}),e=>e.code==="S3_REQUEST_TIMEOUT"&&e.discardClientRequired);
  assert.equal(signal.aborted,true);await bundle.close();
  const body=new Readable({read(){}});resolve({Body:body});await new Promise(done=>setImmediate(done));assert(body.destroyed);
});
test("S3 per-request abort closes bundle and late Body cannot escape cleanup",async()=>{
  const controller=new AbortController();let resolve;
  const f=fakes({send:()=>{controller.abort();return new Promise(done=>{resolve=done;});}});
  const bundle=await openBackupSourceClients(config(),options(f));
  await assert.rejects(bundle.s3.application.send({}, {abortSignal:controller.signal}),e=>e.code==="SOURCE_ABORTED"&&e.discardClientRequired);
  await bundle.close();const body=new Readable({read(){}});resolve({Body:body});await new Promise(done=>setImmediate(done));assert(body.destroyed);
});
test("S3 precise absent-config classifications survive sanitization; access denied does not",async()=>{
  let absence=true;const f=fakes({send:()=>{throw Object.assign(new Error("PRIVATE_BUCKET"),{name:absence?"NoSuchBucketPolicy":"AccessDenied",$metadata:{httpStatusCode:absence?404:403}});}});
  const bundle=await openBackupSourceClients(config(),options(f));
  await assert.rejects(bundle.s3.application.send({}),e=>e.name==="NoSuchBucketPolicy"&&e.$metadata.httpStatusCode===404&&!e.message.includes("PRIVATE"));
  assert.equal(bundle.status().state,"OPEN");absence=false;
  await assert.rejects(bundle.s3.application.send({}),e=>e.code==="S3_REQUEST_FAILED"&&e.discardClientRequired&&!e.message.includes("PRIVATE"));
  await bundle.close();
});
test("close disposes active S3 Body, clients and agents once and refuses later requests",async()=>{
  const body=new Readable({read(){}}),f=fakes({send:()=>({Body:body})}),bundle=await openBackupSourceClients(config(),options(f));
  await bundle.s3.application.send({});assert.equal(bundle.status().trackedBodies,1);
  const closed=await bundle.close();const again=await bundle.close();
  assert.deepEqual(closed,again);assert.equal(closed.status,"LOCAL_CLOSE_COMPLETED");assert.equal(closed.remoteOperationsStoppedVerified,false);
  assert(body.destroyed);assert(f.databases.every(d=>d.endCalls===1));assert(f.s3s.every(s=>s.destroyCalls===1));
  await assert.rejects(bundle.s3.supabase.send({}),{code:"SOURCE_CLIENT_CLOSED"});
});
test("close is bounded and reports unresolved local teardown without claiming server stop",async()=>{
  const f=fakes({end:()=>new Promise(()=>{})}),bundle=await openBackupSourceClients(config(),{...options(f),closeTimeoutMs:10});
  const closed=await bundle.close();
  assert.equal(closed.status,"LOCAL_CLOSE_INCOMPLETE");assert.equal(closed.discardClientRequired,true);assert.equal(closed.remoteOperationsStoppedVerified,false);
  assert(f.databases.every(d=>d.config.stream.destroyed));assert.equal(bundle.status().state,"CLOSE_INCOMPLETE");
});
test("idle native error cannot become unhandled and closes all owned resources",async()=>{
  const f=fakes(),bundle=await openBackupSourceClients(config(),options(f));
  assert.doesNotThrow(()=>f.databases[0].emit("error",new Error("PRIVATE_IDLE_ERROR")));
  await bundle.close();assert.equal(bundle.status().state,"CLOSED");
});

test("TLS identity checks the configured authority, including IP hosts, instead of a caller substitute",async()=>{
  const c=config(),f=fakes();
  c.database.postgres.host="192.0.2.10";c.database.postgres.tls={mode:"verify-full"};
  c.s3.application.endpoint="https://synthetic-s3.invalid";c.s3.application.tls={mode:"verify-full"};
  const bundle=await openBackupSourceClients(c,options(f));
  try{
    const pgCheck=f.databases[0].config.ssl.checkServerIdentity;
    assert.equal(pgCheck("attacker.invalid",{subjectaltname:"IP Address:192.0.2.10"}),undefined);
    assert(pgCheck("attacker.invalid",{subjectaltname:"DNS:attacker.invalid"}) instanceof Error);
    const s3Check=f.s3s[0].config.requestHandler.httpsAgent.options.checkServerIdentity;
    assert.equal(s3Check("attacker.invalid",{subjectaltname:"DNS:synthetic-s3.invalid"}),undefined);
    assert(s3Check("attacker.invalid",{subjectaltname:"DNS:attacker.invalid"}) instanceof Error);
    assert.equal((await bundle.close()).discardClientRequired,false);
  }finally{await bundle.close();}
});

test("an arbitrary five-character driver code is not exposed as a known SQLSTATE",async()=>{
  const f=fakes({query:()=>{throw Object.assign(new Error("PRIVATE_VALUE"),{code:"TOKEN"});}});
  const bundle=await openBackupSourceClients(config(),options(f));
  await assert.rejects(bundle.database.client.query(q),error=>error.code==="DATABASE_QUERY_FAILED"&&error.discardClientRequired
    &&!error.message.includes("TOKEN")&&!error.message.includes("PRIVATE"));
  await bundle.close();
});

test("a query response after elapsed deadline cannot win before the timer callback",async()=>{
  const f=fakes({query:()=>{const deadline=performance.now()+20;while(performance.now()<deadline){}return{rows:[]};}});
  const bundle=await openBackupSourceClients(config(),options(f));
  await assert.rejects(bundle.database.client.query({...q,query_timeout:10}),error=>error.code==="DATABASE_QUERY_TIMEOUT"&&error.discardClientRequired);
  await bundle.close();
});
