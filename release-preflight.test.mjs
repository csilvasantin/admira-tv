import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=dirname(fileURLToPath(import.meta.url)),deploy=readFileSync(join(root,'deploy.sh'),'utf8');
function block(start,end){const a=deploy.indexOf(start),b=deploy.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return deploy.slice(a,b);}
const guards=block('release="$(sed','git_full="$(git')+block('sw_cache="$(sed','\necho "→ Cloudflare Pages');
assert.doesNotMatch(guards,/\bnpx\b|vault-get|git push/);
// Publica quien firma: el agente y el equipo salen de release-signature.json. Con un firmante
// fijo el test solo pasaba mientras la última publicación fuera suya.
const firma=JSON.parse(readFileSync(join(root,'release-signature.json'),'utf8'));
const run=cwd=>spawnSync('bash',['-c','set -euo pipefail\n'+guards],{cwd,encoding:'utf8',env:{PATH:process.env.PATH,ADMIRA_RELEASE_AGENT:firma.agent,ADMIRA_RELEASE_MACHINE:firma.machine}});

test('actual publisher guards accept the canonical static signature and service-worker cache',()=>{
  const result=run(root);assert.equal(result.status,0,result.stdout+result.stderr);
});

test('publisher rejects a stale worker cache or static signature before deployment',()=>{
  for(const stale of ['cache','signature']){
    const fixture=mkdtempSync(join(tmpdir(),'admira-tv-release-'));
    try{for(const name of ['index.html','release-signature.json','sw.js'])copyFileSync(join(root,name),join(fixture,name));
      if(stale==='cache')writeFileSync(join(fixture,'sw.js'),"const CACHE = 'admira-shell-v.old';\n");
      else{const sig=JSON.parse(readFileSync(join(fixture,'release-signature.json'),'utf8'));sig.version='v.old';writeFileSync(join(fixture,'release-signature.json'),JSON.stringify(sig));}
      assert.notEqual(run(fixture).status,0,stale);
    }finally{rmSync(fixture,{recursive:true,force:true});}
  }
});
