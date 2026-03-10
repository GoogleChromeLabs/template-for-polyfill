/**
 *  @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import fs from 'fs-extra';
import path from 'node:path';

const MIME_TYPES = {
  '.js': 'text/javascript',
  '.cjs': 'text/javascript',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const query = Object.fromEntries(url.searchParams);

  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const root = process.cwd();
  const filePath = path.join(root, url.pathname);

  // GET /test/:view - render nunjucks template
  const viewMatch = url.pathname.match(/^\/test\/unit-tests\/([^/]+)$/);
  if (req.method === 'GET' && viewMatch) {
    try {
      const content = fs.readFileSync(filePath);
      res.setHeader('Content-Type', 'text/html');

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

  // Static file serving
  // Check if filePath is within root
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {'Content-Type': contentType});
    res.end(data);
  });
});

const port = process.env.PORT || 9090;
server.listen(port, () => {
  console.log(`Server running:\nhttp://localhost:${port}`);
});
