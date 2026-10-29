// Renders dist/index.html showing the latest v* release of each trigger repo.
//
// CodePipeline checks out branch HEAD for any trigger repo that did NOT start
// the run, so we read content.txt from each repo's highest v* tag instead.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const TRIGGER_REPOS = ['TriggerRepoA', 'TriggerRepoB'];

// In CodeBuild each repo is a full clone, tags included, at
// $CODEBUILD_SRC_DIR_<repo>. Locally it's a sibling folder.
const repoDir = (repo) => process.env[`CODEBUILD_SRC_DIR_${repo}`] ?? `../${repo}`;

const git = (repo, ...args) =>
  execFileSync('git', args, { cwd: repoDir(repo), encoding: 'utf8' }).trim();

function latestRelease(repo) {
  const [tag] = git(repo, 'tag', '--list', 'v*', '--sort=-v:refname').split('\n');
  const copy = tag ? git(repo, 'show', `${tag}:content.txt`) : 'No v* tag yet.';
  return { repo, tag: tag || 'unreleased', copy };
}

// Encode &, <, > and " as numeric entities, e.g. & becomes &#38;
const escape = (text) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const card = ({ repo, tag, copy }) => `
  <article>
    <header><h2>${repo}</h2><code>${escape(tag)}</code></header>
    <p>${escape(copy)}</p>
  </article>`;

const appCommit = process.env.CODEBUILD_RESOLVED_SOURCE_VERSION?.slice(0, 7) ?? 'local';

const page = (releases) => `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Multi-repo pipeline demo</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; color: #1f2328; }
  article { border: 1px solid #d0d7de; border-radius: 8px; padding: 1rem 1.25rem; margin: 1rem 0; }
  header { display: flex; justify-content: space-between; align-items: baseline; }
  h2 { font-size: 1rem; margin: 0; }
  code { font-size: 13px; background: #ddf4ff; color: #0969da; padding: 2px 8px; border-radius: 99px; }
  footer { color: #656d76; font-size: 13px; }
</style>
<h1>Multi-repo pipeline demo</h1>
${releases.map(card).join('')}
<footer>AppPipelineRepo@${appCommit} · built ${new Date().toISOString()}</footer>
</html>
`;

mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', page(TRIGGER_REPOS.map(latestRelease)));
console.log('Wrote dist/index.html');
