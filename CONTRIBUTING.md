# Contributing to Star Fit

## Creating Issues

If you find any bugs or have a feature request, please [create an issue](https://github.com/hpi25/krabbe/issues/new/choose).

## Local Development

This is a guide on getting Star Fit working locally for development purposes. You should first follow this if you're thinking of making a [pull request](#pull-requests).

Note: if you'd like to get Star Fit running because you want to have your own instance, please instead follow the [self-hosting](./DEPLOYMENT.md) guide.

### Software

Star Fit is written using Rust (for the API) and Next.js (for the frontend). Before you begin, you'll need to make sure you have the required software installed:

| Software | Installation instructions |
| --- | --- |
| git | You'll need git to clone the repository. You likely already have it if you're on MacOS, otherwise see the [git site](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git). |
| node | Version 26 or newer is required. I recommend using `nvm` or `fnm` to manage multiple node versions (the `frontend` folder has an `.nvmrc`), but you can also install directly from the [node.js website](https://nodejs.org/en/download). |
| yarn | Yarn 4 is used, pinned by the `packageManager` field in `frontend/package.json`. Run `npm install --global corepack` then `corepack enable` to have the correct version picked up automatically. |
| rust | You can install rust by following the directions on the [rust website](https://www.rust-lang.org/tools/install). The API builds with nightly Rust, which `rustup` will install automatically from `api/rust-toolchain.toml`. |

### Setup

1. Clone the repository.
2. Run `cargo run` in the `api` folder to build and start the API.
3. Run `yarn` in `frontend` folder to install dependencies, then `yarn dev` to start the dev server.

By default, the API will start at http://localhost:3000, and the frontend will be available at http://localhost:1234.

#### Code Documentation

For code-specific documentation, please see the README files in the repo.

### Browser Extension

The browser extension lives in `browser-extension/` and is a TypeScript Manifest V3 Firefox extension. It needs Node 26 and Yarn 4 (pinned via `packageManager`), so enable corepack first:

```sh
cd browser-extension
corepack enable
yarn install
yarn build
```

`yarn build` writes the extension to `browser-extension/dist/firefox`.

To load it into Firefox:

1. Open `about:debugging`, then go to **This Firefox**.
2. Click **Load Temporary Add-on...** and select `browser-extension/dist/firefox/manifest.json`.
3. Open the extension's settings tab and set the krabbe URL to `http://localhost:1234`.
4. Add a CalDAV test account. A local [Radicale](https://radicale.org/) server works well. For local testing, run it with authentication disabled (any username and password is accepted, and the username becomes the account). Create a config file `radicale-config` with:

   ```ini
   [server]
   hosts = 0.0.0.0:5232

   [auth]
   type = none
   ```

   and start the container with it mounted:

   ```sh
   docker run -p 5232:5232 -v "$PWD/radicale-config:/config/config:ro" tomsquest/docker-radicale
   ```

   Then add an account with server URL `http://localhost:5232` and any username and password, for example `test` / `test`.

   Firefox match patterns can't contain a port, so the extension asks for `http://localhost/*`, which covers both krabbe on `:1234` and the CalDAV server on `:5232`. `https://krabbe.hpi.church/*` is granted at install, so production works without visiting the settings page.

After rebuilding, click **Reload** on the extension in `about:debugging` to pick up the changes.

Checks that CI also runs (from `browser-extension/`):

```sh
yarn install --immutable
yarn typecheck
yarn test
yarn build
```

## Pull Requests

Before starting a pull request, first check if there's an issue open that your pull request will resolve. If there isn't, please create one to give the community a chance to comment, and also to prevent others from working on similar pull requests that will conflict with yours.

Mention the issue you are closing at the top of your PR like so:
```
Closes #123

[describe your PR...]
```

## Git Branch Conventions

`main`
Production branch. Do not commit directly to this branch.

`feat/*`
Prefix new feature branches with feat. When complete, submit a PR into main.

`fix/*`
When fixing a bug, prefix branches with fix. When complete, submit a PR into main.

`refactor/*`
For refactoring code. When complete, submit a PR into main.

`chore/*`
For chores like adding type checking, setting up CI, fixing typos etc. When finished, submit a PR into main.

`docs/*`
Used when updating documentation such as README files. When finished, submit a PR into main.
