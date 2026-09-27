# Deploy the core app to DigitalOcean App Platform

This guide stops before creating a billable resource. It deploys the typed core
only; Phase 5B voice variables and services are intentionally absent.

## Before opening DigitalOcean

1. Merge the approved Phase 5A pull request into `main`.
2. From a clean checkout of that exact main commit, run:

   ```sh
   npm ci
   npm run check:env
   npm run db:status
   npm run verify
   ```

3. Confirm `.do/app.yaml` still specifies one
   `apps-s-1vcpu-0.5gb` instance. The service must remain single-instance because
   its rate limiter is in memory.
4. Have these existing values ready without pasting them into a terminal, issue,
   commit, or screenshot: `GEMINI_API_KEY`, `GEMINI_MODEL`, and `DATABASE_URL`.
   Use the existing Tiger `DATABASE_URL`; its migrations are already applied.

## Configure the app in the dashboard

DigitalOcean documents the current dashboard flow in its
[App Platform creation guide](https://docs.digitalocean.com/products/app-platform/how-to/create-apps/)
and the committed YAML fields in the
[app-spec reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/).

1. Sign in to DigitalOcean and select **Create → App Platform**.
2. Choose GitHub, authorize read access if prompted, and select
   `aahanrembersu07/inverse-tutor`, branch `main`, repository root `/`.
3. Use the configuration from `.do/app.yaml`. Confirm the detected component is
   a **Web Service** using the Node.js runtime, with `npm run build`, `npm start`,
   internal port `8080`, region `nyc`, and exactly one 512 MiB shared instance.
4. In the web service’s environment-variable editor, enter the following. Paste
   values only in DigitalOcean’s value fields:

   | Name | Value | Scope | Encrypt |
   | --- | --- | --- | --- |
   | `GEMINI_API_KEY` | Existing key | Run time | Yes |
   | `GEMINI_MODEL` | `gemini-3.1-flash-lite` (or the currently verified model) | Run time | No |
   | `DATABASE_URL` | Existing Tiger production URL | Run time | Yes |
   | `NODE_ENV` | `production` | Run time | No |
   | `NEXT_PUBLIC_DEMO_HELPER` | `false` | Build time | No |

   Do not add `DATABASE_URL_TEST`, `E2E_EVALUATOR`,
   `NEXT_PUBLIC_USE_MOCKS`, or `DEBUG_LLM_PAYLOADS`. Production startup rejects
   the last three by variable name even if their value is `false`.
5. Confirm the readiness health check path is `/api/health`, with a 10-second
   initial delay and period, five-second timeout, one success, and three failures.
   DigitalOcean explains these fields in its
   [health-check guide](https://docs.digitalocean.com/products/app-platform/how-to/manage-health-checks/).
6. Review the final estimate and available hackathon DigitalOcean credits.
   The configured `apps-s-1vcpu-0.5gb` service is currently about **$5/month**,
   prorated per second, with 50 GiB transfer; overage and unrelated services can
   add cost. Check the live
   [App Platform pricing table](https://docs.digitalocean.com/products/app-platform/details/pricing/)
   before proceeding.

**Stop here.** The next dashboard action creates a billable resource. Create it
only after you decide the displayed charge and credits are acceptable. No
DigitalOcean database is needed.

## After you create it

1. Wait for build and deployment to finish. In the Runtime Logs, confirm no
   forbidden-variable guard error appears. Do not copy secret values into logs.
2. Open the assigned HTTPS URL and request `/api/health`. It must return exactly:

   ```json
   { "ok": true, "db": "up" }
   ```

3. Send the HTTPS base URL to the verification owner. They will run the bounded
   HTTP smoke and live E2E flows, check the owner-cookie flags, and verify that
   answer keys remain hidden before completion. Do not claim deployed readiness
   until those checks pass.
4. Keep the service at one instance. If you change the model or an environment
   value, redeploy and repeat the deployed checks.

## Roll back

Open the app’s **Activity** tab, choose **Rollback** beside a recent successful
deployment, inspect the code and settings diff, and confirm. A rollback restores
code, configuration, and the app spec, but does not roll back database data.
DigitalOcean retains up to ten recent successful deployments; see its
[deployment and rollback guide](https://docs.digitalocean.com/products/app-platform/how-to/manage-deployments/).
After rollback, check `/api/health` and rerun the deployed smoke test. Disable
automatic deployment in the rollback dialog until the faulty change is fixed.
