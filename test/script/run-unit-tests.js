/**
 *  @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert';
import yargs from 'yargs/yargs';
import {hideBin} from 'yargs/helpers';

const argv = yargs(hideBin(process.argv)).parse();
const testsFilter = argv.tests;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const unitTestsDir = path.resolve(__dirname, '../unit-tests');

describe('Declarative Partial Updates Polyfill Unit Tests', function () {
  const files = fs.readdirSync(unitTestsDir).filter((file) => {
    return (
      file.endsWith('.html') && (!testsFilter || file.includes(testsFilter))
    );
  });

  files.forEach((file) => {
    it(`should pass ${file}`, async () => {
      const urlPath = `http://localhost:9090/test/unit-tests/${file}`;

      await browser.url(urlPath);

      // In Firefox and Safari, if the global PageLoadStrategy is set to
      // "none", then it's possible that `browser.url()` will return before the
      // navigation has started and the old page will still be around, so we
      // have to manually wait until the URL matches the passed URL. Note that
      // this can still fail if the prior test navigated to a page with the
      // same URL.
      if (browser.capabilities.browserName !== 'chrome') {
        await browser.waitUntil(
          async () => {
            // Get the URL from the browser and webdriver to ensure the page has
            // actually started to load.
            const url = await browser.execute(() => location.href);

            return url.endsWith(urlPath);
          },
          {interval: 50}
        );
      }

      // Wait for testActual to be present
      await browser.waitUntil(
        async () => {
          return await browser.execute(() => window.testActual !== undefined);
        },
        {
          timeout: 5000,
          timeoutMsg: `Timed out waiting for testActual in ${file}`,
        }
      );

      const testActual = await browser.execute(() => window.testActual);
      const testExpected = await browser.execute(() => window.testExpected);

      assert.strictEqual(testActual, testExpected, `Mismatch in ${file}`);
    });
  });
});
