// Serves the Bloxcode website (static assets) plus:
//   /updates/<file>  update feed for the app's auto-updater (from the R2 bucket)
//   /download        redirect to the newest installer

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/download' || url.pathname === '/download/') {
      const feed = await env.RELEASES.get('latest.yml');
      if (!feed) return new Response('No release published yet.', { status: 404 });
      const text = await feed.text();
      const match = text.match(/^path:\s*(.+)$/m);
      if (!match) return new Response('Release feed is broken.', { status: 500 });
      const file = match[1].trim().replace(/^['"]|['"]$/g, '');
      return Response.redirect(`${url.origin}/updates/${encodeURIComponent(file)}`, 302);
    }

    if (url.pathname.startsWith('/updates/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405 });
      }
      const key = decodeURIComponent(url.pathname.slice('/updates/'.length));
      if (!key || key.includes('..')) return new Response('Not found', { status: 404 });
      const object = await env.RELEASES.get(key);
      if (!object) return new Response('Not found', { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('content-length', String(object.size));
      if (key.endsWith('.yml')) {
        headers.set('content-type', 'text/yaml; charset=utf-8');
        headers.set('cache-control', 'no-cache');
      } else {
        headers.set('cache-control', 'public, max-age=31536000, immutable');
        if (key.endsWith('.exe')) {
          headers.set('content-type', 'application/octet-stream');
          headers.set('content-disposition', `attachment; filename="${key}"`);
        }
      }
      return new Response(request.method === 'HEAD' ? null : object.body, { headers });
    }

    return env.ASSETS.fetch(request);
  },
};
