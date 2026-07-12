# DM Label Printer — Customer App

Customer-facing companion to the native DM Label Printer Windows app. Pair your
device, then operate and monitor it from any browser at
**[https://app.label.ninja](https://app.label.ninja)**.

**Status**: customer pairing and device views are live. The native app can open
`/#/login?code=XXXX-XXXX` from a QR code; the login page validates and prefills
the code, while the customer still selects Connect before the one-time claim.
See
[docs/app-label-ninja-design.md](https://github.com/dmngr/label-printers-panel/blob/main/docs/app-label-ninja-design.md)
in the cloud repo for the full plan.

## Stack

- Angular 21 (standalone components, signals)
- Node.js 24.11.1 (pinned in `.nvmrc` and CI)
- HttpClient with bearer interceptor + auth guard
- Build: `ng build` → static SPA → S3 + CloudFront
- Auth: per-customer pairing token in `localStorage` (one token per customer
  account, scoped server-side to a list of stores)

## Architectural decisions

Locked in `docs/app-label-ninja-design.md` (cloud repo). Highlights:

1. **Device is source of truth.** Cloud is a read-only mirror; web edits are
   issued as commands → device applies them → device pushes new state back.
2. **Per-customer bearer, not Cognito.** Pairing-code exchange grants a
   long-lived token scoped to one or more `Group` (= store) values.
3. **Reuses existing cloud pipeline.** `catalog-sync`, `printjob-sync`, and
   `system-summary` Lambdas already mirror device state; the customer app
   reads from the same tables and writes commands to the same queue
   `CloudRemoteCommandService` polls.
4. **Job-level live monitoring**, not fine-grained UI events.

## Local development

```bash
npm install
npm start              # ng serve on http://localhost:4200
npm run check          # pairing tests + production build + production audit
```

Login accepts either manual `XXXX-XXXX` entry or a validated QR deep link:
`https://app.label.ninja/#/login?code=XXXX-XXXX`.

## Deploy

```bash
npm run deploy:prod    # → s3://dm-label-printers-app + CloudFront invalidation
```

`build:prod` → `aws s3 sync --delete --cache-control "public, max-age=0"` →
`aws cloudfront create-invalidation --paths "/index.html"`. Hash-suffixed
JS/CSS bundles do not need invalidation (filename changes per build); only
`index.html` does because it points at the latest bundle hashes.

### URLs

| Env  | CloudFront ID    | Live URL                       | Default URL                          |
|------|------------------|--------------------------------|--------------------------------------|
| Prod | `E15UYTBZU09NW`  | **https://app.label.ninja**    | https://d1kx5it4k7t50d.cloudfront.net |

A dev environment will be added (`appdev.label.ninja`, mirroring `paneldev`)
once the Lambda is ready and we want a separate test surface.

### Custom domain (already wired)

`app.label.ninja` is fronted by:

- ACM wildcard cert `*.label.ninja` (us-east-1):
  `arn:aws:acm:us-east-1:787324535455:certificate/62c5ecf6-6b1f-4060-80d4-084f7cd16f55`
- DNS: Cloudflare zone `label.ninja` (zone ID
  `3b0b9abe066343ba4a9f9e60f19d9e4a`), CNAME `app` →
  `d1kx5it4k7t50d.cloudfront.net`, **DNS-only** (not proxied).

### Infrastructure (one-time setup, already done)

- S3 bucket `dm-label-printers-app` in `eu-west-1` with public-read
  `s3:GetObject` policy and static-website hosting (`index.html` as both index
  and error doc — works with the app hash routing).
- CloudFront `E15UYTBZU09NW`, `PriceClass_100`, HTTP/2+3, redirect-to-HTTPS,
  default 24h TTL, no logging. Origin is the **S3 website endpoint**
  (`<bucket>.s3-website-eu-west-1.amazonaws.com`) configured as a
  `CustomOrigin` with `OriginProtocolPolicy: http-only`, `DefaultRootObject`
  empty — same pattern as the panel/paneldev distributions.

## Auth

Per-customer bearer in `localStorage` (`dmLabelPrinterApp.bearerToken`).
Threat model:

- Bucket allows only `GetObject` publicly (no `PutObject`); CloudFront serves
  the bundles. There is no admin path through the customer app — admin tooling
  lives at `panel.label.ninja`.
- Token is scoped server-side to specific stores. A leak only exposes the
  associated store(s) — no cross-customer or admin data is reachable.
- Recovery: customer regenerates a pairing code from the device; admin can
  revoke any token from the device `Unpair browsers` tab.
- Sign-out wipes localStorage (token still valid in another browser until
  revoked server-side).

The interceptor scopes the bearer to a configured `CUSTOMER_API_BASE` so a
token leak via an accidentally-fired request to a third-party host (e.g. a
future analytics SDK) is structurally prevented. Empty in Phase 0 — set the
constant in `src/app/services/auth.interceptor.ts` once the Lambda Function
URL is known.
