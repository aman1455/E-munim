// scripts/remote-rules-sync-test.mjs
// Verifies dynamic remote rule sync, temporal HSN resolution, and Vercel endpoint

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  setActiveRules,
  getActiveRules,
  resolveHsnOverride,
  checkTdsTcsStatus,
  getActiveBanners,
  getComplianceNotices
} from '../src/utils/remoteRules.js';
import { suggestGstRate, autoFillRate } from '../src/utils/hsnRates.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log('================================================================');
console.log('  TESTING: REMOTE RULES DYNAMIC RESOLUTION & VERCEL HUB');
console.log('================================================================\n');

// 1. Load actual remote-state.json
const remoteStatePath = 'D:/Self/license genrator/data/remote-state.json';
assert(fs.existsSync(remoteStatePath), 'remote-state.json exists in license generator');

const remoteData = JSON.parse(fs.readFileSync(remoteStatePath, 'utf8'));
setActiveRules(remoteData);

assert(getActiveRules()?.version === remoteData.version, 'Active rules set successfully in memory');

// 2. Temporal HSN Resolution Tests
console.log('\n--- Temporal HSN Overrides ---');

// HSN 9503 (Toys)
const toysPast = resolveHsnOverride('9503', '2025-09-21');
assert(toysPast && JSON.stringify(toysPast.rates) === JSON.stringify([12, 18]), 'HSN 9503 past date returns [12, 18]');

const toysPresent = resolveHsnOverride('9503', '2025-09-22');
assert(toysPresent && JSON.stringify(toysPresent.rates) === JSON.stringify([5, 18]), 'HSN 9503 effective date returns [5, 18]');

// HSN 4809 (Sublimation paper)
const paperPast = resolveHsnOverride('4809', '2026-10-27');
assert(paperPast && JSON.stringify(paperPast.rates) === JSON.stringify([12, 18]), 'HSN 4809 past date reflects disputed [12, 18]');

const paperCurrent = resolveHsnOverride('4809', '2026-10-28');
assert(paperCurrent && paperCurrent.rate === 18, 'HSN 4809 effective date resolves to single 18% rate');

// HSN 3101 (Bio-stimulants)
const fertCurrent = resolveHsnOverride('3101', '2026-10-28');
assert(fertCurrent && fertCurrent.rate === 5, 'HSN 3101 effective date resolves to single 5% rate');

// 3. Integration with hsnRates.js (suggestGstRate & autoFillRate)
console.log('\n--- hsnRates.js Integration ---');
assert(autoFillRate('4809', '2026-10-28') === 18, 'autoFillRate 4809 on current date fills 18');
assert(autoFillRate('3101', '2026-10-28') === 5, 'autoFillRate 3101 on current date fills 5');
assert(autoFillRate('9503', '2025-09-22') === null, 'autoFillRate 9503 returns null (dual rates 5/18 require user choice)');
assert(suggestGstRate('9503', '2025-09-22')?.rates?.length === 2, 'suggestGstRate 9503 provides dual rate hint');

// Non-overridden standard code falls back to static table
assert(autoFillRate('8471') === 18, 'Standard code 8471 falls back to built-in table (18%)');

// 4. Section 206C(1H) Abolition Check
console.log('\n--- Section 206C(1H) Abolition ---');
const tcsActive = checkTdsTcsStatus('206C(1H)', '2025-03-31');
assert(tcsActive && !tcsActive.isCurrentlyAbolished, 'Section 206C(1H) on 2025-03-31 is not abolished');

const tcsAbolished = checkTdsTcsStatus('206C(1H)', '2025-04-01');
assert(tcsAbolished && tcsAbolished.isCurrentlyAbolished, 'Section 206C(1H) on 2025-04-01 is marked abolished');

// 5. Banners & Notices
console.log('\n--- Notices & Banners ---');
const banners = getActiveBanners();
assert(Array.isArray(banners) && banners.length > 0, 'Active banners loaded');
assert(banners[0].id === 'banner-tcs-206c-1h-abolition', 'TCS abolition banner verified');

const notices = getComplianceNotices();
assert(Array.isArray(notices) && notices.length > 0, 'Compliance notices loaded');

// 6. Test Vercel sync endpoint handler
console.log('\n--- Vercel Sync Handler ---');
const syncHandlerModule = await import('file:///D:/Self/license%20genrator/api/sync.js');
const syncHandler = syncHandlerModule.default;
assert(typeof syncHandler === 'function', 'Vercel sync.js exports handler function');

let handledStatus = 0;
let handledData = null;
const mockReq = { method: 'GET' };
const mockRes = {
  setHeader: () => {},
  status: (code) => {
    handledStatus = code;
    return {
      json: (data) => { handledData = data; }
    };
  }
};

await syncHandler(mockReq, mockRes);
assert(handledStatus === 200, 'Vercel sync handler returns HTTP 200');
assert(handledData && handledData.version === remoteData.version, 'Vercel sync handler serves valid remote-state.json');

console.log('\n================================================================');
console.log(`RESULTS: Passed: ${passed} | Failed: ${failed}`);
console.log('================================================================');

if (failed > 0) process.exit(1);
