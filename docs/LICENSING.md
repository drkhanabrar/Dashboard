# Licence issuer setup and tiered activation

## Architecture

The desktop/server validates the signed licence payload on the server side. The issuer generates human-readable keys, stores a SHA-256 hash rather than the full key, enforces activation-seat limits and signs tier claims using Ed25519. The server package contains only the matching public verification key. The issuer should run on a trusted host, preferably behind HTTPS, and its admin token/private key must not be present in public artifacts or customer installations.

Tiers and server-enforced quotas in V1:

| Tier | Screens | Widgets per screen | Device links |
|---|---:|---:|---:|
| Free | 2 | 10 | 3 |
| Home | 5 | 24 | 10 |
| Pro | 20 | 50 | 50 |
| Commercial | 100 | 100 | 250 |

## Provision a key pair

A matching private/public key pair already exists for this source delivery. The private key is delivered separately and is not included in the source archive. Place that private key at `secrets/license-private.pem` on the issuer host. Keep it outside Git and set file permissions so only the issuer account can read it.

To generate a new pair instead:

```bash
npm run license:generate-keys
```

The script refuses to overwrite an existing private key unless `--force` is used. It writes the private key to `secrets/license-private.pem` and the public key to `apps/server/config/license-public-key.pem`. Commit only the public key, rebuild all desktop server apps, and deploy the private key to the issuer. If the issuer signs with a different key, activation intentionally fails.

## Start a local development issuer

PowerShell example:

```powershell
$env:LICENSE_ADMIN_TOKEN = "REPLACE_WITH_A_RANDOM_SECRET_AT_LEAST_24_CHARACTERS"
$env:LICENSE_PRIVATE_KEY_FILE = ".\secrets\license-private.pem"
$env:LICENSE_DB_FILE = ".\apps\license-api\data\licenses.sqlite"
npm run license:api
```

On Linux/macOS:

```bash
export LICENSE_ADMIN_TOKEN="REPLACE_WITH_A_RANDOM_SECRET_AT_LEAST_24_CHARACTERS"
export LICENSE_PRIVATE_KEY_FILE="./secrets/license-private.pem"
export LICENSE_DB_FILE="./apps/license-api/data/licenses.sqlite"
npm run license:api
```

The local service listens on `127.0.0.1:4180` by default. It is a development issuer; do not expose its admin API on a public interface without HTTPS, firewall controls, rate limits and operational monitoring. For commercial deployment, run this service in a separate trusted environment behind HTTPS, with a firewall and backups. The service defaults to loopback; set `LICENSE_API_HOST=0.0.0.0` only when it must accept remote traffic behind that protected endpoint.

## Issue a key

Use a separate terminal with the same admin token configured:

```bash
npm run license:issue -- --tier pro --customer "Customer name" --seats 1
```

Optional expiry is an ISO date:

```bash
npm run license:issue -- --tier home --customer "Family account" --seats 2 --expires 2027-10-01T00:00:00Z
```

Only `home`, `pro` and `commercial` can be issued. The full key is shown once by the CLI. Record it in your secure customer/licensing system.

## Activate an installation

1. Start the issuer and set the issuer URL in **Licence & plans**. For a same-PC development issuer, use `http://127.0.0.1:4180`; for a production issuer, use its HTTPS URL.
2. Enter the issued key and activate.
3. The issuer signs claims for that installation ID and checks the activation count.
4. The desktop server verifies the signature using the public key bundled into its build before it stores the licence.
5. To release an activation seat, use **Deactivate this installation** in Licence & plans while the issuer is reachable; the issuer removes that installation from the seat list.

## Important V1 limitations

- The V1 issuer is an API and CLI, not a billing portal. Payment processing, customer account management, refund handling and email delivery are not included.
- Key signing and server validation protect against accidental or trivial client-side edits. They are not a substitute for keeping source code, issuer secrets and production infrastructure private.
- Issuer revalidation runs every six hours, and the server removes a licence when the issuer reports it revoked or missing. During issuer outages, a signed licence may operate offline for up to seven days. Do not treat this as tamper-proof DRM or rely on it as a compliance control.
- Rotating the signing key invalidates old licences unless a transition strategy is implemented. Plan key rotation before distributing paid licences.
