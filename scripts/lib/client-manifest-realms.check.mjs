import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url))
const {evalManifest}=require('next/dist/server/load-manifest.external.js')
const directory=await mkdtemp(join(tmpdir(),'marque-manifest-realms-'))
after(()=>rm(directory,{recursive:true,force:true}))
let sequence=0
async function fixture(content,suffix='_client-reference-manifest.js'){
 const path=join(directory,`${++sequence}${suffix}`);await writeFile(path,content);return path
}
const script=`globalThis.__RSC_MANIFEST={"/fixture/page":{moduleLoading:{prefix:"",crossOrigin:null},ssrModuleMapping:{"123":{"*":{id:"456",name:"*",chunks:[],async:false}}},clientModules:{"/fixture/client.tsx":{id:0,name:"*",chunks:["123","static/chunks/fixture.js"],async:false}},entryCSSFiles:{"/fixture/page":[{path:"static/css/fixture.css",inlined:false}]},optional:undefined}}`

test('client mappings retain every field in the main realm and remain deeply frozen',async()=>{
 const path=await fixture(script),loaded=evalManifest(path),page=loaded.__RSC_MANIFEST['/fixture/page']
 assert.deepEqual(page,{moduleLoading:{prefix:'',crossOrigin:null},ssrModuleMapping:{'123':{'*':{id:'456',name:'*',chunks:[],async:false}}},clientModules:{'/fixture/client.tsx':{id:0,name:'*',chunks:['123','static/chunks/fixture.js'],async:false}},entryCSSFiles:{'/fixture/page':[{path:'static/css/fixture.css',inlined:false}]},optional:undefined})
 for(const value of [loaded,loaded.__RSC_MANIFEST,page,page.clientModules,page.clientModules['/fixture/client.tsx']]){
  assert.equal(Object.getPrototypeOf(value),Object.prototype)
  assert.equal(Object.isFrozen(value),true)
 }
 assert.equal(Object.getPrototypeOf(page.clientModules['/fixture/client.tsx'].chunks),Array.prototype)
 assert.equal(Object.isFrozen(page.clientModules['/fixture/client.tsx'].chunks),true)
 assert.equal(Object.hasOwn(page,'optional'),true)
 assert.throws(()=>{page.clientModules['/fixture/client.tsx'].id=999},TypeError)
 assert.equal(evalManifest(path),loaded)
})
test('uncached client reads retain fresh file content and distinct object identity',async()=>{
 const path=await fixture('globalThis.__RSC_MANIFEST={value:1}')
 const one=evalManifest(path,false);await writeFile(path,'globalThis.__RSC_MANIFEST={value:2}')
 const two=evalManifest(path,false);assert.notEqual(one,two);assert.equal(one.__RSC_MANIFEST.value,1);assert.equal(two.__RSC_MANIFEST.value,2);assert.equal(Object.isFrozen(two),false)
})
test('non-cloneable client extensions retain their original behavior',async()=>{
 const path=await fixture('globalThis.__RSC_MANIFEST={value:()=>42}')
 const loaded=evalManifest(path);assert.equal(loaded.__RSC_MANIFEST.value(),42);assert.equal(evalManifest(path),loaded)
})
test('other script manifests retain their existing realm and executable values',async()=>{
 const path=await fixture('globalThis.someManifest={value:()=>42,nested:{id:0}}','_other-manifest.js')
 const loaded=evalManifest(path);assert.equal(loaded.someManifest.value(),42);assert.notEqual(Object.getPrototypeOf(loaded.someManifest.nested),Object.prototype);assert.equal(evalManifest(path),loaded)
})
