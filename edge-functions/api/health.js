export default function onRequest() {
  return new Response(
    JSON.stringify({
      ok: true,
      service: 'a-share-monitor',
      runtime: 'edgeone-pages',
      time: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  )
}
