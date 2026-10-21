// PROPOSAL for the "scripts" of the package.json of the fork (the branch qa/matrix does
// NOT touch the package.json).
//
// The scripts of the fork are already:
//
//     "build": "tsc",
//     "test": "vitest run",
//     "test:integration": "vitest run --config vitest.integration.config.mts",
//     "test:coverage": "vitest run --coverage",
//     "typecheck": "tsc --noEmit -p tsconfig.test.json",
//     "qa:contract": "vitest run test/qa/contract-matrix.test.ts",
//     "qa:compat": "vitest run test/qa/compat-1.0.6.test.ts",
//     "qa:live": "vitest run --config vitest.integration.config.mts test/integration/live-matrix.test.ts",
//     "prepublishOnly": "npm run build"
//
// The QA layer of qa/ is a suite of node:test, not of vitest, on purpose: it has to run
// without a single new dependency, against the BUILT package (dist/), and the live suite
// has to be able to run alone, on the machine of the owner, without the whole tool chain.
// The two runners therefore coexist: vitest stays the unit suite of the package, and the
// QA suite of qa/ is a gate of its own.
//
// The names below do NOT collide with the "qa:contract", "qa:compat" and "qa:live" of the
// package.json, which belong to the gate of the Dev team (test/qa/ and test/integration/).
// The "matrix:" prefix says which layer the script belongs to.
//
// Add these four scripts next to the ones that are already there:
//
//     "qa:matrix:contract": "node --test qa/contract.test.js",
//     "qa:matrix:compat": "node qa/compat-check.js",
//     "qa:matrix:live": "node --test qa/live.test.js",
//     "qa:matrix:all": "npm run build && npm run qa:matrix:contract && npm run qa:matrix:compat"
//
// Notes:
//  - "qa:matrix:contract" and "qa:matrix:compat" need `npm run build` first: both read
//    dist/. The "qa:matrix:all" script does the build for you.
//  - "qa:matrix:live" does NOTHING without the environment variable OLX_LIVE=1: every test
//    that talks to the network is skipped. Without it, the live suite is a no-op.
//  - None of the QA scripts publishes anything, and none of them needs a secret.
