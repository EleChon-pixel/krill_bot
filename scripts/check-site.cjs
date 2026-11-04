'use strict';

// Check the deployable artifact without installing a browser or build dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const site = path.join(root, 'site');
const base = new URL('https://elechon-pixel.github.io/krill_bot/');
const install = 'https://raw.githubusercontent.com/EleChon-pixel/krill_bot/main/krill_bot.user.js';
const pages = ['index.html', 'install/index.html', 'local-ai/index.html'];
const html = new Map([...pages, '404.html'].map(file => [file, fs.readFileSync(path.join(site, file), 'utf8')]));
const titles = new Set();
const descriptions = new Set();
const canonicals = new Set();
let localLinks = 0;
let installLinks = 0;
function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
}
function checkLocal(value, from) {
  if (/^(?:mailto:|tel:|data:)/.test(value)) return;
  const route = from.replace(/index\.html$/, '');
  const url = new URL(value, new URL(route, base));
  if (url.origin !== base.origin) return;
  assert(url.pathname.startsWith(base.pathname), `${from}: link escapes project path: ${value}`);
  const relative = decodeURIComponent(url.pathname.slice(base.pathname.length));
  const target = relative.endsWith('/') || !relative ? `${relative}index.html` : relative;
  const disk = path.resolve(site, target);
  assert(disk.startsWith(`${site}${path.sep}`), `${from}: invalid path ${value}`);
  assert(fs.existsSync(disk), `${from}: missing target ${value}`);
  if (url.hash && html.has(target)) {
    const ids = [...html.get(target).matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert(ids.includes(decodeURIComponent(url.hash.slice(1))), `${from}: missing fragment ${value}`);
  }
  localLinks++;
}
for (const [file, source] of html) {
  assert(source.startsWith('<!doctype html>'), `${file}: missing doctype`);
  assert(source.includes('<html lang="en">'), `${file}: missing language`);
  assert.equal([...source.matchAll(/<h1\b/g)].length, 1, `${file}: use one H1`);
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${file}: duplicate IDs`);
  const meta = Object.fromEntries([...source.matchAll(/<meta\s[^>]*>/g)].map(match => {
    const a = attrs(match[0]); return [a.name || a.property, a.content];
  }));
  assert(meta.viewport, `${file}: missing viewport`);
  if (pages.includes(file)) {
    const title = source.match(/<title>([^<]+)<\/title>/)?.[1];
    assert(title && title.includes('Krill'), `${file}: missing descriptive title`);
    assert(!titles.has(title), `${file}: duplicate title`); titles.add(title);
    assert(meta.description && !descriptions.has(meta.description), `${file}: missing or duplicate description`);
    descriptions.add(meta.description);
    const canonical = [...source.matchAll(/<link\s[^>]*>/g)].map(m => attrs(m[0])).find(a => a.rel === 'canonical')?.href;
    assert.equal(canonical, new URL(file.replace(/index\.html$/, ''), base).href, `${file}: canonical URL`);
    assert(!canonicals.has(canonical), `${file}: duplicate canonical`); canonicals.add(canonical);
    assert.equal(meta['og:url'], canonical, `${file}: social URL`);
    for (const key of ['og:title', 'og:description', 'og:site_name', 'og:image', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) assert(meta[key], `${file}: missing ${key}`);
    assert.equal(meta['twitter:card'], 'summary_large_image');
    assert.equal(meta['og:image'], new URL('assets/social.png', base).href);
    assert.equal(meta['twitter:image'], meta['og:image']);
    assert(!meta.robots?.includes('noindex'), `${file}: accidentally noindex`);
    assert(source.includes(`href="${install}"`) || file === 'local-ai/index.html', `${file}: missing install URL`);
  } else assert.equal(meta.robots, 'noindex', '404 should not be indexed');
  for (const match of source.matchAll(/<(?:a|link|img)\b[^>]*>/g)) {
    const a = attrs(match[0]); const value = a.href || a.src;
    if (value) checkLocal(value, file);
    if (value === install) installLinks++;
    if (match[0].startsWith('<img')) assert(Object.hasOwn(a, 'alt'), `${file}: image needs alt text`);
  }
  assert(!/<script\b/i.test(source), `${file}: unexpected client script`);
}
const sitemap = fs.readFileSync(path.join(site, 'sitemap.xml'), 'utf8');
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
assert.deepEqual(locations.sort(), [...canonicals].sort(), 'sitemap must cover the canonical pages exactly');
const png = fs.readFileSync(path.join(site, 'assets/social.png'));
assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
const script = fs.readFileSync(path.join(root, 'krill_bot.user.js'), 'utf8');
const metadata = Object.fromEntries([...script.matchAll(/^\/\/ @(\w+)\s+(.+)$/gm)].map(m => [m[1], m[2]]));
assert.equal(metadata.name, 'krill_bot'); assert.equal(metadata.namespace, 'krill_bot.local');
assert.equal(metadata.downloadURL, install); assert.equal(metadata.updateURL, install);
assert.equal(metadata.homepageURL, base.href);
assert.equal(metadata.version, require('../package.json').version);
console.log(`Website checks passed: ${pages.length} indexable pages, ${localLinks} internal links, ${installLinks} install links, sitemap, social card, userscript metadata.`);
