'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const filename = path.join(__dirname, 'krill_bot.user.js');
const core = require(filename);
const { keyOf, parseWordConstraints, satisfies, createCandidates, createRoundGate, mergeOfficial,
  transportEvents, parseTransport, readBounded, relevantURL, validateEntries, buildArchive, parseUsedItems, parseModelResponse } = core;

test('identity preserves articles, accents and punctuation while normalizing case/spacing', () => {
  assert.notEqual(keyOf('The Office'), keyOf('Office'));
  assert.notEqual(keyOf('A Quiet Place'), keyOf('Quiet Place'));
  assert.notEqual(keyOf('Pokémon'), keyOf('Pokemon'));
  assert.notEqual(keyOf('AC/DC'), keyOf('ACDC'));
  assert.equal(keyOf(' THE  Office '), keyOf('the office'));
  assert.equal(keyOf('Cafe\u0301'), keyOf('Café'));
});

test('every literal prefix, suffix, containment and numeric length rule must pass', () => {
  const rules = parseWordConstraints('Name a 5-letter word that starts with S and ends with E and contains the sequence "mil".');
  assert.equal(rules.length, 4);
  assert.equal(satisfies('smile', rules), true);
  for (const invalid of ['smiles', 'spare', 'smirk', 'emile', 'a smile']) assert.equal(satisfies(invalid, rules), false, invalid);
  assert.deepEqual(parseWordConstraints('Name a movie ending in X'), []);
  assert.equal(satisfies('way', parseWordConstraints('Name a word ending in way')), true);
});

test('pending expiry restores the original candidate even after replacement', () => {
  const pool = createCandidates();
  for (const word of ['cat', 'dog', 'bird', 'fish', 'horse', 'fox']) pool.add(word);
  const cat = pool.rows.get('cat'); cat.status = 'pending';
  assert.equal(pool.select().some(row => row.text === 'cat'), false);
  assert.equal(pool.select().some(row => row.text === 'fox'), true);
  cat.status = 'available';
  assert.equal(pool.select()[0].text, 'cat');
});

test('higher archive promotion does not destroy displaced candidates', () => {
  const pool = createCandidates();
  for (let i = 0; i < 5; i++) pool.add(`model ${i}`);
  const high = pool.add('rare answer', { source: 'guide', points: 100 });
  assert.equal(pool.select()[0].text, 'rare answer');
  high.status = 'accepted';
  assert.equal(pool.select().length, 5);
  assert.equal(pool.select().some(row => row.text === 'model 4'), true);
});

test('clear records restores accepted/rejected/pending candidates, retaining deliberate skips', () => {
  const pool = createCandidates();
  pool.add('cat').status = 'accepted'; pool.add('dog').status = 'rejected'; pool.add('fish').status = 'pending';
  pool.add('fox').skipped = true;
  pool.clearRecords();
  assert.deepEqual(pool.select().map(row => row.text), ['cat', 'dog', 'fish']);
});

test('unconfirmed observed answers are not suggestions and may be upgraded by a real source', () => {
  const pool = createCandidates(); pool.add('wrong guess', { source: 'observed' });
  assert.deepEqual(pool.select(), []);
  pool.add('wrong guess', { source: 'model' });
  assert.equal(pool.select()[0].source, 'model');
});

test('Regenerate skips displayed candidates and does not reoffer them', () => {
  const pool = createCandidates();
  for (let i = 0; i < 12; i++) pool.add(`answer ${i}`);
  const first = pool.select().map(row => row.key); pool.skipVisible();
  assert.equal(pool.select().length, 5);
  assert.equal(pool.select().some(row => first.includes(row.key)), false);
});

test('score-only official edits persist and identical edits do not count as changes', () => {
  const old = [['The Office', 60, '2026-01-01', 'official-manual']];
  const result = mergeOfficial(old, 'The Office | 100', '2026-11-04');
  assert.equal(result.added, 0); assert.equal(result.changed, 1); assert.equal(result.rows[0][1], 100);
  assert.equal(mergeOfficial(result.rows, 'The Office | 100', '2026-11-04').changed, 0);
});

test('round gate invalidates async tokens and retires old IDs on transitions', () => {
  const gate = createRoundGate(); gate.routeTo('/party/one'); gate.begin('Name an animal', 'r1');
  const token = gate.token(); gate.begin('Name a country', 'r2');
  assert.equal(gate.current(token), false); assert.equal(gate.retired.has('r1'), true);
  gate.stage({ roundId: 'r1', question: 'Name an animal', answer: 'cat' });
  assert.equal(gate.staged.has('r1'), false);
  gate.routeTo('/party/two'); assert.equal(gate.id, ''); assert.equal(gate.retired.size, 0);
});

test('future round packets remain buffered until matching prompt arrives', () => {
  const gate = createRoundGate(); gate.routeTo('/party/one'); gate.begin('Name an animal', 'r1');
  gate.stage({ roundId: 'r2', question: 'Name a country', answer: 'France', kind: 'used' });
  assert.equal(gate.matchStage('Name an animal', false), '');
  assert.equal(gate.matchStage('Name a country', true), 'r2');
  assert.equal(gate.begin('Name a country', 'r2')[0].answer, 'France');
});

test('untitled IDs cannot bind to unchanged prompts and ambiguous/stale IDs cannot bind', () => {
  const gate = createRoundGate(); gate.begin('Name an animal');
  gate.stage({ roundId: 'r1', kind: 'identity' }, 100);
  assert.equal(gate.matchStage('Name an animal', false, 200), '');
  assert.equal(gate.matchStage('Name a country', true, 200), 'r1');
  gate.stage({ roundId: 'r2', kind: 'identity' }, 100);
  assert.equal(gate.matchStage('Name a country', true, 200), '');
  assert.equal(gate.matchStage('Name a country', true, 9000), '');
});

test('generic event names and success/valid flags alone never confirm acceptance', () => {
  for (const type of ['played', 'passed', 'correct', 'guessAccepted', 'unaccepted']) {
    const events = transportEvents({ type, roundId: 'r1', answer: 'cat', success: true, valid: true });
    assert.equal(events.find(event => event.answer)?.kind, 'observed', type);
  }
  assert.equal(transportEvents({ roundId: 'r1', answer: 'cat', accepted: true }).find(event => event.answer).kind, 'used');
  assert.equal(transportEvents({ roundId: 'r1', answer: 'cat', accepted: true, valid: false }).find(event => event.answer).kind, 'rejected');
});

test('submitted lists stay uncertain; accepted lists honor child identity and negative flags', () => {
  assert.equal(transportEvents({ roundId: 'r1', submittedAnswers: ['cat'] }).find(event => event.answer).kind, 'observed');
  const events = transportEvents({ roundId: 'r1', usedAnswers: [{ answer: 'cat', roundId: 'old' }, { text: 'dog', accepted: false }, 'fish'] });
  assert.equal(events.find(event => event.answer === 'cat').roundId, 'old');
  assert.equal(events.find(event => event.answer === 'dog').kind, 'observed');
  assert.equal(events.find(event => event.answer === 'fish').kind, 'used');
});

test('Socket.IO envelopes parse without accepting arbitrary embedded JSON', () => {
  const events = transportEvents(parseTransport('42/party,7["answerPlayed",{"roundId":"r1","answer":"cat","accepted":true}]'));
  assert.equal(events.find(event => event.answer).event, 'answerPlayed');
  assert.equal(parseTransport('HTML junk {"answer":"cat"}'), null);
});

test('transport recursion and output remain bounded, including cyclic arrays', () => {
  const cycle = []; cycle.push(cycle);
  assert.deepEqual(transportEvents(cycle), []);
  assert.ok(transportEvents(Array.from({ length: 1000 }, (_, i) => ({ roundId: `r${i}`, answer: 'cat' }))).length <= 300);
});

test('fetch read limit cancels chunked bodies with no Content-Length', async () => {
  let canceled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(8)); }, cancel() { canceled = true; } });
  await assert.rejects(readBounded(stream, 10), /byte limit/);
  assert.equal(canceled, true);
  assert.equal(await readBounded(new Response('café').body, 5), 'café');
});

test('endpoint allowlist excludes unrelated and deceptively named hosts', () => {
  const base = 'https://krillion.io/party/one';
  for (const url of ['/api/state', '/socket.io/?transport=polling', 'https://room.example/socket.io/?x=1']) assert.equal(relevantURL(url, base), true, url);
  for (const url of ['https://analytics.example/api/state', '/assets/file.js', 'https://krillion.io.evil.example/api/state']) assert.equal(relevantURL(url, base), false, url);
});

test('cache validation tolerates malformed rows without throwing', () => {
  const entries = [null, 'bad', ['question', [null, ['cat', 999, '2026-01-01'], ['cat', 100, '2026-01-01'], ['dog', 85, 'bad']]]];
  assert.equal(validateEntries(entries, 'guide').get('question').length, 1);
  const index = buildArchive([{ date: '2026-11-04', prompts: [{ q: 'Name an animal', tiers: [{ name: 'Rare', picks: ['cat'] }] }] }]);
  assert.equal(index.newest, '2026-11-04'); assert.equal(index.entries[0][1][0][1], 60);
});

test('USED splitting preserves commas inside titles', () => {
  assert.deepEqual(parseUsedItems('USED: Paris, Texas • The Office\nA Quiet Place'), ['Paris, Texas', 'The Office', 'A Quiet Place']);
  assert.deepEqual(parseUsedItems('None yet'), []);
});

test('model output requires completed, nontruncated and correctly typed JSON', () => {
  assert.deepEqual(parseModelResponse({ done: true, response: '{"answers":["cat"]}' }), ['cat']);
  assert.throws(() => parseModelResponse({ done: true, done_reason: 'length', response: '{"answers":["cat"]}' }), /truncated/);
  assert.throws(() => parseModelResponse({ done: true, response: '{"answers":[42]}' }), /Invalid/);
  assert.throws(() => parseModelResponse({ done: false, response: '{"answers":["cat"]}' }), /complete/);
});

// Exercise browser orchestration with isolated, deterministic web API mocks.
// Only this test copy receives private hooks; the installed userscript exports none.
function browserHarness(options = {}) {
  const timers = new Map(); let timerId = 0;
  const page = {
    WebSocket: class extends EventTarget {}, EventSource: class extends EventTarget {},
    fetch: options.fetch || (() => Promise.resolve(new Response('{}', { headers: { 'content-type': 'application/json' } }))),
    XMLHttpRequest: class extends EventTarget { open() {} send() {} }
  };
  if (options.brokenSocket) Object.defineProperty(page, 'WebSocket', { get() { throw new Error('blocked context'); } });
  const location = { hostname: 'krillion.io', pathname: '/party/one', search: '', hash: '', href: 'https://krillion.io/party/one' };
  const context = vm.createContext({
    console, URL, TextDecoder, TextEncoder, ArrayBuffer, Response, performance, location,
    document: { body: null, querySelectorAll: () => [], addEventListener() {} },
    window: {}, unsafeWindow: page, GM_info: { injectInto: 'test' },
    GM_getValue: (key, fallback) => options.storage?.get(key) ?? fallback,
    GM_listValues: () => [...(options.storage?.keys() || [])],
    GM_getResourceText: () => '', GM_setValue: (key, value) => options.storage?.set(key, value),
    GM_xmlhttpRequest: options.gm || (() => ({ abort() {} })),
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; },
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => { timers.set(++timerId, { fn, ms, interval: true }); return timerId; },
    clearInterval: id => timers.delete(id), requestAnimationFrame: () => 1,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
  });
  const original = fs.readFileSync(filename, 'utf8');
  const instrumented = original.replace(/\}\)\(\);\s*$/, 'globalThis.testHooks = { state, gate, beginRound, handleEvent, consumeTransport, applyEvent, pending, resetRoute, reconcile, generate, warmModel, unloadModel, scanUsedRoot, scanUsedAnswers, consumeParty, trackOutgoing, render, makeUI, saved };\n})();');
  vm.runInContext(instrumented, context, { filename });
  return { ...context.testHooks, context, location, page, timers };
}

test('one failed hook does not prevent other hooks from installing', () => {
  const h = browserHarness({ brokenSocket: true });
  assert.match(h.state.hooks.WebSocket, /failed.*blocked context/);
  for (const name of ['EventSource', 'fetch', 'XHR']) assert.equal(h.state.hooks[name], 'installed');
});

test('runtime does not confirm untagged traffic or retired-round traffic', async () => {
  const h = browserHarness(); h.beginRound('Name an animal', 'r1');
  await h.consumeTransport(JSON.stringify({ answer: 'cat', accepted: true }), h.gate.token());
  assert.equal(h.state.candidates.rows.get('cat').status, 'available');
  assert.equal(h.state.candidates.select().length, 0);
  await h.consumeTransport(JSON.stringify({ answer: 'dog', accepted: true, roundId: 'r1' }), h.gate.token());
  assert.equal(h.state.candidates.rows.get('dog').status, 'accepted');
  const old = h.gate.token(); h.beginRound('Name a country', 'r2');
  await h.consumeTransport(JSON.stringify({ answer: 'cat', accepted: true, roundId: 'r1' }), h.gate.token());
  await h.consumeTransport(JSON.stringify({ answer: 'France', accepted: true, roundId: 'r2' }), old);
  assert.equal(h.state.candidates.rows.size, 0);
});

test('future packet does not mark the preceding round used and replays at the new prompt', async () => {
  const h = browserHarness(); h.beginRound('Name an animal', 'r1');
  await h.consumeTransport(JSON.stringify({ roundId: 'r2', question: 'Name a country', usedAnswers: ['France'] }), h.gate.token());
  assert.equal(h.state.candidates.rows.size, 0);
  assert.equal(h.gate.matchStage('Name a country', true), 'r2');
  h.beginRound('Name a country', 'r2');
  assert.equal(h.state.candidates.rows.get('france').status, 'accepted');
});

test('late Blob conversion is discarded after round transition', async () => {
  const h = browserHarness(); h.beginRound('Name an animal', 'r1');
  let finish;
  const conversion = h.consumeTransport({ size: 100, text: () => new Promise(resolve => { finish = resolve; }) }, h.gate.token());
  h.beginRound('Name a country', 'r2');
  finish(JSON.stringify({ roundId: 'r1', answer: 'cat', accepted: true })); await conversion;
  assert.equal(h.state.candidates.rows.size, 0);
});

test('pending expiration and explicit rejection work through runtime orchestration', () => {
  const h = browserHarness(); h.beginRound('Name an animal', 'r1');
  h.state.candidates.add('cat'); h.pending('cat');
  const row = h.state.candidates.rows.get('cat');
  assert.equal(row.status, 'pending'); row.pending.until = 0;
  const tick = [...h.timers.values()].find(timer => timer.interval && timer.ms === 250); tick.fn();
  assert.equal(row.status, 'available'); assert.equal(h.state.candidates.select()[0].text, 'cat');
  h.pending('cat'); h.handleEvent({ roundId: 'r1', kind: 'rejected', answer: 'cat', reason: 'explicit rejection', event: 'guess' }, h.gate.token());
  assert.equal(row.status, 'rejected'); assert.equal(h.state.candidates.select().length, 0);
});

test('leaving and rejoining the same room invalidates old request tokens and identities', () => {
  const h = browserHarness(); h.beginRound('Name an animal', 'r1'); const old = h.gate.token();
  h.location.pathname = '/'; h.resetRoute();
  h.location.pathname = '/party/one'; h.resetRoute();
  assert.equal(h.gate.current(old), false); assert.equal(h.gate.id, ''); assert.equal(h.state.candidates.rows.size, 0);
});

test('fetch instrumentation preserves native promise identity even when clone throws', async () => {
  const response = { headers: new Headers({ 'content-type': 'application/json' }), clone() { throw new Error('clone unavailable'); } };
  const native = Promise.resolve(response), h = browserHarness({ fetch: () => native });
  const result = h.page.fetch('/api/state'); assert.equal(result, native); assert.equal(await result, response);
  await Promise.resolve(); assert.match(h.state.lastTransportError, /clone unavailable/);
});

test('a stale model completion cannot add candidates after the category changes', async () => {
  let callback;
  const h = browserHarness({ gm: options => { callback = options.onload; return { abort() {} }; } });
  h.beginRound('Name an animal', 'r1');
  const task = h.generate(); h.beginRound('Name a country', 'r2');
  callback({ status: 200, responseText: JSON.stringify({ done: true, response: '{"answers":["cat"]}' }) });
  await task; assert.equal(h.state.candidates.rows.size, 0); assert.equal(h.state.active, null);
});

test('explicit text acceptance is supported while generic text does not become an answer', () => {
  assert.equal(transportEvents({ roundId: 'r1', text: 'cat', accepted: true }).find(event => event.answer).kind, 'used');
  assert.equal(transportEvents({ roundId: 'r1', text: 'round is ready' }).some(event => event.answer), false);
});

test('buffered contradictory questions never confirm answers in the new round', () => {
  const h = browserHarness(); h.beginRound('Name an animal', 'r1');
  h.gate.stage({ roundId: 'r2', question: 'Name an animal', answer: 'cat', kind: 'used' });
  h.gate.stage({ roundId: 'r2', question: 'Name a country', answer: 'France', kind: 'used' });
  h.beginRound('Name a country', 'r2');
  assert.equal(h.state.candidates.rows.has('cat'), false);
  assert.equal(h.state.candidates.rows.get('france').status, 'accepted');
});

function element(text, tagName = 'SPAN') {
  return { textContent: text, tagName, children: [], isConnected: true,
    getClientRects: () => [{}], getAttribute: () => null,
    querySelectorAll: () => [], querySelector: () => null, matches: () => false,
    id: '', className: '' };
}

test('inline USED confirmation preserves titles and leaves ambiguous comma text uncertain', () => {
  const h = browserHarness(); h.beginRound('Name a TV show', 'r1');
  const label = element('USED: The Office • A Quiet Place • Paris, Texas');
  h.context.document.querySelectorAll = () => [label]; h.scanUsedRoot(); h.scanUsedAnswers();
  assert.equal(h.state.candidates.rows.get('the office').status, 'accepted');
  assert.equal(h.state.candidates.rows.get('a quiet place').status, 'accepted');
  assert.equal(h.state.candidates.rows.get('paris, texas').status, 'available');
  assert.equal(h.state.candidates.rows.get('paris, texas').observed, true);
  assert.equal(h.state.candidates.select().length, 0);
});

test('random answer attributes outside a located USED container do not confirm use', () => {
  const h = browserHarness(); h.beginRound('Name an animal', 'r1');
  const unrelated = element('cat'); unrelated.getAttribute = name => name === 'data-answer' ? 'cat' : null;
  h.context.document.querySelectorAll = () => [unrelated]; h.scanUsedRoot(); h.scanUsedAnswers();
  assert.equal(h.state.dom.used, null); assert.equal(h.state.candidates.rows.size, 0);
});

test('empty USED placeholders do not become accepted answers', () => {
  const h = browserHarness(); h.beginRound('Name an animal', 'r1');
  const label = element('USED: None yet'); h.context.document.querySelectorAll = () => [label];
  h.scanUsedRoot(); h.scanUsedAnswers(); assert.equal(h.state.candidates.rows.size, 0);
});

test('previous DOM USED entries stay fenced until the visible list clears', () => {
  const h = browserHarness(); h.beginRound('Name an animal', 'r1');
  const label = element('USED: Cat'); h.context.document.querySelectorAll = () => [label];
  h.scanUsedRoot(); h.scanUsedAnswers(); assert.equal(h.state.candidates.rows.get('cat').status, 'accepted');
  h.beginRound('Name a pet', 'r2');
  assert.equal(h.state.candidates.rows.has('cat'), false);
  label.textContent = 'USED: Cat • Dog'; h.scanUsedAnswers();
  assert.equal(h.state.candidates.rows.has('cat'), false);
  assert.equal(h.state.candidates.rows.get('dog').status, 'accepted');
  label.textContent = 'USED: None yet'; h.scanUsedAnswers();
  label.textContent = 'USED: Cat'; h.scanUsedAnswers();
  assert.equal(h.state.candidates.rows.get('cat').status, 'accepted');
});

test('a simultaneously replaced USED list does not fence genuinely new entries', () => {
  const h = browserHarness(); h.beginRound('Name an animal', 'r1');
  const label = element('USED: Cat'); h.context.document.querySelectorAll = () => [label];
  h.scanUsedRoot(); h.scanUsedAnswers();
  label.textContent = 'USED: France'; h.beginRound('Name a country', 'r2');
  assert.equal(h.state.candidates.rows.has('cat'), false);
  assert.equal(h.state.candidates.rows.get('france').status, 'accepted');
});

// Schema fixtures reflect the publicly shipped Party client (2026-11-04).
function partyRoom(events, overrides = {}) {
  return { code: 'KRLP', version: 40, gameNumber: 1, phase: 'round',
    category: { index: 2, text: 'Name a way to cook an egg', accepted: 2 }, events, ...overrides };
}
function partyEvent(seq, kind, fields = {}) { return { seq, kind, at: 1000 + seq, ...fields }; }

test('actual Party snap confirms pass events only for the current category and retains live tiers', () => {
  const h = browserHarness();
  h.consumeParty({ t: 'snap', room: partyRoom([
    partyEvent(1, 'category', { index: 1 }), partyEvent(2, 'pass', { answer: 'Bear spray', tier: 'rare' }),
    partyEvent(3, 'category', { index: 2 }), partyEvent(4, 'pass', { answer: 'Poached eggs', tier: 'schooler' })
  ]) });
  assert.equal(h.gate.id, 'KRLP:1:2');
  assert.equal(h.state.candidates.rows.has('bear spray'), false);
  assert.equal(h.state.candidates.rows.get('poached eggs').status, 'accepted');
  assert.equal(h.state.candidates.rows.get('poached eggs').actualTier, 'schooler');
});

test('actual Party patch associates a pass before category change with the preceding category', () => {
  const h = browserHarness(); h.consumeParty({ t: 'snap', room: partyRoom([]) });
  h.consumeParty({ t: 'patch', patch: { base: 40, v: 41,
    set: { category: { index: 3, text: 'Name an animal' } },
    events: [partyEvent(5, 'pass', { answer: 'Fried eggs', tier: 'plankton' }), partyEvent(6, 'category', { index: 3 }), partyEvent(7, 'pass', { answer: 'Cat', tier: 'rare' })] } });
  assert.equal(h.gate.id, 'KRLP:1:3');
  assert.equal(h.state.candidates.rows.has('fried eggs'), false);
  assert.equal(h.state.candidates.rows.get('cat').status, 'accepted');
});

test('patch gaps fail closed until a full snapshot, and stale snapshots cannot undo current state', () => {
  const h = browserHarness(); h.consumeParty({ t: 'snap', room: partyRoom([]) });
  h.consumeParty({ t: 'patch', patch: { base: 38, v: 39, events: [] } });
  assert.equal(h.state.partyDesync, true);
  h.consumeParty({ t: 'patch', patch: { base: 40, v: 42, events: [partyEvent(5, 'pass', { answer: 'Fried eggs', tier: 'rare' })] } });
  assert.equal(h.state.candidates.rows.size, 0);
  h.consumeParty({ t: 'snap', room: partyRoom([partyEvent(5, 'category', { index: 2 }), partyEvent(6, 'pass', { answer: 'Poached eggs', tier: 'rare' })], { version: 43 }) });
  assert.equal(h.state.partyDesync, false);
  h.consumeParty({ t: 'snap', room: partyRoom([], { version: 42, category: { index: 1, text: 'Name a movie' } }) });
  assert.equal(h.gate.prompt, 'Name a way to cook an egg');
});

test('new games reset tracking even when the category and prompt repeat', () => {
  const h = browserHarness(); h.consumeParty({ t: 'snap', room: partyRoom([]) });
  h.state.candidates.add('Poached eggs').status = 'accepted';
  h.consumeParty({ t: 'snap', room: partyRoom([], { version: 41, gameNumber: 2 }) });
  assert.equal(h.gate.id, 'KRLP:2:2'); assert.equal(h.state.candidates.rows.has('poached eggs'), false);
});

test('ack correlation tracks the actual outgoing text and ignores old round acknowledgements', () => {
  const h = browserHarness(); h.consumeParty({ t: 'snap', room: partyRoom([]) });
  h.trackOutgoing(JSON.stringify({ t: 'act', cid: 'c1', action: { type: 'submit', text: 'Poached eggs' } }));
  assert.equal(h.state.candidates.rows.get('poached eggs').status, 'pending');
  h.consumeParty({ t: 'ack', cid: 'c1', ok: true, submit: { accepted: true, tier: 'schooler' } });
  assert.equal(h.state.candidates.rows.get('poached eggs').status, 'accepted');
  h.trackOutgoing(JSON.stringify({ t: 'act', cid: 'c2', action: { type: 'submit', text: 'Fried eggs' } }));
  h.beginRound('Name an animal', 'other');
  h.consumeParty({ t: 'ack', cid: 'c2', ok: true, submit: { accepted: true } });
  assert.equal(h.state.candidates.rows.has('fried eggs'), false);
});

test('actual Party rejects exclude pending local answers but only observe other players misses', () => {
  const h = browserHarness(); h.consumeParty({ t: 'snap', room: partyRoom([]) }); h.pending('poached');
  h.consumeParty({ t: 'patch', patch: { base: 40, v: 41, events: [partyEvent(8, 'reject', { text: 'poached', why: 'repeat' }), partyEvent(9, 'reject', { text: 'Dog', why: 'miss' })] } });
  assert.equal(h.state.candidates.rows.get('poached').status, 'rejected');
  assert.equal(h.state.candidates.rows.get('dog').status, 'available');
  assert.equal(h.state.candidates.rows.get('dog').observed, true);
});

test('named room SSE events deliver the real snapshot protocol', async () => {
  const h = browserHarness(); const socket = new h.page.EventSource();
  const event = new Event('room'); Object.defineProperty(event, 'data', { value: JSON.stringify(partyRoom([])) });
  socket.dispatchEvent(event); await Promise.resolve();
  assert.equal(h.gate.id, 'KRLP:1:2');
});

test('the room schema retains no chat, player keys or player records', () => {
  const update = core.reduceParty(null, { t: 'snap', room: { ...partyRoom([]), chat: ['private'], players: [{ playerKey: 'secret' }], playerKey: 'secret' } });
  assert.equal(JSON.stringify(update).includes('secret'), false);
  assert.equal('chat' in update.room, false);
});

function mockNode(tag = 'div') {
  const props = new Map();
  return { tagName: tag.toUpperCase(), textContent: '', children: [], dataset: {}, style: { setProperty(k, v) { props.set(k, v); }, getPropertyValue(k) { return props.get(k); } },
    append(...nodes) { this.children.push(...nodes); }, appendChild(node) { this.children.push(node); },
    replaceChildren(...nodes) { this.children = nodes.flatMap(node => node.fragment ? node.children : [node]); },
    addEventListener() {}, setAttribute() {} };
}

test('render exposes accepted, pending and rejected chips plus real tier colours outside a closed tab', () => {
  const h = browserHarness(), doc = h.context.document;
  doc.createElement = tag => mockNode(tag); doc.createDocumentFragment = () => ({ ...mockNode(), fragment: true });
  h.beginRound('Name an animal', 'r1');
  h.state.panel = mockNode();
  for (const name of ['prompt', 'status', 'model', 'capture', 'list', 'used', 'pending', 'observed', 'rejected', 'debug']) h.state.ui[name] = mockNode();
  h.state.candidates.add('Cat', { source: 'guide', points: 100 });
  const used = h.state.candidates.add('Dog'); used.status = 'accepted'; used.actualTier = 'rare';
  h.state.candidates.add('Fox').status = 'pending'; h.state.candidates.add('Fish').status = 'rejected';
  h.render();
  assert.equal(h.state.ui.list.children[0].style.getPropertyValue('--tier-color'), '#ffd166');
  assert.match(h.state.ui.used.children[0].textContent, /✓ Dog · Rare/);
  assert.equal(h.state.ui.used.children[0].style.getPropertyValue('--chip-color'), '#ff5252');
  assert.match(h.state.ui.pending.children[0].textContent, /◷ Fox/);
  assert.match(h.state.ui.rejected.children[0].textContent, /✕ Fish/);
});

test('dark-mode chip and tier colours have WCAG AA contrast against their explicit backgrounds', () => {
  function luminance(hex) { const rgb = hex.match(/[a-f0-9]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4); return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722; }
  for (const color of [...Object.values(core.TIERS).map(tier => tier.color), '#69e6a6', '#ffd166', '#c4b5fd', '#ff9292']) {
    for (const bg of ['#111827', '#141e2d']) assert.ok((luminance(color) + 0.05) / (luminance(bg) + 0.05) >= 4.5, `${color} on ${bg}`);
  }
});

test('old sockets cannot repopulate tracking after leaving and rejoining the same route', async () => {
  const h = browserHarness(), oldSocket = new h.page.WebSocket();
  h.location.pathname = '/'; h.resetRoute(); h.location.pathname = '/party/one'; h.resetRoute();
  const event = new Event('message'); Object.defineProperty(event, 'data', { value: JSON.stringify({ t: 'snap', room: partyRoom([]) }) });
  oldSocket.dispatchEvent(event); await Promise.resolve(); assert.equal(h.state.partyRoom, null);
  const currentSocket = new h.page.WebSocket(); currentSocket.dispatchEvent(event); await Promise.resolve();
  assert.equal(h.gate.id, 'KRLP:1:2');
});

test('UI template provides explicit dark-mode text colour despite inline all:initial on host', () => {
  const h = browserHarness(), nodes = new Map(), root = { innerHTML: '', getElementById(id) { if (!nodes.has(id)) nodes.set(id, mockNode()); return nodes.get(id); } };
  h.context.document.body = { appendChild() {} };
  h.context.document.createElement = tag => ({ ...mockNode(tag), attachShadow: () => root });
  h.makeUI();
  assert.match(root.innerHTML, /section\{color:#f4f4f5;font:/);
  assert.match(root.innerHTML, /background:#0c1019/);
  assert.match(root.innerHTML, /border-left:5px solid var\(--tier-color\)/);
  assert.match(root.innerHTML, /<div class="tracking">/);
  assert.doesNotMatch(root.innerHTML, /<details><summary>Answer tracking/);
});

test('renamed caches migrate same-script data without deleting the original keys', () => {
  for (const suffix of ['_public_daily_archive_v1', '_guide_pages_v1', '_official_manual_v1']) {
    const oldKey = `previous${suffix}`, newKey = `krill_bot${suffix}`;
    const serialized = JSON.stringify({ retained: suffix });
    const storage = new Map([[oldKey, serialized]]), h = browserHarness({ storage });
    assert.equal(h.saved(newKey).retained, suffix);
    assert.equal(storage.get(newKey), serialized); assert.equal(storage.get(oldKey), serialized);
  }
});

test('renamed caches prefer new data over older compatible keys', () => {
  const storage = new Map([['previous_guide_pages_v1', '{"days":{"old":[]}}'], ['krill_bot_guide_pages_v1', '{"days":{"new":[]}}']]);
  const h = browserHarness({ storage }); assert.deepEqual(Object.keys(h.saved('krill_bot_guide_pages_v1').days), ['new']);
});

test('cache migration skips malformed data and never migrates unrelated preferences', () => {
  const storage = new Map([['a_guide_pages_v1', 'invalid'], ['b_guide_pages_v1', '[]'], ['c_guide_pages_v1', '{"days":{}}'], ['previous_other', '{"secret":true}']]);
  const h = browserHarness({ storage });
  assert.equal(JSON.stringify(h.saved('krill_bot_guide_pages_v1')), '{"days":{}}');
  assert.equal(h.saved('krill_bot_other'), null); assert.equal(storage.has('krill_bot_other'), false);
});
