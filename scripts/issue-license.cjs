'use strict';
const args = Object.fromEntries(process.argv.slice(2).reduce((out, arg, i, all) => {
  if (arg.startsWith('--')) out.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return out;
}, []));
const baseUrl = (process.env.LICENSE_API_URL || 'http://127.0.0.1:4180').replace(/\/$/, '');
const adminToken = process.env.LICENSE_ADMIN_TOKEN || '';
async function main() {
  if (!adminToken || adminToken.length < 24) throw new Error('Set LICENSE_ADMIN_TOKEN to a random secret of at least 24 characters before issuing licences.');
  if (!['home', 'pro', 'commercial'].includes(String(args.tier || '').toLowerCase())) throw new Error('Usage: npm run license:issue -- --tier pro --customer "Customer name" --seats 1 [--expires 2027-01-01T00:00:00Z]');
  const body = { tier: String(args.tier).toLowerCase(), customer: args.customer || '', maxActivations: Number(args.seats || 1) };
  if (args.expires) body.expiresAt = new Date(args.expires).toISOString();
  const response = await fetch(`${baseUrl}/v1/admin/licenses`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Issuer returned HTTP ${response.status}`);
  console.log('\nLICENCE CREATED — copy the key now; the issuer does not store it in recoverable form.\n');
  console.log(`Key: ${data.licenseKey}\nTier: ${data.tier}\nCustomer: ${data.customer || '(not set)'}\nActivations: ${data.maxActivations}\nExpires: ${data.expiresAt || 'never'}\nRecord ID: ${data.id}\n`);
}
main().catch((err) => { console.error(`Issue failed: ${err.message}`); process.exitCode = 1; });
