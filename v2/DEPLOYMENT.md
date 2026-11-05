# Sofreh web deployment

## Current state

- GitHub source: `Mehrdad-KHE/sofreh`, branch `main`.
- Last GitHub commit: `ea41201`.
- Web app source: this `v2` directory.
- Customer preview: `/preview/customer`.
- Cook preview: `/preview/cook`.
- Health check: `/api/health`.

The local Vercel adapter is `api/index.mjs`; `vercel.json` routes all web paths
through the existing Sofreh HTTP server. This preserves the customer/cook
preview behavior while using a Vercel Node function.

## How updates become visible

The current temporary deployment was built from the local workspace. It is not
connected to GitHub, so later edits will not appear there automatically.

For a durable workflow, the owner must connect the GitHub repository to a Vercel
project. After that, each push to `main` can create a deployment (or a Preview
deployment for another branch/PR). The safe sequence is:

1. Run the tests and structural validator in `v2`.
2. Commit the adapter/config changes and future app changes.
3. Push the approved commit to GitHub.
4. Let Vercel build the selected branch and review the deployment URL.

## Data limitation

The app currently uses synthetic demo fixtures and SQLite. The Vercel function
uses `/tmp/sofreh-stage1.sqlite`, which is ephemeral and can differ between
instances. It must not receive real customers, addresses, orders, credentials,
or payment data. Persistent production data would require a separately approved
database and authentication design.

## Required owner approval

Connecting GitHub to Vercel, authorizing a Vercel account, pushing commits, or
introducing persistent storage changes external state and requires explicit
owner approval. No credential or integration was created by this setup.
