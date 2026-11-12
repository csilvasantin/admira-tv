import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('./players.html',import.meta.url),'utf8');
const pick=n=>html.match(new RegExp('function '+n+'\\([\\s\\S]*?\\n'))[0];
test('Dual H·V elige la vertical nativa (#1990) y no la 9:16 derivada de la 16:9 (#1992)',()=>{
  const ctx=vm.createContext({orientOf:i=>i.o});
  vm.runInContext(pick('familyRoot')+pick('lexLess')+pick('dualFamilies'),ctx);
  const items=[
    {id:'o',num:1988,type:'video',o:'vertical',tags:[],externalRef:null},
    {id:'h0',num:1989,type:'video',o:'horizontal',tags:['formato-alterno'],externalRef:'o',validacion:{duracion:179.37}},
    {id:'v1',num:1990,type:'video',o:'vertical',tags:[],externalRef:'o',validacion:{duracion:179.37}},
    {id:'h1',num:1991,type:'video',o:'horizontal',tags:[],externalRef:'h0',validacion:{duracion:179.38}},
    {id:'v2',num:1992,type:'video',o:'vertical',tags:['formato-alterno'],externalRef:'h1',validacion:{duracion:179.37}},
  ];
  const f=ctx.dualFamilies(items);
  assert.equal(f.length,1); assert.equal(f[0].v.id,'v1'); assert.equal(f[0].h.id,'h1');
});
