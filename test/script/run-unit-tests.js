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
      const filePath = path.join(unitTestsDir, file);
      const fileUrl = `file://${filePath}`;

      await browser.url(fileUrl);

      // Wait for testResults to be present
      await browser.waitUntil(
        async () => {
          return await browser.execute(() => window.testActual !== undefined);
        },
        {
          timeout: 5000,
          timeoutMsg: `Timed out waiting for testResults in ${file}`,
        }
      );

      const testActual = await browser.execute(() => window.testActual);
      const testExpected = await browser.execute(() => window.testExpected);

      assert.strictEqual(testActual, testExpected, `Mismatch in ${file}`);
    });
  });
});
