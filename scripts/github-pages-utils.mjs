import { execFileSync } from 'node:child_process';

const defaultRepo = {
  owner: 'HeavenlyShogun',
  repo: '-_hina',
};

function parseRepoName(remoteUrl) {
  const normalizedUrl = remoteUrl.trim().replace(/\.git$/, '');
  const match = normalizedUrl.match(/github\.com[:/](.+?)\/(.+)$/);

  if (!match) {
    throw new Error(`Unsupported GitHub remote URL: ${remoteUrl}`);
  }

  return {
    owner: match[1],
    repo: match[2],
  };
}

export function getGitHubRepo() {
  const repositoryFromEnv =
    process.env.GITHUB_REPOSITORY ||
    (process.env.GITHUB_PAGES_OWNER && process.env.VITE_GITHUB_PAGES_REPO
      ? `${process.env.GITHUB_PAGES_OWNER}/${process.env.VITE_GITHUB_PAGES_REPO}`
      : null);

  if (repositoryFromEnv) {
    return parseRepoName(`https://github.com/${repositoryFromEnv}.git`);
  }

  try {
    const remoteUrl = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      encoding: 'utf8',
    }).trim();

    return parseRepoName(remoteUrl);
  } catch {
    return defaultRepo;
  }
}
