# perf-pipeline (central)

PR par JMeter load test + Clinic.js profiling chalata hai, aur result GitHub Actions Summary, 2 artifacts
(`jmeter-html-report`, `clinic-cpu-report`) aur Slack me deta hai.

## Developer ke liye (sirf itna)
1. PR description me `perf` block likho (PR template me example hai):
   ```perf
   - path: /api/products
     method: GET
     users: 50
     ramp_up: 10              # sec, default 10
     duration: 60             # sec, 5-600
     max_avg_response_time: 300   # ms, default 500
     max_error_rate: 1            # %, default 1
     # optional: headers: {Authorization: "Bearer x"}, body: {...}
   ```
2. PR raise karo. Test apne aap chalta hai. Block na ho to kuch nahi chalta.

Jitni APIs chahiye utni likh sakte ho (default max 20, total users max 500).
App `PORT` env var par listen kare. Start command auto-detect hota hai (Next.js: `next start`; baaki: `scripts.start` agar `node ...` se shuru ho, warna `main`).
Alag start command ho to block ki jagah is format me likho:
```perf
app:
  start: node dist/server.js
apis:
  - path: /api/products
```

## Owner / Admin ke liye: ek baar ka setup
1. Org me ye repo banao: `perf-pipeline` (is folder ka poora content). Tag banao: `git tag v1 && git push origin v1`.
2. Repo Settings, Actions, General, Access: **Accessible from repositories in the organization**.
3. Org Settings, Secrets and variables, Actions: secret `SLACK_WEBHOOK_URL` banao (Repository access: All repositories ya jo chaho).
4. Saari repos me caller workflow lagao:
   ```bash
   ./rollout/install.sh <org> --dry-run     # pehle dekho kin repos me lagega
   ./rollout/install.sh <org>               # PRs khulengi; merge karte hi pipeline active
   ```
   (GitHub Enterprise ho to org "required workflows"/rulesets se bhi laga sakte ho; tab ye PRs nahi chahiye.)

## Maintenance
- **Update/bug fix:** is repo me change karo, test karo, phir `git tag -f v1 && git push -f origin v1`. Sab repos ko apne aap lag jata hai (callers `@v1` use karte hain).
- **Versions pinned hain:** Clinic.js 13.0.0, JMeter 5.6.3 (`action.yml` me), Node 20. Badalna ho to wahin badlo.
- **Kuch toote to kahan dekhen:** failed run me red step ka log. Config galat ho to Slack me ⚠️ CONFIG ERROR aur wajah aati hai.
- Koi external service ya server nahi hai. Sab kuch GitHub Actions me chalta hai.

## Limits (developers ko batana)
- Test GitHub runner par chalta hai: numbers PR ke beech tulna ke liye hain, production ke absolute numbers nahi.
- DB/Redis/secrets chahiye wali apps ke liye us repo ke caller workflow me `services:`/`env:` add karne padte hain.
- Fork se aayi PRs me secrets nahi milte, Slack wahan skip hota hai.
- Har test Actions minutes use karta hai.

## Files
- `action.yml`: poora pipeline (composite action)
- `scripts/`: config parse, JMX generate, run, analyze, summary, Slack
- `templates/`: har repo me lagne wali workflow aur PR template
- `rollout/install.sh`: saari repos me ek saath lagane ki script
