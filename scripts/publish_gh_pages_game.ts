// Publishes a game as a static site of its own on GitHub Pages: `node --experimental-strip-types
// scripts/publish_gh_pages_game.ts <game> [--owner <owner>]` (`yarn publish_gh_pages_game <game>`), from
// the repo's root. The owner is the GitHub owner of this repo's `origin` unless `--owner` names one.
// The game's repo is `<owner>/patchwork-<game>`, its folder `~/<owner>/patchwork-<game>`, and the game
// is played at `https://<owner>.github.io/patchwork-<game>/`. The first run makes it; every run after
// refreshes it:
//
// 1. The engine, GitHub's `outsidedata/patchwork` (`--engine` names another, or a git url or a path), is cloned
//    and copied into the folder, replacing what was there but its `.git`, its `games/` and its
//    `node_modules`, so a file the engine no longer has is gone from the game's repo too.
// 2. `games/<game>/` of this repo is copied into the folder's `games/<game>/`, as it is on the disk,
//    its baked art with it, but `__pycache__` and `.DS_Store`, replacing what was there.
// 3. `.github/workflows/deploy.yml` is written: on every push to `master` it runs `yarn` and `yarn
//    produce_static_site <game>` and publishes `dist/` to Pages.
// 4. `yarn` and `yarn produce_static_site <game>` run in the folder, so the game is seen to build
//    before it is pushed, and the build puts the game's `README.md` at the folder's root
//    (`produce_static_site.ts`), so the repo's page shows the game.
// 5. Everything is committed, `<game> on Patchwork <the engine's short sha>`, when anything changed.
// 6. A repo that is not on GitHub is made, public, with Pages deploying from the workflow and the
//    `github-pages` environment letting `master` deploy, before the first push. `master` is pushed,
//    which deploys.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

// The engine, as GitHub names it, cloned through `gh`, which signs in as the person running this; or a
// git url or a path, cloned by git.
export const ENGINE = 'outsidedata/patchwork'
const onGitHub = (engine: string) => /^[\w.-]+\/[\w.-]+$/.test(engine)

const run = (cwd: string, cmd: string, args: string[]) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
const fails = (cwd: string, cmd: string, args: string[]) => {
  try { execFileSync(cmd, args, { cwd, stdio: 'ignore' }); return false } catch { return true }
}

export const workflow = (game: string) => `name: Deploy to GitHub Pages

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: yarn
      - run: yarn install --frozen-lockfile
      - run: yarn produce_static_site ${game} --base /\${{ github.event.repository.name }}/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`

// Steps 1 to 3: the folder holding the engine, the game and the workflow. Hands back the engine's
// short sha.
export function stage(root: string, game: string, dir: string, engine: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(game)) throw new Error(`${JSON.stringify(game)} is not a game's name`)
  if (!existsSync(path.join(root, 'games', game, 'index.html'))) throw new Error(`there is no games/${game}/index.html`)
  const clone = mkdtempSync(path.join(tmpdir(), 'engine-'))
  try {
    if (onGitHub(engine)) run(clone, 'gh', ['repo', 'clone', engine, 'engine', '--', '-q', '--depth', '1'])
    else run(clone, 'git', ['clone', '-q', engine, 'engine'])
    const from = path.join(clone, 'engine')
    const sha = run(from, 'git', ['rev-parse', '--short=7', 'HEAD'])
    mkdirSync(dir, { recursive: true })
    for (const name of readdirSync(dir)) if (!['.git', 'games', 'node_modules'].includes(name)) rmSync(path.join(dir, name), { recursive: true, force: true })
    run(root, 'rsync', ['-a', '--exclude', '/.git', '--exclude', '/games', `${from}/`, `${dir}/`])
    mkdirSync(path.join(dir, 'games'), { recursive: true })
    run(root, 'rsync', ['-a', '--delete', '--exclude', '__pycache__', '--exclude', '.DS_Store', `${path.join(root, 'games', game)}/`, `${path.join(dir, 'games', game)}/`])
    mkdirSync(path.join(dir, '.github/workflows'), { recursive: true })
    writeFileSync(path.join(dir, '.github/workflows/deploy.yml'), workflow(game))
    return sha
  } finally {
    rmSync(clone, { recursive: true, force: true })
  }
}

// Step 5: everything committed when anything changed. Hands back whether a commit was made.
export function commit(dir: string, game: string, sha: string): boolean {
  if (!existsSync(path.join(dir, '.git'))) run(dir, 'git', ['init', '-q', '-b', 'master'])
  run(dir, 'git', ['add', '-A'])
  if (!run(dir, 'git', ['status', '--porcelain'])) return false
  run(dir, 'git', ['commit', '-q', '-m', `${game} on Patchwork ${sha}`])
  return true
}

// Step 6: the repo made on GitHub when it is not there, and `master` pushed.
export function push(dir: string, repo: string) {
  if (fails(dir, 'gh', ['repo', 'view', repo])) {
    run(dir, 'gh', ['repo', 'create', repo, '--public', '--source', dir, '--remote', 'origin'])
    run(dir, 'gh', ['api', '-X', 'POST', `repos/${repo}/pages`, '-f', 'build_type=workflow'])
    const policies = `repos/${repo}/environments/github-pages/deployment-branch-policies`
    const had = JSON.parse(run(dir, 'gh', ['api', policies])).branch_policies as { id: number; name: string }[]
    if (!had.some(p => p.name === 'master')) run(dir, 'gh', ['api', '-X', 'POST', policies, '-f', 'name=master', '-f', 'type=branch'])
    for (const p of had.filter(p => p.name !== 'master')) run(dir, 'gh', ['api', '-X', 'DELETE', `${policies}/${p.id}`])
  } else if (fails(dir, 'git', ['remote', 'get-url', 'origin'])) {
    run(dir, 'git', ['remote', 'add', 'origin', `git@github.com:${repo}.git`])
  }
  run(dir, 'git', ['push', '-q', '-u', 'origin', 'master'])
}

// The GitHub owner of the repo's `origin`, from its url.
export function ownerOf(root: string): string {
  const url = run(root, 'git', ['remote', 'get-url', 'origin'])
  const m = url.match(/github\.com[:/]([^/]+)\//)
  if (!m) throw new Error(`origin is ${url}, not a GitHub repo: name the owner with --owner`)
  return m[1]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ options: { owner: { type: 'string' }, engine: { type: 'string', default: ENGINE } }, allowPositionals: true })
    const root = process.cwd()
    const game = positionals[0] ?? ''
    const owner = values.owner ?? ownerOf(root)
    const name = `patchwork-${game}`
    const dir = path.join(homedir(), owner, name)
    const sha = stage(root, game, dir, values.engine)
    execFileSync('yarn', ['install', '--frozen-lockfile'], { cwd: dir, stdio: 'inherit' })
    execFileSync('yarn', ['produce_static_site', game, '--base', `/${name}/`], { cwd: dir, stdio: 'inherit' })
    const committed = commit(dir, game, sha)
    push(dir, `${owner}/${name}`)
    console.log(`${committed ? 'published' : 'nothing changed in'} ${dir}: https://github.com/${owner}/${name}, played at https://${owner}.github.io/${name}/`)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
}
