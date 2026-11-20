// Verifies every caption in src/workbench/scenes.ts is 15 words or fewer and wording rules hold.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const src = readFileSync('src/workbench/scenes.ts', 'utf8')
execFileSync('node', ['--experimental-strip-types', '--no-warnings', '-e', `
import * as m from ${JSON.stringify(pathToFileURL('src/workbench/scenes.ts').href)};
const words = (s) => s.trim().split(/\\s+/).length;
const bad = [];
const check = (where, s, max = 15) => { if (words(s) > max) bad.push(where + ' (' + words(s) + ' words, max ' + max + '): ' + s) };
for (const sc of m.SCENARIOS) for (const mode of ['guarded','unguarded']) for (const ev of sc[mode]) check(sc.id+'/'+mode+'@'+ev.t, ev.label);
for (const b of m.BREAKS) for (const ev of b.events) check(b.id+'@'+ev.t, ev.label);
for (const [k,v] of Object.entries(m.NODE_INFO)) { check(k+'.what', v.what); check(k+'.checks', v.checks) }
m.TOUR.forEach((t,i)=>check('tour'+i, t.caption));
const all = JSON.stringify(m);
if (/\\$|audited|production-ready/i.test(all)) bad.push('forbidden wording or dollar sign present');
for (const sc of m.SCENARIOS) for (const mode of ['guarded','unguarded']) { const ts = sc[mode].map(e=>e.t); if (ts.some((t,i)=>i&&t<ts[i-1])) bad.push(sc.id+'/'+mode+' events out of order') }
for (const b of m.BREAKS) { const ts = b.events.map(e=>e.t); if (ts.some((t,i)=>i&&t<ts[i-1])) bad.push(b.id+' events out of order'); if(!b.events.some(e=>e.revert&&e.fixtureId)) bad.push(b.id+' has no revert+fixture') }
// receipts: every played timeline lands a tx with full inspector data, and all mock identifiers carry the 0xMOCK marker
const landing = (events, where) => {
  const ev = events.find((x) => x.txHash)
  if (!ev) { bad.push(where + ' has no landing event with a txHash'); return }
  for (const f of ['blockNumber','gasUsed','source','blockOutcome','guardChecks','trace','stateDiff']) if (ev[f] === undefined) bad.push(where + ' landing event missing ' + f)
  if (ev.source === 'mock') {
    if (!ev.txHash.startsWith('0xMOCK')) bad.push(where + ' txHash does not start with 0xMOCK')
    if (ev.revert && !ev.revert.selector.startsWith('0xMOCK')) bad.push(where + ' selector does not start with 0xMOCK')
    for (const a of ev.revert?.args ?? []) { const m = a.match(/0x[0-9A-Za-z]{20,}/g) ?? []; for (const h of m) if (!h.startsWith('0xMOCK')) bad.push(where + ' hash in args lacks 0xMOCK: ' + h) }
  }
  const order = ['pass','fail','skipped']; const cs = ev.guardChecks.map((c) => c.status)
  const firstFail = cs.indexOf('fail'); if (firstFail >= 0 && cs.slice(firstFail + 1).some((x) => x !== 'skipped')) bad.push(where + ' checks continue after the first failure')
  if (ev.revert && !cs.includes('fail')) bad.push(where + ' reverts but no check failed')
  if (ev.stateDiff.length !== 6) bad.push(where + ' stateDiff should have 6 rows')
  if (ev.revert && ev.stateDiff.some((r) => r.before !== r.after)) bad.push(where + ' reverted tx must leave state unchanged')
}
for (const sc of m.SCENARIOS) { landing(sc.guarded, sc.id + '/guarded'); landing(sc.unguarded, sc.id + '/unguarded') }
for (const b of m.BREAKS) { landing(b.events, b.id); if (!b.unguarded) bad.push(b.id + ' has no unguarded comparison'); else landing(b.unguarded, b.id + '/unguarded') }
for (const f of [m.CHAIN.vaultAddress, m.CHAIN.calldataSelector]) if (!f.startsWith('0xMOCK')) bad.push('CHAIN value lacks 0xMOCK: ' + f)
// ---- acts: story (Act 1 + 3), fixtures (Act 3), roadmap (Act 4) ----
{
  const story = await import(${JSON.stringify(pathToFileURL('src/workbench/story.ts').href)});
  const fx = await import(${JSON.stringify(pathToFileURL('src/workbench/fixtures.ts').href)});
  const road = await import(${JSON.stringify(pathToFileURL('src/workbench/roadmap.ts').href)});
  story.ATTACK.steps.forEach((st, i) => check('attack step ' + (i + 1) + ' caption', st.caption, 12));
  if (story.ATTACK.steps.length !== 5) bad.push('Act 1 must have 5 steps');
  const SHAPE = ['id','critical','category','kind','title','setup','action','decision','workflowStatus','executionSucceeds','outcome','expectedRevertProposed','assertions'].sort().join();
  const KINDS = ['benign','attack','unknown','availability'];
  const OUTCOMES = ['EXECUTED','BLOCKED','QUARANTINED','PENDING','TIMELOCKED','FAIL_CLOSED'];
  const list = fx.FIXTURES;
  if (!Array.isArray(list) || !list.length) bad.push('fixtures.ts must export a non-empty FIXTURES array');
  const ids = new Set();
  for (const f of list ?? []) {
    if (Object.keys(f).sort().join() !== SHAPE) bad.push('fixture ' + f.id + ' has the wrong shape');
    if (!KINDS.includes(f.kind)) bad.push('fixture ' + f.id + ' bad kind ' + f.kind);
    if (!OUTCOMES.includes(f.outcome)) bad.push('fixture ' + f.id + ' bad outcome ' + f.outcome);
    if (typeof f.critical !== 'boolean' || typeof f.executionSucceeds !== 'boolean') bad.push('fixture ' + f.id + ' booleans');
    if (!(f.expectedRevertProposed === null || typeof f.expectedRevertProposed === 'string')) bad.push('fixture ' + f.id + ' expectedRevertProposed');
    if (!Array.isArray(f.assertions) || f.assertions.some((a) => typeof a !== 'string')) bad.push('fixture ' + f.id + ' assertions');
    if (ids.has(f.id)) bad.push('duplicate fixture id ' + f.id); ids.add(f.id);
  }
  for (const o of OUTCOMES) if (!story.OUTCOME_STYLE[o]) bad.push('OUTCOME_STYLE missing ' + o);
  const text = JSON.stringify([story, list, road]);
  if (/\\$|audited|production-ready|quantum-safe/i.test(text)) bad.push('forbidden wording or dollar sign in story/fixtures/roadmap');
  if (road.ROADMAP.banner !== 'ROADMAP. NOT IMPLEMENTED.') bad.push('roadmap banner text changed');
  if (road.ROADMAP.items.length !== 3) bad.push('roadmap must have 3 items');
}
if (bad.length) { console.error(bad.join('\\n')); process.exit(1) }
console.log('workbench data OK: captions within limits, receipts complete, 0xMOCK markers, fixtures shape valid, wording rules hold');
`], { stdio: 'inherit' })
