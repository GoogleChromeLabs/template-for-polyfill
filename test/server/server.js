/**
 *  @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import fs from 'fs-extra';
import path from 'node:path';
import {Readable, Transform} from 'node:stream';

const MIME_TYPES = {
  '.js': 'text/javascript',
  '.cjs': 'text/javascript',
  '.html': 'text/html',
};

const TESTHARNESS_RE =
  /<script( +)src=(['"]?)\/wpt\/resources\/testharness\.js\2><\/script>/;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const query = Object.fromEntries(url.searchParams);

  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const root = process.cwd();
  let filePath = path.join(root, url.pathname);

  // Static file serving
  // Check if filePath is within root (avoids ../../ escaping)
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // Map any /dist/ or /static/ path to the root dist/ or static/ directory
  if (
    url.pathname.startsWith('/dist/') ||
    url.pathname.startsWith('/test/static/')
  ) {
    try {
      const content = fs.readFileSync(filePath);
      res.end(content);
    } catch (error) {
      console.error(error.stack);
      res.writeHead(500);
      res.end(error.stack);
    }
    return;
  }

  // GET /test/unit-tests/<test-name>
  if (url.pathname.startsWith('/test/unit-tests/')) {
    try {
      const content = fs.readFileSync(filePath);
      res.setHeader('Content-Type', contentType);

      if (query.delayResponse) {
        res.write(content + '\n');
        setTimeout(() => {
          res.write('</body></html>');
          res.end();
        }, Number(query.delayResponse));
      } else {
        res.end(content);
      }
    } catch (error) {
      console.error(error.stack);
      res.writeHead(500);
      res.end(error.stack);
    }
    return;
  }

  if (url.pathname.startsWith('/wpt/')) {
    fs.readFile(filePath, async (err, data) => {
      if (err) {
        if (!url.pathname.startsWith('/wpt/')) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        // Try proxying to wpt.live for /wpt/* resources
        try {
          const targetPath = url.pathname.slice(4);
          const wptUrl = `https://wpt.live${targetPath}`;
          const response = await fetch(wptUrl);

          if (!response.ok) {
            res.writeHead(404);
            res.end('Not found on WPT');
            return;
          }

          const contentType = response.headers.get('content-type');
          const cacheControl = response.headers.get('cache-control');
          res.setHeader(
            'Content-Type',
            contentType || 'application/octet-stream'
          );
          if (cacheControl) {
            res.setHeader('Cache-Control', cacheControl);
          }
          res.setHeader('Access-Control-Allow-Origin', '*');

          if (contentType && contentType.includes('text/html')) {
            const polyfillTag =
              '<script src="/dist/declarative-partial-updates-polyfill.js">' +
              '</script>';
            const testRunnerTag =
              '<script src="/test/static/log-test-results.js">' + '</script>';

            const transformer = new Transform({
              transform(chunk, encoding, callback) {
                let text = (this.remainder || '') + chunk.toString();
                // Buffer enough to ensure we don't split the replacement tags
                const keep = 1024;
                if (text.length > keep) {
                  this.remainder = text.slice(-keep);
                  let toProcess = text.slice(0, -keep);

                  toProcess = toProcess.replaceAll(
                    / src( *= *)(['"]?)\/(?!wpt\/)/g,
                    ' src$1$2/wpt/'
                  );
                  toProcess = toProcess.replaceAll(
                    / href( *= *)(['"]?)\/(?!wpt\/)/g,
                    ' href$1$2/wpt/'
                  );
                  // Inject polyfill and test runner after testharness.js
                  toProcess = toProcess.replace(
                    TESTHARNESS_RE,
                    `$& \n${polyfillTag}\n${testRunnerTag}\n`
                  );
                  // Replace scrikpt tags with defer to give polyfill a chance
                  // to run
                  toProcess = toProcess.replaceAll(
                    /<script>/g,
                    '<script defer>'
                  );

                  this.push(toProcess);
                } else {
                  this.remainder = text;
                }
                callback();
              },
              flush(callback) {
                if (this.remainder) {
                  let text = this.remainder;
                  text = text.replaceAll(
                    / src( *= *)(['"]?)\/(?!wpt\/)/g,
                    ' src$1$2/wpt/'
                  );
                  text = text.replaceAll(
                    / href( *= *)(['"]?)\/(?!wpt\/)/g,
                    ' href$1$2/wpt/'
                  );
                  text = text.replace(
                    TESTHARNESS_RE,
                    `$& \n${polyfillTag}\n${testRunnerTag}\n`
                  );
                  this.push(text);
                }
                callback();
              },
            });

            Readable.fromWeb(response.body).pipe(transformer).pipe(res);
          } else {
            // Stream the proxied content
            Readable.fromWeb(response.body).pipe(res);
          }
          return;
        } catch (proxyErr) {
          console.error('Proxy error:', proxyErr);
          res.writeHead(502);
          res.end('Proxy error');
          return;
        }
      }
      res.writeHead(200, {'Content-Type': contentType});
      res.end(data);
    });
  }
});

const port = process.env.PORT || 9090;
server.listen(port, () => {
  console.log(`Server running:\nhttp://localhost:${port}`);
});
