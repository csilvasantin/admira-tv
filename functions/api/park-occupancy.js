const headers = {'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};

export async function onRequestGet({request,env}) {
  const screen = new URL(request.url).searchParams.get('screen');
  if (!/^admiranext0[1-5]$/.test(screen || '')) return new Response(null,{status:404,headers});
  if (!env.PARK_OCCUPANCY) return Response.json({available:false},{status:503,headers});
  try {
    const row = await env.PARK_OCCUPANCY.prepare('SELECT captured_at,snapshot FROM demo_occupancy WHERE id=1').first();
    if (!row) return Response.json({available:false},{headers});
    return Response.json({available:true,...JSON.parse(row.snapshot),updatedAt:row.captured_at},{headers});
  } catch {
    return Response.json({available:false},{status:503,headers});
  }
}
