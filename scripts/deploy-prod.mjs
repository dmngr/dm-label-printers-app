/** Publishes the built customer app to its existing S3/CloudFront target.
 * Preserve older hashed chunks for open sessions. Every write rechecks the
 * frozen account identity; version.json identifies the exact public release.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFrozenAws } from './frozen-aws.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version;
const directory = path.join(repo, 'dist/dm-label-printers-app/browser');
if (!fs.existsSync(path.join(directory, 'index.html'))) throw new Error('Build the production app first');
fs.writeFileSync(path.join(directory, 'version.json'), JSON.stringify({ version }) + '\n');
const aws = createFrozenAws();
aws(['s3api', 'head-bucket', '--bucket', 'dm-label-printers-app', '--expected-bucket-owner', '787324535455']);
aws(['s3', 'sync', directory, 's3://dm-label-printers-app', '--cache-control', 'public, max-age=0'], { json: false });
const invalidation = aws(['cloudfront', 'create-invalidation', '--distribution-id', 'E15UYTBZU09NW', '--paths', '/index.html', '/version.json']);
aws.verifyIdentity();
console.log(JSON.stringify({ uploadedVersion: version, invalidationId: invalidation.Invalidation.Id }));
