# k3s deployment

Production branch: `main`. Pushes to this branch deploy automatically after validation. Pull requests only validate; they never publish or deploy.

For a manual release, open GitHub **Actions → CI/CD (k3s) → Run workflow**, select **main**, and run. Other branches are rejected for manual production deployment. The workflow must also remain on the default branch for the button to be available.

Images are built on GitHub-hosted runners for linux/amd64, pushed to Docker Hub, and deployed by immutable digest. The host verifies the image source-commit label and runs a read-only candidate check before changing the running app. Do not revive the previous Docker deploy workflow.

Existing repository secrets: `DOCKER_USERNAME`, `DOCKER_PASSWORD`, `LIGHTSAIL_HOST`, `LIGHTSAIL_USERNAME`, `LIGHTSAIL_SSH_KEY`; optional `SSH_PORT` (default 22). `ENV_FILE` is deliberately unused. Runtime settings stay in Kubernetes Secret `arrive/runtime-env`, preserving PostgreSQL/JWT/FCM/S3 credentials. Never paste secrets into logs or commits.

The runner verifies a pinned SSH host key in `scripts/ci/lightsail_known_hosts`. Replace it only after independently verifying a server host-key change.

The host helper `/usr/local/sbin/lightsail-k3s-deploy` runs an independent systemd service. A shared host lock serializes arrive and sprit deployments; a newer push does not cancel an in-flight release. Older GitHub run numbers cannot replace an already-deployed newer run.

The app uses one replica and Recreate: expect a short maintenance response during replacement. Before deployment, the host creates a PostgreSQL dump on the server. If startup/health checks fail, it restores the previous Kubernetes Pod template using the same current database. It does not restore a DB dump or start a legacy Docker app. If rollback also fails, maintenance stays enabled for operator recovery.

Database schema changes require a separate reviewed procedure. arrive releases with unapplied Drizzle migrations are rejected before changing the app. sprit must remain PostgreSQL-compatible with schema synchronization disabled. Image rollback does not reverse schema changes.

Inspect deployment results on the server at `/var/lib/lightsail-deploy/arrive/latest.json` (successful digest and commit), per-run directories (backups and results), and `journalctl -u lightsail-deploy-arrive-<run-id>-<attempt>`. These are root-restricted; do not upload their DB backups to GitHub. `kubectl` can show the live image and `lightsail-infra/source-revision` annotation. The actual deployed digest is authoritative; initial infra manifests must be refreshed before any full re-apply.

The host helper source and recovery instructions are maintained in `lightsail-infra/k3s/ci/`.

## Initial verification (2026-11-14 KST)

The first [manual Actions release](https://github.com/no-ikjun/arrive/actions/runs/43457042428) passed validation, image publication, host preflight and production deployment. The app's 43 tests passed. A session created before deployment remained readable with both owner/share authentication afterward; state updates, idempotent retries and stale-revision rejection were verified against the new Pod.

For ordinary releases, push backend/contracts/deploy-helper changes to main. For a button release, select main in Run workflow. During the short Recreate replacement, the API returns maintenance responses; schema changes need the separate procedure above.
