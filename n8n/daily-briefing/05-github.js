const s = $input.first().json;
const token = $env.GITHUB_TOKEN;
const since = new Date(Date.now() - s.hoursBack * 3600 * 1000).toISOString();
const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'local-daily-briefing',
  'X-GitHub-Api-Version': '2022-11-28' };
if (token) headers['Authorization'] = `Bearer ${token}`;
const repos = [];
for (const repo of s.githubRepos) {
  const r = { repo, issues: [], prs: [], commits: [] };
  try {
    const issues = await this.helpers.httpRequest({ url: `https://api.github.com/repos/${repo}/issues?state=open&per_page=30`, headers, json: true });
    for (const i of issues) {
      const entry = { number: i.number, title: i.title, url: i.html_url };
      (i.pull_request ? r.prs : r.issues).push(entry);
    }
    const commits = await this.helpers.httpRequest({ url: `https://api.github.com/repos/${repo}/commits?since=${since}&per_page=10`, headers, json: true });
    r.commits = commits.map(c => ({ sha: c.sha.slice(0, 7), message: c.commit.message.split('\n')[0], url: c.html_url }));
  } catch (e) {
    r.error = e.message + (token ? '' : ' (no GITHUB_TOKEN set)');
  }
  repos.push(r);
}
s.sections.github = repos;
return [{ json: s }];
