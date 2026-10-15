// Trusted historical selections, adopted once. These are not a second mutable
// playlist authority and never follow later edits of the physical demo.
const songs=[['titi','Titi Me Preguntó - Bad Bunny'],['careless','Careless Whisper - George Michael'],['rosalia-perla','La Perla - Rosalía'],['seoul2026','Seoul 2026 - AdmiraNext']];
const videos=[['money_for_nothing','Dire Straits - Money For Nothing'],['take_on_me','a-ha - Take On Me'],['thriller','Michael Jackson - Thriller'],['last_christmas','Wham! - Last Christmas'],['never_gonna_give_you_up','Rick Astley - Never Gonna Give You Up'],['pulso_propio','Pulso Propio - Amor Propio & Honestidad'],['siempre_volvia','Siempre Volvía - Loving Someone Who Hurts You'],['que_hablen_de_mi','Que Hablen de Mí - Layah Noir'],['dj_novah_set','DJ Novah - Live Set'],['freedom_90','George Michael - Freedom! 90']];
export const HISTORICAL_STARBUCKS_MUSIC=Object.freeze(['1791970330750-571qe9','1790706121644-y5mqrq','1790707278998-rc0d3i','1791218957837-64zb5z','1791219025911-mub27u','1791973107587-6x7sjj','1791972745463-b4jyuf']);
export function legacySeed(scope,context,stockItem,stock,legacyState){
 if(scope.channelId==='music'&&context.renderer==='starbucks')return HISTORICAL_STARBUCKS_MUSIC.map(id=>stockItem(stock,id)).filter(Boolean);
 if(context.renderer==='starbucks'&&scope.channelId.startsWith('screen-starbucks-wall-')){
  const id=scope.channelId.slice(7),layout=legacyState?.deviceLayout,assigned=layout?.assignments?.[id],custom=assigned&&layout?.playlists?.[assigned];
  const source=custom?.tracks||(legacyState?.playlists?.wall?.managed?legacyState.playlists.wall.tracks:null);
  if(Array.isArray(source))return source.map((item,index)=>({id:item.id||item.stockId||'legacy-wall-'+index,stockId:item.stockId||item.id||'legacy-wall-'+index,title:item.title,asset:item.url,assetType:item.kind==='image'?'image':'video',seconds:item.seconds||10,tags:[]}));
  const own=[['es','tu-momento'],['en','your-moment']].map(([lang,name])=>({id:'legacy-sbux-'+lang,stockId:'legacy-sbux-'+lang,title:'Starbucks · '+name+' · '+lang.toUpperCase(),asset:'https://www.admira.store/admira-xp/media/starbucks-5839/starbucks-'+name+'-'+lang+'-1080x1920.mp4',assetType:'video',seconds:10,tags:[]}));
  const selected=stock.filter(item=>[1310,1312,1314].includes(Number(item.stockNumber||item.num||item.number))).map(item=>stockItem(stock,String(item.id))).filter(Boolean);
  return [...own,...selected];
 }
 if(!['xtanco','cafeteria','sneakers-store','office','lab'].includes(context.renderer))return [];
 if(['office','lab'].includes(context.renderer))return [];
 const music=scope.channelId==='music';
 return (music?songs:videos).map(([file,title])=>({id:'legacy-'+(music?'music-':'video-')+file.replace(/_/g,'-'),stockId:'legacy-'+(music?'music-':'video-')+file.replace(/_/g,'-'),title,asset:'https://www.admira.store/admira-xp/'+(music?'music/'+file+'.mp3':'assets/videos/signage_'+file+'_160x90.mp4'),assetType:music?'audio':'video',seconds:music?600:30,tags:[]}));
}
