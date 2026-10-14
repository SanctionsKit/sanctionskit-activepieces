const test = require('node:test');
const assert = require('node:assert/strict');
const nock = require('nock');
const https = require('node:https');
const { sanctionskit } = require(process.env.SK_PIECE_PATH || '../bundle');
const fixtures = require('./fixtures/results.json');
const origin = 'https://www.sanctionskit.com';
const fake = 'sk_test_SYNTHETIC_NONFUNCTIONAL';
const input = { environment:'sandbox',operationId:'fixture-event-001',name:'Alex Morgan',entityType:'person',coverageMode:'package',package:'sandbox@1',retention:'standard' };
const clone = value => JSON.parse(JSON.stringify(value));
const action = sanctionskit.getAction('screen_subject');
const retrieval = sanctionskit.getAction('retrieve_result');
const context = (propsValue,key=fake) => ({auth:{type:'SECRET_TEXT',secret_text:key},propsValue});
const screening = () => clone(fixtures.screen_recorded_potential_match);
const retained = () => clone(fixtures.retained_recorded_retained);
test.before(() => nock.disableNetConnect());
test.afterEach(() => { const pending=nock.pendingMocks(); nock.cleanAll(); assert.deepEqual(pending,[]); });
test.after(() => nock.enableNetConnect());
test('actual framework exposes exactly two authenticated actions', () => {
 assert.deepEqual(Object.keys(sanctionskit.actions()),['screen_subject','retrieve_result']);assert.deepEqual(sanctionskit.triggers(),{});
 assert.equal(sanctionskit.minimumSupportedRelease,'0.82.0');
 assert.equal(sanctionskit.auth.type,'SECRET_TEXT');assert.equal(sanctionskit.auth.validate,undefined);
 for(const a of [action,retrieval]) {assert.equal(a.requireAuth,true);assert.deepEqual(a.errorHandlingOptions,{retryOnFailure:{defaultValue:false,hide:true},continueOnFailure:{defaultValue:false,hide:true}});}
});
test('screen passes exact explicit coverage and idempotency and returns full evidence',async()=>{
 const data=screening();nock(origin,{reqheaders:{authorization:`Bearer ${fake}`,'idempotency-key':input.operationId,'accept-encoding':'identity'}}).post('/api/v1/screenings',{subject:{name:'Alex Morgan',entityType:'person'},retention:'standard',package:'sandbox@1'}).reply(201,data);
 const value=await action.run(context(input));assert.deepEqual(value,{...data,operationId:input.operationId,synthetic:true});assert.ok(!JSON.stringify(value).includes(fake));
});
test('deliberate replay preserves caller operation ID and exact body',async()=>{
 const bodies=[];nock(origin,{reqheaders:{'idempotency-key':input.operationId}}).post('/api/v1/screenings',body=>{bodies.push(body);return true;}).twice().reply(201,screening());
 await action.run(context(input));await action.run(context(input));assert.deepEqual(bodies[0],bodies[1]);
});
test('explicit TLS verification and unchanged process TLS configuration',async()=>{
 const before=process.env.NODE_TLS_REJECT_UNAUTHORIZED, original=https.request, seen=[];
 https.request=function(url,options,callback){seen.push(options);return original.call(this,url,options,callback);};
 try{nock(origin).post('/api/v1/screenings').reply(201,screening());await action.run(context(input));assert.equal(seen[0].rejectUnauthorized,true);assert.equal(seen[0].agent.options.rejectUnauthorized,true);assert.deepEqual(seen[0].agent.options.proxyEnv,{});assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED,before);}finally{https.request=original;}
});
for(const change of [{environment:''},{environment:'production'},{coverageMode:''},{package:''},{sourceIds:'source-a'},{retention:''},{name:'a'},{entityType:'bad'},{birthDate:'1984-02-31'},{birthDate:'0000'},{country:'X'},{identifiers:[{type:'passport'}]},{identifiers:null},{operationId:'short'},{operationId:'bad space here'},{policyId:'bad'},{policyVersion:2},{coverageMode:'sources',package:'',sourceIds:'a,a'}])test(`invalid input before network ${JSON.stringify(change)}`,async()=>{await assert.rejects(action.run(context({...input,...change})));});
for(const key of ['sk_live_SYNTHETIC_NONFUNCTIONAL','sk_test_','sk_test_WITH SPACE'])test(`key environment format ${key}`,async()=>{await assert.rejects(action.run(context(input,key)));});
for(const date of ['1984','1984-02','1984-02-29'])test(`date precision ${date}`,async()=>{nock(origin).post('/api/v1/screenings',body=>body.subject.birthDate===date).reply(201,screening());await action.run(context({...input,birthDate:date}));});
test('production explicit sources and approved exact policy pass unchanged',async()=>{
 const data=screening();data.data.environment='production';data.data.coverage[0].sourceId='source-a';
 const props={...input,environment:'production',coverageMode:'sources',package:'',sourceIds:'source-a',policyId:data.data.policySnapshot.id,policyVersion:data.data.policySnapshot.version,identifiers:[{type:'passport',value:'DEMO-001'}]};
 nock(origin).post('/api/v1/screenings',body=>body.sources.length===1&&body.sources[0]==='source-a'&&!('package'in body)&&body.policy.version===props.policyVersion).reply(201,data);
 assert.equal((await action.run(context(props,'sk_live_SYNTHETIC_NONFUNCTIONAL'))).synthetic,false);
});
for(const [status,code]of [[401,'invalid_api_key'],[403,'insufficient_scope'],[409,'idempotency_conflict'],[422,'screening_policy_changed'],[429,'usage_cap_reached'],[429,'rate_limited'],[500,'internal_error'],[503,'coverage_unavailable']])test(`HTTP${status}:${code} no retry/leak`,async()=>{
 nock(origin).post('/api/v1/screenings').reply(status,{error:{code,message:`${fake} Alex Morgan SECRET_PROVIDER_BODY`}});
 await assert.rejects(action.run(context(input)),e=>{assert.ok(e.message.includes(code));for(const s of[fake,'Alex Morgan','SECRET_PROVIDER_BODY'])assert.ok(!e.message.includes(s));return true;});
});
for(const [label,mutate]of [['environment',d=>d.environment='production'],['status',d=>d.status='no_match'],['stale',d=>d.coverage[0].fresh=false],['coverage',d=>d.coverage=[]],['package',d=>d.versions.package='other@1'],['disclaimer',d=>delete d.disclaimer]])test(`invalid success ${label}`,async()=>{const data=screening();mutate(data.data);nock(origin).post('/api/v1/screenings').reply(201,data);await assert.rejects(action.run(context(input)));});
for(const raw of ['{"data":NaN}','{"data":1e999}','{"data":{},"data":{}}','{"data":{"x":1,"\\u0078":2}}','{"data":{},}','{/*comment*/"data":{}}','<html>unavailable</html>'])test(`strict JSON ${raw}`,async()=>{nock(origin).post('/api/v1/screenings').reply(201,raw);await assert.rejects(action.run(context(input)),/Invalid response JSON/);});
test('same keys across objects valid; nesting bound rejects',async()=>{const data=screening();data.a={x:1};data.b={x:2};nock(origin).post('/api/v1/screenings').reply(201,data);await action.run(context(input));nock(origin).post('/api/v1/screenings').reply(201,'['.repeat(65)+'0'+']'.repeat(65));await assert.rejects(action.run(context(input)),/Invalid response JSON/);});
test('redirect is not followed',async()=>{nock(origin).post('/api/v1/screenings').reply(302,'{}',{location:'https://untrusted.example/steal'});await assert.rejects(action.run(context(input)),/HTTP 302/);});
test('compressed response rejected',async()=>{nock(origin).post('/api/v1/screenings').reply(201,'{}',{'Content-Encoding':'gzip'});await assert.rejects(action.run(context(input)),/encoding/);});
test('8MiB bound enforced before partial result',async()=>{nock(origin).post('/api/v1/screenings').reply(201,'x'.repeat(8*1024*1024+1));await assert.rejects(action.run(context(input)),/8 MiB/);});
test('transport errors sanitized without retry',async()=>{nock(origin).post('/api/v1/screenings').replyWithError(`${fake} Alex Morgan SECRET_ERROR`);await assert.rejects(action.run(context(input)),e=>!e.message.includes(fake)&&!e.message.includes('Alex Morgan')&&/unconfirmed/.test(e.message));});
test('retrieve historical null subject/reference and stale snapshot preserved',async()=>{const data=retained();data.data.subject=null;data.data.reference=null;data.data.coverage[0].fresh=false;nock(origin).get(`/api/v1/results/${data.data.id}`).reply(200,data);assert.deepEqual(await retrieval.run(context({environment:'sandbox',id:data.data.id})),{...data,synthetic:true,historicalEvidence:true});});
for(const[status,code]of [[404,'not_found'],[410,'result_expired'],[403,'insufficient_scope']])test(`retrieve${status} not clearance`,async()=>{const id=retained().data.id;nock(origin).get(`/api/v1/results/${id}`).reply(status,{error:{code,message:'SECRET_RETAINED_BODY'}});await assert.rejects(retrieval.run(context({environment:'sandbox',id})),e=>e.message.includes(code)&&!e.message.includes('SECRET_RETAINED_BODY'));});
for(const mode of ['id','subject','reference'])test(`retrieve mismatch/missing ${mode}`,async()=>{const data=retained(),id=data.data.id;if(mode==='id')data.data.id='00000000-0000-4000-8000-000000000099';else delete data.data[mode];nock(origin).get(`/api/v1/results/${id}`).reply(200,data);await assert.rejects(retrieval.run(context({environment:'sandbox',id})));});
test('invalid result UUID is never an arbitrary URL',async()=>{await assert.rejects(retrieval.run(context({environment:'sandbox',id:'../secret?url=https://evil.example'})),/UUID/);});
for(const field of ['name','entityType','retention','operationId'])test(`missing explicit field ${field} rejects before dispatch`,async()=>{const p={...input};delete p[field];await assert.rejects(action.run(context(p)));});
test('no-match response stays scoped and retains disclaimer',async()=>{const d=clone(fixtures.screen_recorded_no_match);nock(origin).post('/api/v1/screenings').reply(201,d);assert.deepEqual((await action.run(context(input))).data,d.data);});
test('nullable name assessment and historical absent optional fields stay unchanged',async()=>{const d=screening();d.data.matches[0].assessment.name=null;delete d.data.matching;delete d.data.warnings;nock(origin).post('/api/v1/screenings').reply(201,d);assert.deepEqual((await action.run(context(input))).data,d.data);});
test('production policy with package is rejected before dispatch',async()=>{await assert.rejects(action.run(context({...input,environment:'production',package:'example@1',policyId:'00000000-0000-4000-8000-000000000001',policyVersion:1},'sk_live_SYNTHETIC_NONFUNCTIONAL')),/source IDs/);});
for(const kind of ['source','policy'])test(`response ${kind} selection mismatch rejects`,async()=>{const d=screening();d.data.environment='production';d.data.coverage[0].sourceId='source-a';const p={...input,environment:'production',coverageMode:'sources',package:'',sourceIds:'source-a',policyId:d.data.policySnapshot.id,policyVersion:d.data.policySnapshot.version};if(kind==='source')d.data.coverage[0].sourceId='source-b';else d.data.policySnapshot.version++;nock(origin).post('/api/v1/screenings').reply(201,d);await assert.rejects(action.run(context(p,'sk_live_SYNTHETIC_NONFUNCTIONAL')));});
test('unknown error code and invalid UTF8 never leak body',async()=>{nock(origin).post('/api/v1/screenings').reply(500,{error:{code:fake,message:'Alex Morgan'}});await assert.rejects(action.run(context(input)),e=>!e.message.includes(fake)&&/request_failed/.test(e.message));nock(origin).post('/api/v1/screenings').reply(201,Buffer.from([0xc3,0x28]));await assert.rejects(action.run(context(input)),/Invalid response JSON/);});
test('30 second total deadline destroys request without echoing transport details',async(t)=>{
 const {EventEmitter}=require('node:events');const original=https.request;let destroyed=false;
 const req=new EventEmitter();req.write=()=>{};req.end=()=>{};req.destroy=()=>{destroyed=true;req.emit('close');};https.request=()=>req;
 t.mock.timers.enable({apis:['setTimeout']});
 try{const promise=action.run(context(input));const assertion=assert.rejects(promise,/deadline exceeded.*unconfirmed/);t.mock.timers.tick(30001);await assertion;assert.equal(destroyed,true);}finally{https.request=original;t.mock.timers.reset();}
});

for(const field of ['country','birthDate'])for(const value of [false,0,null])test(`invalid mapped optional ${field}=${value} fails before dispatch`,async()=>{await assert.rejects(action.run(context({...input,[field]:value})),/Invalid screening input/);});
for(const value of [false,0,null])for(const version of [undefined,1])test(`invalid mapped policy ID ${value} version ${version} fails before dispatch`,async()=>{await assert.rejects(action.run(context({...input,policyId:value,policyVersion:version})),/Supply the approved policy|Invalid screening input/);});
