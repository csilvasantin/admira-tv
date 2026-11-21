import {priorityState} from './_import-priority.js';
export async function onRequestGet({request,env}){
  const screen=new URL(request.url).searchParams.get('screen');
  const headers={'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'};
  if(!/^[a-z0-9][a-z0-9-]{1,79}$/.test(screen||''))return Response.json({ok:false},{status:400,headers});
  try{return Response.json({ok:true,...await priorityState(env.PROGRAMACION_DB,screen)},{headers});}
  catch{return Response.json({ok:false,error:'priority_unavailable'},{status:503,headers});}
}
