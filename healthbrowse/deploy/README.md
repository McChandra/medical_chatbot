# HealthBrowse deployment

The project runs one Node HTTP service. Its public research entry point runs without a database. Configure Supabase separately for account-specific features.

## Local Docker

From the healthbrowse project directory:

    docker compose up --build -d
    ./deploy/smoke.sh http://127.0.0.1:8080
    docker compose logs --tail=30
    docker compose down

Use Docker Compose 2.24+ for optional .env file support. The default port binds to loopback. Supply deployment-specific variables through an untracked local .env or a secret manager. The image runs as uid 1000, and the Compose service has a read-only root filesystem. Keep mail and database credentials outside the image.

## GitHub Actions

The workflow at .github/workflows/healthbrowse.yml runs Node tests, an npm advisory audit, Compose/Kustomize rendering, a container HTTP smoke check and a Trivy image scan on relevant pull requests and pushes. A weekly run repeats these checks on the default branch. Fixable HIGH/CRITICAL image vulnerabilities block release. Review unfixed advisories separately and date any risk acceptance. Dependabot proposes dependency and base-image updates for review. Refresh pinned Action revisions after verifying their maintainers' releases. GitHub Actions minutes and retained artifacts are subject to your account's limits.

Create a protected GitHub Environment named **healthbrowse-production** with a required reviewer and a deployment branch rule limiting it to main. Configure the following GitHub environment variables. Set HEALTHBROWSE_AUTO_DEPLOY as a **repository variable** so it can be inspected before the release job enters the environment.

| Variable | Value |
|---|---|
| GCP_PROJECT_ID | Billing-enabled Google Cloud project ID |
| GCP_REGION | Cloud Run and Artifact Registry region, e.g. us-central1 |
| GCP_ARTIFACT_REPOSITORY | Docker Artifact Registry repository name |
| GCP_RUN_SERVICE | Target Cloud Run service name, e.g. healthbrowse |
| GCP_WIF_PROVIDER | projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER |
| GCP_DEPLOY_SERVICE_ACCOUNT | Keyless deployment identity email |
| GCP_RUNTIME_SERVICE_ACCOUNT | Separate least-privilege runtime identity email |
| GCP_RUN_SECRET_BINDINGS | Optional comma-separated ENV_NAME=SECRET_NAME:VERSION assignments. Enter secret references only. |
| HEALTHBROWSE_PUBLIC | true to expose the HTTPS run.app service; default keeps its invoker IAM check enabled |
| HEALTHBROWSE_AUTO_DEPLOY | Optional true to release successful main-branch pushes; defaults to manual release |

### Set up Google Cloud once

1. Enable Cloud Run, Artifact Registry, IAM, IAM Credentials and Security Token Service APIs. Enable Secret Manager when binding secrets. Create a Docker Artifact Registry repository and configure retention for old images.
2. Create dedicated deployment and runtime service accounts. Grant the deployer Artifact Registry Writer on the repository, Cloud Run Developer on the target project/service, and Service Account User on the runtime identity. Grant the runtime identity Secret Manager Secret Accessor on only the secrets it uses. Additional permissions may be required by organization policy, first-time service creation, or public-invoker settings.
3. Set up Workload Identity Federation for https://token.actions.githubusercontent.com. Map repository and owner IDs plus ref, restrict the provider to this repository's numeric ID and owner ID, the main branch and the healthbrowse-production environment. Grant the matching principal roles/iam.workloadIdentityUser on the deployment service account. Do not upload a service-account key.
4. Register auth-provider redirect URLs after you know the service origin. Configure Supabase, mail delivery and database policies before enabling account-dependent features.
5. Run **HealthBrowse CI and Cloud Run release** from the Actions page on main and select **deploy**. The release job reloads the smoke-tested and scanned image, pushes it under the commit SHA, resolves the registry digest, then deploys that digest. The summary records the digest and URL.
6. For a public service, the workflow tests /healthz, /readyz, / and /api/config over HTTPS after release. Exercise authenticated database and email flows with two distinct test users before launch.

**Costs.** The release workflow uses request-based CPU, minimum zero instances, service maximum two instances, one CPU and 512 MiB per instance. This limits scale and can throttle under load. Free allowances depend on region and billing account. Registry storage, egress, logs, databases and mail may cost money. Budget alerts notify you but do not cap spend. Start with run.app and inspect actual costs before raising limits. A permanently provisioned GKE cluster is unnecessary for this path.

**Rollback.** Record the last passing revision and return traffic to it when external smoke checks fail:

    gcloud run revisions list --service "$GCP_RUN_SERVICE" --region "$GCP_REGION" --project "$GCP_PROJECT_ID"
    gcloud run services update-traffic "$GCP_RUN_SERVICE" --to-revisions "$PREVIOUS_REVISION=100" --region "$GCP_REGION" --project "$GCP_PROJECT_ID"

The release workflow reports failures. Apply backward-compatible schema changes before code rollout and test backup restoration separately.

## Kubernetes alternative

A Kubernetes cluster, registry pull access and TLS ingress are separate from Cloud Run. The base creates a restricted namespace, an unprivileged Deployment with probes and resource limits, and an internal ClusterIP Service. For a local kind cluster, load the image first:

    docker build -t healthbrowse:local .
    kind load docker-image healthbrowse:local
    kubectl apply -k deploy/kubernetes
    kubectl -n healthbrowse rollout status deployment/healthbrowse
    kubectl -n healthbrowse port-forward service/healthbrowse 8080:80

For a remote cluster, create a Kustomize overlay referencing the base and set images to replace healthbrowse:local with your registry image and SHA256 digest. Provision the optional namespaced healthbrowse-runtime Secret using your secret manager. Apply the overlay, validate readiness, and add TLS ingress before exposing it. The base creates no public load balancer. Add replicas or an HPA after load tests establish resource requirements.

## Operations

- Alert on service 5xx rate and latency, readiness failures and unexpected spend. Monitor instance count and memory. Test alerts in staging.
- Kubernetes probes check availability. Use your cluster's observability stack for request metrics, readiness and rollout failures. Exclude raw queries, contact messages and tokens from application logs.
- Cloud Run platform request logs can include the URL (including search parameters). Before production, review every log sink and retention rule. Where request URLs must not be retained, exclude this service's platform request log from the applicable sinks, e.g. a filter combining resource.type="cloud_run_revision", the specific resource.labels.service_name, and log_id("run.googleapis.com/requests"). Use aggregate Cloud Monitoring metrics for availability. Verify the policy with a synthetic query and inspect the sink rather than assuming a source-code logging policy covers the platform.
- Assign an owner to vulnerability findings, ingestion failures, user complaints and medical corrections. Track source provenance, reviewer, rollback plan and release SHA. Route suspected misinformation to clinical reviewers.

### Official references

[Cloud Run pricing](https://cloud.google.com/run/pricing) · [Public access](https://cloud.google.com/run/docs/authenticating/public) · [GitHub Actions Workload Identity Federation](https://github.com/google-github-actions/auth) · [Secret Manager integration](https://cloud.google.com/run/docs/configuring/services/secrets)
