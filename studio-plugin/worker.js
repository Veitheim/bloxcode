// Serves the Bloxcode website (static assets) plus:
//   /updates/<file>  update feed for the app's auto-updater (from the R2 bucket)
//   /download        redirect to the newest installer (Windows or Mac, from the browser)
//   /download/windows, /download/mac

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // /download picks the platform from the browser; /download/windows and /download/mac are fixed.
    const dl = url.pathname.replace(/\/+$/, '');
    if (dl === '/download' || dl === '/download/windows' || dl === '/download/mac') {
      let platform = dl.split('/')[2];
      if (!platform) platform = /Macintosh|Mac OS X/i.test(request.headers.get('user-agent') || '') ? 'mac' : 'windows';
      const feedName = platform === 'mac' ? 'latest-mac.yml' : 'latest.yml';
      const feed = await env.RELEASES.get(feedName);
      if (!feed) return new Response(`No ${platform === 'mac' ? 'Mac' : 'Windows'} release published yet.`, { status: 404 });
      const text = await feed.text();
      // Windows: the installer is "path". Mac: "path" is the zip for the updater, people want the .dmg.
      const urls = [...text.matchAll(/^\s*-?\s*(?:url|path):\s*(.+)$/gm)].map((m) => m[1].trim().replace(/^['"]|['"]$/g, ''));
      const file = platform === 'mac' ? urls.find((u) => u.endsWith('.dmg')) : urls.find((u) => u.endsWith('.exe'));
      if (!file) return new Response('Release feed is broken.', { status: 500 });
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
        if (/\.(exe|dmg|zip)$/.test(key)) {
          headers.set('content-type', 'application/octet-stream');
          headers.set('content-disposition', `attachment; filename="${key}"`);
        }
      }
      return new Response(request.method === 'HEAD' ? null : object.body, { headers });
    }

    return env.ASSETS.fetch(request);
  },
};
