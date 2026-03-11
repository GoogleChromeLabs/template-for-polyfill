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
