import { z } from 'zod';

const serviceAccount = z.string().min(1).transform((raw, ctx) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'must be valid JSON' });
    return z.NEVER;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    ctx.addIssue({ code: 'custom', message: 'must be a JSON object' });
    return z.NEVER;
  }
  const creds = parsed as Record<string, unknown>;
  if (typeof creds.private_key === 'string') {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  }
  return creds;
});

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres connection string'),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z
    .string()
    .regex(/^pk_(test|live)_/, 'must be a Clerk publishable key (pk_test_… / pk_live_…)'),
  CLERK_JWT_KEY: z.string().min(1),
  FIREBASE_SERVICE_ACCOUNT: serviceAccount,
  DEFAULT_CALLING_CODE: z
    .string()
    .regex(/^[1-9]\d{0,2}$/, 'must be a country calling code, digits only, no + or 00')
    .default('91'),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment configuration:');
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = result.data;
