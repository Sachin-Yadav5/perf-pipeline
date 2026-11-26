# perf-pipeline (central)

Runs a JMeter load test and Clinic.js profiling on a pull request, and publishes the result to the GitHub Actions
job summary, two artifacts (`jmeter-html-report`, `clinic-cpu-report`) and Slack.

## For developers
Add a `perf` block to the PR description (the PR template contains an example) and raise the PR.
The test runs automatically, and again every time the description is edited or new commits are pushed.
Without a `perf` block nothing runs.

````
```perf
- path: /api/products
  method: GET
  users: 50
  ramp_up: 10                  # seconds, default 10
  duration: 60                 # seconds, 5-600
  max_avg_response_time: 300   # ms, default 500
  max_error_rate: 1            # %, default 1
  # optional: headers: {Authorization: "Bearer x"}, body: {...}
```
````

List as many APIs as you need (default maximum 20 APIs and 500 total users).
The app must listen on the `PORT` environment variable. The start command is detected automatically
(Next.js: `next start`; otherwise `scripts.start` if it starts with `node`, or `main`).
To set a custom start command use the object form:

````
```perf
app:
  start: node dist/server.js
apis:
  - path: /api/products
```
````

## For the owner / admin: one-time setup
1. Create the repository `perf-pipeline` in the organization with the content of this folder, then tag it: `git tag v1 && git push origin v1`.
2. Repository Settings, Actions, General, Access: choose **Accessible from repositories in the organization**.
3. Organization Settings, Secrets and variables, Actions: create the secret `SLACK_WEBHOOK_URL` and give it access to the repositories.
4. Install the caller workflow in all repositories:
   ```bash
   ./rollout/install.sh <org> --dry-run     # preview which repositories will get it
   ./rollout/install.sh <org>               # opens a PR in each repository; the pipeline is active once it is merged
   ```
   With GitHub Enterprise you can use organization rulesets (required workflows) instead of these PRs.

## Maintenance
- **Updates and bug fixes:** change this repository, test it, then move the tag: `git tag -f v1 && git push -f origin v1`. All repositories pick it up automatically because the callers use `@v1`.
- **Pinned versions:** Clinic.js 13.0.0, JMeter 5.6.3 (in `action.yml`), Node 20.
- **When something breaks:** open the failed run and read the log of the red step. A wrong configuration is reported in Slack as CONFIG ERROR together with the reason.
- There is no external service or server; everything runs in GitHub Actions.

## Limits (tell the developers)
- Tests run on a GitHub-hosted runner, so the numbers are meant for comparing PRs, not as absolute production numbers.
- Apps that need a database, Redis or secrets require `services:` / `env:` in the caller workflow of that repository.
- PRs from forks do not receive secrets, so Slack is skipped for them.
- Every test uses Actions minutes.

## Files
- `action.yml`: the whole pipeline (composite action)
- `scripts/`: config parsing, JMX generation, run, analysis, summary, Slack
- `templates/`: the caller workflow and PR template installed in every repository
- `rollout/install.sh`: installs them in all repositories at once
