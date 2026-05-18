/**
 *  @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 1. Hook into individual test results
// eslint-disable-next-line no-undef
add_result_callback(function (test) {
  console.log(`Subtest finished: ${test.name}`);
  console.log(`Status: ${test.status} (0=PASS, 1=FAIL, 2=TIMEOUT, 3=NOTRUN)`);
  if (test.message) {
    console.log(`Error message: ${test.message}`);
  }
});

// 2. Hook into the final completion
// eslint-disable-next-line no-undef
add_completion_callback(function (tests) {
  console.log('--- All tests complete ---');
  console.log('Total tests run:', tests.length);
  const passed = tests.filter((t) => t.status === 0).length;
  console.log(`Passed: ${passed} / ${tests.length}`);
  window.testActual = passed;
  window.testExpected = tests.length;
});
