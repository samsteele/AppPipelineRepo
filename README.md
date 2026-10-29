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
