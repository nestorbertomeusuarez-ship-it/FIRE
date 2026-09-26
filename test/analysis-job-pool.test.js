// Unit tests for createSimulationJobPool: a thin pool of N createSimulationJobs instances used by
// the dedicated sensitivity/stress analysis workers, so their many full-precision requests run in
// parallel instead of serially on one worker. Same fake-worker harness style as
// test/simulation-jobs.test.js, but exercising the pool's dispatch/aggregation on top.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/fake-app.js');

const same = (actual, expected, message) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message);

(async () => {
  const app = await loadApp();
  const createSimulationJobs = app.run('createSimulationJobs');
  const createSimulationJobPool = app.run('createSimulationJobPool');
  assert.equal(typeof createSimulationJobPool, 'function');

  function harness(size, options = {}) {
    const workers = [];
    const makeWorker = () => {
      if (options.failToCreate) throw new Error('no Worker here');
      const worker = { posted: [], terminated: false, onmessage: null, onerror: null,
        postMessage(message) { this.posted.push(message); },
        terminate() { this.terminated = true; } };
      workers.push(worker); return worker;
    };
    const syncCalls = [];
    let clock = 0;
    const pool = createSimulationJobPool({ size, makeWorker, runSync: (p, paths) => { syncCalls.push(paths); return { sync: true, paths }; }, now: () => clock++, minTerminatePaths: 1000 });
    const answer = (worker, reqId, calibrate = false) => worker.onmessage({ data: { result: { from: workers.indexOf(worker), reqId }, reqId, calibrate, ms: 5 } });
    return { pool, workers, syncCalls, answer };
  }
  const settled = promise => { const box = { state: 'pending' }; promise.then(value => { box.state = 'resolved'; box.value = value; }, error => { box.state = 'rejected'; box.error = error; }); return box; };
  const tick = () => new Promise(resolve => setImmediate(resolve));

  // 1) a pool of N spreads N concurrent requests across N distinct worker instances (round-robin
  // among equally-idle slots), instead of queuing them all on a single worker.
  {
    const { pool, workers } = harness(3);
    assert.equal(workers.length, 3, 'spawns one worker per pool slot up front');
    const reqs = [settled(pool.request({ v: 1 }, 5000)), settled(pool.request({ v: 2 }, 5000)), settled(pool.request({ v: 3 }, 5000))];
    await tick();
    assert.equal(workers.filter(w => w.posted.length === 1).length, 3, 'each of the 3 workers received exactly one of the 3 requests');
    same(workers.map(w => w.posted.length), [1, 1, 1]);
  }

  // 2) a 3rd request, once all slots are busy, joins the least-busy slot (still only 1 each after
  // the first 2; the 3rd makes exactly one slot carry 2). Uses calibrate:true like every real
  // analysisJobs request (see runSensitivity/runSrrStress): calibration jobs never supersede
  // siblings queued on the same slot, so 2 requests can coexist on one slot without a restart.
  {
    const { pool, workers } = harness(2);
    pool.request({ v: 1 }, 5000, { calibrate: true }); pool.request({ v: 2 }, 5000, { calibrate: true }); await tick();
    pool.request({ v: 3 }, 5000, { calibrate: true }); await tick();
    assert.equal(workers.length, 2, 'no extra worker was spawned: the 3rd request reuses an existing slot');
    const counts = workers.map(w => w.posted.length).sort();
    same(counts, [1, 2], 'the 3rd request piles onto whichever slot is least busy, not always the same one');
  }

  // 3) cancelPending() cancels pending jobs on EVERY pool worker, not just one: a new
  // sensitivity/stress click must supersede the whole previous batch across all slots.
  {
    const { pool, workers } = harness(3);
    const reqs = [settled(pool.request({ v: 1 }, 5000)), settled(pool.request({ v: 2 }, 5000)), settled(pool.request({ v: 3 }, 5000))];
    await tick();
    assert.equal(pool.pendingCount(), 3, 'all 3 requests are pending, one per slot');
    pool.cancelPending();
    await tick();
    reqs.forEach((r, i) => { assert.equal(r.state, 'resolved'); same(r.value, { stale: true }, `request ${i} resolves stale`); });
    assert.equal(pool.pendingCount(), 0, 'nothing left pending in any slot');
    // Long jobs (>= minTerminatePaths) were cancelled: every worker that was carrying one restarts.
    assert.equal(workers.filter(w => w.terminated).length, 3, 'every busy worker is terminated');
    assert.ok(pool.restarts() >= 3, 'restarts are aggregated across every slot');
  }

  // 4) results are bit-identical to a single createSimulationJobs instance for the same inputs:
  // the pool only adds dispatch, it never recalibrates or perturbs seeds/params per slot.
  {
    const seenParams = [];
    const makeSingle = () => null; // no Worker: exercises the sync path, deterministic and simple
    const runSync = (p, paths) => { seenParams.push({ p, paths }); return NavlogRunSyncStub(p, paths); };
    function NavlogRunSyncStub(p, paths) { return { fireMonths: [p.seed, paths], det: p.key }; }
    const single = createSimulationJobs({ makeWorker: makeSingle, runSync, now: () => 0 });
    const pool = createSimulationJobPool({ size: 3, makeWorker: makeSingle, runSync, now: () => 0 });
    const p = { seed: 42, key: 'ret' };
    const fromSingle = await single.request(p, 2000);
    const fromPool = await pool.request(p, 2000);
    same(fromPool.result, fromSingle.result, 'the pool computes the exact same result as a lone worker for identical seeded params');
  }

  // 5) sync fallback still works end-to-end when Worker creation fails on every slot.
  {
    const { pool, syncCalls } = harness(2, { failToCreate: true });
    assert.equal(pool.hasWorker(), false, 'no slot has a worker');
    const value = await pool.request({}, 4000);
    same(value.result, { sync: true, paths: 4000 });
    same(syncCalls, [4000]);
  }

  // 6) hasWorker() reflects the pool as a whole: true as soon as at least one slot has a live worker.
  {
    const { pool } = harness(3);
    assert.equal(pool.hasWorker(), true);
  }

  console.log('analysis job pool: OK');
})().catch(error => { console.error(error); process.exit(1); });
