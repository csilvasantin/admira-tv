const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('// Surface inventory owns'),html.indexOf('const WALK_MODE'));
test('adding a fourth catalogued surface creates one correctly sized canvas and preserves existing panels',()=>{
 const elements=new Map();function node(tag){return {tag,children:[],append(child){this.children.push(child);if(child.id)elements.set(child.id,child)},get firstElementChild(){return this.children[0]}}}
 const container=node('div');elements.set('sv-signage',container);
 const old=node('div');old.id='existing';old.append(node('canvas'));elements.set(old.id,old);container.append(old);
 const surfaces=[{elementId:'existing',width:512,height:760},{elementId:'second',width:512,height:760},{elementId:'third',width:512,height:1320},{elementId:'fourth',width:480,height:900}];
 const context=vm.createContext({DoohSurfaces:{all:surfaces},$:id=>elements.get(id),document:{createElement:node}});
 vm.runInContext(source,context);assert.equal(elements.get('existing'),old);assert.equal(container.children.length,4);assert.equal(elements.get('fourth').firstElementChild.width,480);assert.equal(elements.get('fourth').firstElementChild.height,900);
 vm.runInContext(source,context);assert.equal(container.children.length,4);
});
