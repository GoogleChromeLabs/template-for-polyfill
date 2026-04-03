/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://wpt.live/html/dom/partial-updates/';
const OUTPUT_FILE = path.resolve(__dirname, '../config/wpts.json');

/**
 * Recursively fetches WPT entries and finds files starting with "template".
 */
async function fetchWpts(relativePath = '') {
  const url = `${BASE_URL}${relativePath}`;
  console.log(`Fetching ${url}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  const html = await response.text();

  const foundFiles = [];

  // Match files
  const fileRegex =
    /<li class="files?">.*?<a [^>]*href="([^"]+)"[^>]*>.*?<\/li>/g;
  let match;
  while ((match = fileRegex.exec(html)) !== null) {
    const filename = match[1];
    if (filename.startsWith('template') && filename.endsWith('.html')) {
      foundFiles.push(path.join(relativePath, filename));
    }
  }

  // Match directories
  const dirRegex =
    /<li class="dir">.*?<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/li>/g;
  const dirsToRecurse = [];
  while ((match = dirRegex.exec(html)) !== null) {
    const href = match[1];
    const text = match[2];

    // Ignore parent directory and hidden dirs
    if (
      text === '..' ||
      href.startsWith('/') ||
      href.startsWith('http') ||
      href.startsWith('resources')
    ) {
      continue;
    }

    dirsToRecurse.push(href);
  }

  for (const dir of dirsToRecurse) {
    const subFiles = await fetchWpts(path.join(relativePath, dir));
    foundFiles.push(...subFiles);
  }

  return foundFiles;
}

async function syncWpts() {
  try {
    const allFiles = await fetchWpts();

    // Ensure unique filenames and sort them
    const uniqueFiles = [...new Set(allFiles)].sort();

    console.log(`Found ${uniqueFiles.length} template files in total.`);

    // Ensure the directory exists
    await fs.mkdir(path.dirname(OUTPUT_FILE), {recursive: true});

    await fs.writeFile(
      OUTPUT_FILE,
      JSON.stringify(uniqueFiles, null, 2) + '\n'
    );
    console.log(`Updated ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('Error syncing WPTs:', error);
    process.exit(1);
  }
}

syncWpts();
