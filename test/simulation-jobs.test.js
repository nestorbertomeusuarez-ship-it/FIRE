// Unit tests of the worker job manager (createSimulationJobs) with fake workers: superseded
// long runs terminate and recreate the worker, calibration jobs survive, stale output is ignored.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/fake-app.js');

// Objects created inside the page's vm context have another realm's prototypes: compare by value.
const same = (actual, expected, message) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message);

(async () => {
  const app = await loadApp();
  const createSimulationJobs = app.run('createSimulationJobs');
  assert.equal(typeof createSimulationJobs, 'function');

  function harness(options = {}) {
    const workers = [];
    const makeWorker = () => {
      if (options.failToCreate) throw new Error('no Worker here');
      const worker = { posted: [], terminated: false, onmessage: null, onerror: null,
        postMessage(message) { if (options.postThrows) throw new Error('clone failed'); this.posted.push(message); },
        terminate() { this.terminated = true; } };
      workers.push(worker); return worker;
    };
    const syncCalls = [];
    let clock = 0;
    const jobs = createSimulationJobs({ makeWorker, runSync: (p, paths) => { syncCalls.push(paths); return { sync: true, paths }; }, now: () => clock++, minTerminatePaths: 1000 });
    const answer = (worker, reqId, calibrate = false) => worker.onmessage({ data: { result: { from: workers.indexOf(worker), reqId }, reqId, calibrate, ms: 5 } });
    return { jobs, workers, syncCalls, answer };
  }
  const settled = promise => { const box = { state: 'pending' }; promise.then(value => { box.state = 'resolved'; box.value = value; }, error => { box.state = 'rejected'; box.error = error; }); return box; };
  const tick = () => new Promise(resolve => setImmediate(resolve));

  // 1) plain flow
  {
    const { jobs, workers, answer } = harness();
    assert.equal(jobs.hasWorker(), true); assert.equal(workers.length, 1);
    const first = settled(jobs.request({ a: 1 }, 5000)); await tick();
    same(workers[0].posted, [{ p: { a: 1 }, paths: 5000, reqId: 1, calibrate: false }]);
    answer(workers[0], 1); await tick();
    assert.equal(first.state, 'resolved'); same(first.value.result, { from: 0, reqId: 1 });
    assert.equal(jobs.restarts(), 0); assert.equal(jobs.pendingCount(), 0);
  }

  // 2) a newer full run supersedes a long running one: old resolves stale at once, worker is replaced, stale output ignored
  {
    const { jobs, workers, answer } = harness();
    const older = settled(jobs.request({ v: 'old' }, 5000)); await tick();
    const newer = settled(jobs.request({ v: 'new' }, 5000)); await tick();
    assert.equal(older.state, 'resolved'); same(older.value, { stale: true }, 'the superseded job resolves immediately as stale');
    assert.equal(workers[0].terminated, true, 'the busy worker is terminated');
    assert.equal(workers.length, 2, 'and a fresh worker is created');
    assert.equal(jobs.restarts(), 1);
    same(workers[1].posted.map(m => m.reqId), [2], 'only the newer job is posted to the new worker');
    answer(workers[0], 1); await tick();                       // a late message from the killed worker
    assert.equal(newer.state, 'pending', 'output of the terminated worker is ignored');
    answer(workers[1], 2); await tick();
    assert.equal(newer.state, 'resolved'); same(newer.value.result, { from: 1, reqId: 2 });
  }

  // 3) cheap previews superseding each other never restart the worker
  {
    const { jobs, workers } = harness();
    const first = settled(jobs.request({}, 250)); await tick();
    jobs.request({}, 250); await tick();
    assert.equal(first.state, 'resolved'); same(first.value, { stale: true });
    assert.equal(workers.length, 1); assert.equal(workers[0].terminated, false); assert.equal(jobs.restarts(), 0);
  }

  // 4) calibration (never stale) jobs survive a restart and are re-posted
  {
    const { jobs, workers, answer } = harness();
    const calibration = settled(jobs.request({ c: 1 }, 900, { calibrate: true })); await tick();
    const older = settled(jobs.request({}, 5000)); await tick();
    const newer = settled(jobs.request({}, 5000)); await tick();
    assert.equal(older.value.stale, true);
    assert.equal(calibration.state, 'pending', 'the calibration job is not resolved stale');
    same(workers[1].posted.map(m => [m.reqId, m.calibrate]), [[1, true], [3, false]], 'calibration job re-posted, in order, before the new run');
    answer(workers[1], 1, true); answer(workers[1], 3); await tick();
    assert.equal(calibration.state, 'resolved'); assert.equal(newer.state, 'resolved');
    assert.equal(jobs.pendingCount(), 0);
  }

  // 5) a calibration request never supersedes anything
  {
    const { jobs, workers } = harness();
    const full = settled(jobs.request({}, 5000)); await tick();
    jobs.request({}, 900, { calibrate: true }); await tick();
    assert.equal(full.state, 'pending'); assert.equal(workers.length, 1); assert.equal(jobs.restarts(), 0);
  }

  // 6) worker crash: everything in flight finishes on the main thread
  {
    const { jobs, workers, syncCalls } = harness();
    const running = settled(jobs.request({}, 3000)); await tick();
    workers[0].onerror({ message: 'boom' }); await tick();
    assert.equal(running.state, 'resolved'); same(running.value.result, { sync: true, paths: 3000 });
    assert.equal(jobs.hasWorker(), false); same(syncCalls, [3000]);
    const later = settled(jobs.request({}, 10)); await tick();
    assert.equal(later.state, 'resolved'); same(syncCalls, [3000, 10], 'later requests run synchronously');
  }

  // 7) no Worker support at all, and a postMessage that throws
  {
    const { jobs, syncCalls } = harness({ failToCreate: true });
    assert.equal(jobs.hasWorker(), false);
    const value = await jobs.request({}, 4000);
    same(value.result, { sync: true, paths: 4000 }); same(syncCalls, [4000]);
  }
  {
    const { jobs, syncCalls } = harness({ postThrows: true });
    const value = await jobs.request({}, 500);
    same(value.result, { sync: true, paths: 500 }, 'a failed postMessage falls back to the main thread'); same(syncCalls, [500]);
    assert.equal(jobs.pendingCount(), 0);
  }

  // 8) a throwing synchronous simulation rejects the request (instead of hanging)
  {
    const failing = createSimulationJobs({ makeWorker: () => { throw new Error('none'); }, runSync: () => { throw new RangeError('parametros'); }, now: () => 0 });
    await assert.rejects(failing.request({}, 10), /parametros/);
  }
  console.log('simulation jobs: OK');
})().catch(error => { console.error(error); process.exit(1); });
