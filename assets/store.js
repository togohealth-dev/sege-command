/* SEGE Business — Store adapter.
 * The ONLY module that knows where data lives. Today: GitHub Contents API on
 * the private repo togohealth-dev/sege-business. To port to Axum/Postgres,
 * replace the get/put bodies with fetch() to REST endpoints — nothing else in
 * the app changes. Whole-file read-modify-write keyed on the blob SHA; a
 * concurrent writer gets a 409 and we refetch + retry once (no silent clobber).
 */
const Store = (() => {
  const OWNER = 'togohealth-dev', REPO = 'sege-business', API = 'https://api.github.com';
  const shaCache = {};

  const pat = () => localStorage.getItem('sege-tracker-pat') || '';
  const enc = (s) => btoa(unescape(encodeURIComponent(s)));            // utf8-safe base64
  const dec = (b) => decodeURIComponent(escape(atob(b.replace(/\n/g, ''))));
  const headers = (extra = {}) => {
    const h = { Accept: 'application/vnd.github+json', ...extra };
    const t = pat(); if (t) h.Authorization = 'Bearer ' + t;
    return h;
  };
  const url = (path) => `${API}/repos/${OWNER}/${REPO}/contents/${path}`;

  async function get(path) {
    const res = await fetch(url(path), { headers: headers(), cache: 'no-store' });
    if (res.status === 404) return { json: null, sha: null, missing: true };
    if (res.status === 401 || res.status === 403) throw new Error('auth:' + res.status);
    if (!res.ok) throw new Error('GET ' + path + ' → ' + res.status);
    const data = await res.json();
    shaCache[path] = data.sha;
    return { json: JSON.parse(dec(data.content)), sha: data.sha };
  }

  async function put(path, json, message) {
    if (!pat()) throw new Error('No token');
    const payload = (sha) => JSON.stringify({
      message: message || 'Update ' + path,
      content: enc(JSON.stringify(json, null, 2) + '\n'),
      ...(sha ? { sha } : {}),
    });
    let sha = shaCache[path];
    if (sha === undefined) { const cur = await get(path); sha = cur.sha; }
    let res = await fetch(url(path), { method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }), body: payload(sha) });
    if (res.status === 409) {                                          // stale sha → refetch + retry
      const cur = await get(path);
      res = await fetch(url(path), { method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }), body: payload(cur.sha) });
    }
    if (!res.ok) throw new Error('PUT ' + path + ' → ' + res.status + ' ' + (await res.text()).slice(0, 140));
    const data = await res.json();
    shaCache[path] = data.content.sha;
    return data.content.sha;
  }

  async function githubUser() {
    if (!pat()) return null;
    const res = await fetch(API + '/user', { headers: headers() });
    return res.ok ? res.json() : null;
  }

  return { get, put, pat, githubUser, meta: { OWNER, REPO } };
})();
