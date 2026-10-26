// Uploads firestore.rules and makes it the live rule set.
// With RULES_DRY_RUN=1 it only compiles the rules on the server, then removes the uploaded copy.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('Set GOOGLE_SERVICE_ACCOUNT_JSON.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(raw)) });

const source = readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8');
const rules = getSecurityRules();
const dryRun = process.env.RULES_DRY_RUN === '1';

try {
  const ruleset = await rules.createRuleset(rules.createRulesFileFromSource('firestore.rules', source));
  console.log(`rules compiled: ${ruleset.name}`);
  if (dryRun) {
    const live = await rules.getFirestoreRuleset();
    console.log(`live rules: ${live.name} (${live.createTime})`);
    await rules.deleteRuleset(ruleset.name);
    console.log('dry run, nothing released');
  } else {
    await rules.releaseFirestoreRuleset(ruleset);
    console.log('rules released');
  }
} catch (error) {
  console.error(`rules deploy failed: ${error.code || ''} ${error.message}`);
  process.exit(1);
}
