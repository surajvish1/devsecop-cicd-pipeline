# DevSecOps CI/CD Pipeline — Jenkins on AWS EC2

A self-hosted, fully automated CI/CD pipeline that builds, security-scans, deploys, monitors, and tracks a containerized Node.js application — end to end, triggered by a single `git push`.

Push code → Jenkins builds it → Gitleaks and Trivy scan it → Docker deploys it → a health check verifies it → Prometheus/Grafana watch it → Jira gets notified. No manual steps.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Pipeline Flow](#pipeline-flow)
- [Security (DevSecOps)](#security-devsecops)
- [Monitoring & Alerting](#monitoring--alerting)
- [Jira Integration](#jira-integration)
- [Project Structure](#project-structure)
- [Setup Guide](#setup-guide)
- [Port Reference](#port-reference)
- [Design Decisions](#design-decisions)
- [Challenges & Fixes](#challenges--fixes)
- [Roadmap](#roadmap)
- [Author](#author)

---

## Overview

This project simulates a realistic, production-style DevSecOps workflow on a single AWS EC2 instance. It was built to go beyond "hello world" CI/CD demos by including the pieces that actually matter in a real team environment:

- **Automated builds and deployments** on every push to `main`
- **Security gates** baked into the pipeline itself (secrets scanning, vulnerability scanning) instead of bolted on afterward
- **Observability** of the host running the pipeline and the app, with real alerting
- **Traceability** back to project management (Jira), so every deploy is linked to the ticket that caused it

Everything runs on **one EC2 instance** — Jenkins, the application, and the monitoring stack all coexist, which is a deliberate constraint that forced real decisions around memory budgeting, port allocation, and service isolation.

---

## Architecture

```
                         ┌─────────────────────────────────────────────┐
                         │        AWS EC2 — Ubuntu 24.04 (t3.small)     │
                         │                                               │
   GitHub  ──push───▶  webhook ──▶  ┌───────────┐                       │
   (source repo)                    │  Jenkins  │  :8080                │
                                     │  (CI/CD)  │                       │
                                     └─────┬─────┘                       │
                                           │ builds & deploys            │
                                           ▼                             │
                                     ┌───────────┐                       │
                                     │    App     │  :5000 → :8080       │
                                     │  Container │                       │
                                     └─────┬─────┘                       │
                                           │ scraped                     │
                                           ▼                             │
                    ┌───────────┐   ┌───────────┐   ┌───────────┐        │
                    │   Node    │──▶│Prometheus │──▶│  Grafana  │        │
                    │ Exporter  │   │  :9090    │   │  :3000    │        │
                    │  :9100    │   └───────────┘   └─────┬─────┘        │
                    └───────────┘                          │ email        │
                         (host metrics)                    ▼ alerts       │
                         └─────────────────────────────────────────────┘
                                           │
                                  jiraComment on build result
                                           ▼
                                    ┌────────────┐
                                    │ Jira Cloud │
                                    │  (SCRUM)   │
                                    └────────────┘
```

---

## Tech Stack

| Category | Tool |
|---|---|
| CI/CD Server | Jenkins (Declarative Pipeline) |
| Source Control | GitHub (webhook-triggered) |
| Containerization | Docker |
| Secrets Scanning | Gitleaks |
| Vulnerability Scanning | Trivy (filesystem + image scan) |
| Metrics Collection | Prometheus + Node Exporter |
| Dashboards & Alerting | Grafana (email via SMTP) |
| Issue Tracking | Jira Cloud (Jira Plugin for Jenkins) |
| Infrastructure | AWS EC2 (Ubuntu 24.04, t3.small) |
| Runtime | Node.js (Express) |

---

## Pipeline Flow

The `Jenkinsfile` defines an 8-stage Declarative Pipeline:

| # | Stage | Purpose |
|---|---|---|
| 1 | **Checkout** | Pulls the latest commit from GitHub via `checkout scm` |
| 2 | **Extract Jira Issue** | Parses the commit message for a Jira ticket key (`[A-Z]+-\d+`) |
| 3 | **Secrets Scan — Gitleaks** | Scans the full repo for leaked credentials. **Hard fail** if any are found |
| 4 | **Dependency Scan — Trivy (fs)** | Scans `package.json` / lockfile for known CVEs. Currently report-only |
| 5 | **Build Docker Image** | Builds and tags the app image |
| 6 | **Container Image Scan — Trivy (image)** | Scans the built image (OS + app layers) for CVEs. Currently report-only |
| 7 | **Deploy** | Stops the old container, runs the new one |
| 8 | **Health Check** | Retries `curl` against the app for up to 5 attempts before failing the build |

**Post-build:** on success or failure, a comment is posted to the linked Jira ticket (if one was found in the commit message) with the build result and a direct link to the Jenkins build.

Trigger: a GitHub webhook (`/github-webhook/`) fires on every push to `main`, so builds require zero manual intervention.

---

## Security (DevSecOps)

Security scanning is integrated directly into the pipeline rather than run separately or after the fact.

| Tool | Scans | Gate type | Current findings |
|---|---|---|---|
| **Gitleaks** | Full repository (source code) | **Hard gate** — fails the build | Clean, no leaks found |
| **Trivy (fs)** | `package.json` / lockfile dependencies | Report-only | 17 CVEs (15 HIGH, 2 CRITICAL) — primarily `node-tar` |
| **Trivy (image)** | Built Docker image (base OS + app layers) | Report-only | 15 CVEs (14 HIGH, 1 CRITICAL) |

**Why Trivy is report-only for now:** the base image and its dependency tree already carry known CVEs. Making this a hard gate on day one would block every build without giving time to triage real risk vs. noise. This mirrors how security gates are typically rolled out in mature environments — observe first, then tighten. Both stages are one flag away (`--exit-code 0` → `--exit-code 1`) from becoming hard gates once the team decides on a remediation policy.

All security stages are togglable via a `ENABLE_SECURITY_GATES` pipeline parameter, so scans can be temporarily skipped for unrelated debugging without editing the `Jenkinsfile`.

---

## Monitoring & Alerting

- **Node Exporter** runs on the host (`:9100`) and exposes system-level metrics — CPU, memory, disk, network, swap.
- **Prometheus** (`:9090`) scrapes Node Exporter every 15 seconds and stores the time-series data.
- **Grafana** (`:3000`) visualizes it via the community "Node Exporter Full" dashboard (ID `1860`), and is configured with SMTP (Gmail) for email alerting.
- **Alert example:** memory usage above 85% for 5 minutes triggers an email notification.

Monitoring wasn't just a checkbox feature here — it directly helped diagnose a real incident (see [Challenges & Fixes](#challenges--fixes)) where an out-of-memory condition took down SSH access to the instance.

---

## Jira Integration

Every deploy is traceable back to the ticket that caused it:

1. Commit references a ticket key, e.g. `git commit -m "SCRUM-1: fix login redirect bug"`
2. Jenkins extracts the key via regex from the latest commit message
3. The pipeline runs as normal (build → scan → deploy → health check)
4. On completion, `jiraComment` posts a ✅ or ❌ result — with the build number and link — directly on that Jira issue

This removes the manual step of "go update the ticket after deploying," which is easy to forget under real deadline pressure.

---

## Project Structure

```
.
├── Jenkinsfile          # Declarative pipeline definition
├── Dockerfile            # Node.js app container definition
├── server.js             # Express app (health check + demo route)
├── package.json
├── monitoring/
│   ├── docker-compose.yml   # Prometheus + Grafana stack
│   └── prometheus.yml       # Scrape config
└── README.md
```

---

## Setup Guide

### Prerequisites
- AWS EC2 instance (Ubuntu 24.04, t3.small or larger recommended — see [Design Decisions](#design-decisions) for why)
- A GitHub repository containing this app
- A Jira Cloud site and project
- A Gmail account (or other SMTP provider) for alert emails

### 1. Provision the EC2 host
Install Docker and Jenkins (Java 21 required for current Jenkins versions):
```bash
sudo apt update && sudo apt install -y docker.io openjdk-21-jre
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2026.key -o /tmp/jenkins.key
sudo gpg --dearmor -o /usr/share/keyrings/jenkins-keyring.asc /tmp/jenkins.key
echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" | sudo tee /etc/apt/sources.list.d/jenkins.list
sudo apt update && sudo apt install -y jenkins
sudo usermod -aG docker jenkins
sudo systemctl restart docker jenkins
```

### 2. Configure Jenkins
- Unlock via `/var/lib/jenkins/secrets/initialAdminPassword`
- Install plugins: **Docker Pipeline**, **GitHub Integration**, **Jira Plugin**
- Add credentials: GitHub PAT (`github-cred`), Jira API token
- Create a Pipeline job → Pipeline script from SCM → point at this repo → script path `Jenkinsfile`

### 3. Wire up the GitHub webhook
Repo → Settings → Webhooks → Add webhook:
```
Payload URL: http://<ec2-ip>:8080/github-webhook/
Content type: application/json
Event: Just the push event
```

### 4. Start the monitoring stack
```bash
cd monitoring
docker-compose up -d
```
Then in Grafana (`:3000`): add Prometheus as a data source (`http://<private-ip>:9090`), import dashboard ID `1860`.

### 5. Push and deploy
```bash
git commit -m "SCRUM-1: initial deploy"
git push origin main
```
Jenkins picks it up automatically via the webhook.

---

## Port Reference

| Service | Port | Notes |
|---|---|---|
| Jenkins | 8080 | CI/CD UI |
| Application | 5000 → 8080 | Host:Container mapping |
| Grafana | 3000 | Dashboards |
| Prometheus | 9090 | Metrics/targets UI |
| Node Exporter | 9100 | Scraped by Prometheus, not exposed publicly in production |

Ports were deliberately chosen to avoid collisions as services were added incrementally — a mistake made once (a container trying to claim a port already held by a native process) is documented below.

---

## Design Decisions

**Why self-hosted Jenkins instead of a managed CI (GitHub Actions, GitLab CI)?**
Self-hosting means owning the full stack — OS, Docker daemon, plugin ecosystem, credential storage — which is exactly what a managed CI abstracts away. That ownership is the point: it surfaces real operational problems (patching, service crashes, resource limits) that don't show up when someone else runs your CI for you. It also reflects how a lot of real infrastructure — especially in enterprises with on-prem or hybrid components — is still run today.

**Why Declarative Pipeline over Scripted or Freestyle jobs?**
Freestyle jobs aren't version-controlled and don't belong in a serious CI/CD setup. Scripted pipelines (raw Groovy) are powerful but easy to turn into unreadable spaghetti. Declarative pipeline enforces a consistent, reviewable structure (`stages`, `steps`, `post`, `when`), gets basic validation from Jenkins itself, and — critically — lives in the repo as a `Jenkinsfile`, so the pipeline is versioned and reviewed exactly like the code it builds.

**Why Docker for deployment instead of running Node directly on the host?**
Environment parity (same Node version/deps everywhere) and a clean, atomic redeploy primitive (`stop` → `rm` → `run`) instead of managing process state by hand. It's also a straightforward on-ramp to a real orchestrator (ECS/EKS) later without changing the app.

**Why report-only vulnerability scans instead of hard gates from day one?**
See [Security](#security-devsecops) — blocking every build on pre-existing base-image CVEs before triaging real risk just kills velocity without improving security. Gates get tightened once there's an actual remediation policy.

---

## Challenges & Fixes

Real problems hit during setup — documented here because the debugging is as valuable as the working result.

| Problem | Root cause | Fix |
|---|---|---|
| Jenkins apt repo GPG error (`NO_PUBKEY`) | Jenkins rotated its signing key (previous key had expired) | Fetched the current signing key and re-added it in dearmored binary format |
| Jenkins service crash-looped on start | Jenkins 2.568+ requires Java 21; host had Java 17 | Installed `openjdk-21-jre`, set as default via `update-alternatives` |
| `permission denied` connecting to Docker socket | `jenkins` user wasn't in the `docker` group at the process level | `usermod -aG docker jenkins` + full service restart (not just reload) |
| A heavy service crashed SSH access entirely | Small instance hit an out-of-memory condition under load; OOM killer took down critical processes | Removed the offending service, resized instance to a larger type, added swap as a safety net |
| Docker Compose exporter container stuck in "Created" state | Target port was already bound by a native process on the host | Pointed Prometheus at the host's existing exporter instead of running a duplicate in Docker |
| Jira comment step failed — `NoSuchMethodError` | Installed Jira plugin's actual DSL step name didn't match what was used in the pipeline | Corrected the step name and parameters to match the installed plugin |
| Jira comment silently attempted with no real ticket | Jenkins env vars are always strings, so a "null" value was the literal string `"null"`, which is truthy in Groovy | Added an explicit string-equality check before calling the comment step |
| Jira site setup asked for a "Registration URL" | A heavier bi-directional Jira integration plugin was installed instead of the simple comment/link plugin | Uninstalled it, installed the correct lightweight Jira plugin |

---

## Roadmap

- [ ] SSH hardening (key-only auth, disable root login, fail2ban)
- [ ] Firewall rules / Tailscale VPN instead of public 0.0.0.0/0 security group rules
- [ ] Promote Trivy scans from report-only to hard gates once a remediation policy is set
- [ ] Auto-transition Jira issue status (e.g. → "Deployed") instead of only commenting
- [ ] cAdvisor for per-container resource metrics
- [ ] Migrate from a single EC2 host to a properly separated CI/monitoring/app topology

---

## Author

**Suraj Vishwakarma**
DevOps / SRE / Platform Engineer
