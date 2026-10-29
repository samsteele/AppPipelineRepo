# AppPipelineRepo

A minimal CodePipeline (V2) that builds one web page from three GitHub repos:

| Repo            | Triggers the pipeline on |
| --------------- | ------------------------ |
| AppPipelineRepo | push to `main`           |
| TriggerRepoA    | push of a `v*` tag       |
| TriggerRepoB    | push of a `v*` tag       |

The page always shows `content.txt` from the **highest `v*` tag** of each
trigger repo, whichever repo started the run.

## Layout

```
render.mjs     builds dist/index.html from the two trigger repos
buildspec.yml  CodeBuild entry point, runs render.mjs
infra/         CDK app: connection, pipeline, S3 website
```

## Run locally

With TriggerRepoA and TriggerRepoB cloned next to this repo:

```bash
node render.mjs && open dist/index.html
```

## Deploy

```bash
cd infra
npm install
npx cdk deploy -c githubOwner=<your-github-user>
```

The deploy creates the CodeConnections connection in the `PENDING` state.
Approve it once in the console under **Developer Tools → Settings →
Connections**, then choose **Release change** on the pipeline. Open the
`SiteUrl` stack output to see the page.

## Try it

```bash
# In TriggerRepoA: edit content.txt, then release it
git commit -am "New copy" && git tag v1.1.0 && git push origin main v1.1.0
```

Pushing to `main` alone in a trigger repo does nothing.

## More than five sources

A CodeBuild action takes at most 5 input artifacts. `Render` uses 3
(this repo plus two trigger repos), so it fits two more trigger repos.
Past that, add a fan-in step:

```
Source    Collect (parallel)          Render                 Deploy
  A ─┐
  …  ├──▶ Collect1 ─▶ releases1 ─┐
  E ─┘                           │
  F ─┐                           ├──▶ Render ─▶ dist ─▶ Publish
  …  ├──▶ Collect2 ─▶ releases2 ─┘      ▲
  J ─┘                                  │
  AppPipelineRepo ──────────────────────┘
```

- **Collect actions** each take up to 5 full-clone trigger repos and run
  the `latestRelease` lookup, writing `{ repo, tag, copy }` records to a
  small JSON artifact. Give them an inline buildspec
  (`BuildSpec.fromObject`) so they don't need this repo as an input, which
  frees all 5 slots for trigger repos. Run them in parallel in their own
  stage, or in the Build stage with `runOrder: 1`.
- **Render** takes this repo plus up to 4 Collect artifacts and reads the
  JSON from `$CODEBUILD_SRC_DIR_<artifact>`, so it no longer runs git
  itself. Only Collect actions need `codeBuildCloneOutput`.
- **Capacity** at two levels is 4 × 5 = 20 trigger repos. Beyond that, add
  another Collect level, or merge JSON before Render.
- Artifact names must be unique across the pipeline, because they become the
  `CODEBUILD_SRC_DIR_*` variable names.
- Triggers don't change. Each trigger repo still has its own source action
  and `v*` tag filter.
