import 'dotenv/config';
import { z } from 'zod';
import { AdapterMode, Network } from '../core/types';

const optionalNonEmptyString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
);

const networkSchema = z.preprocess(
  (value) => (value === 'mainnet' ? 'mainnet-beta' : value),
  z.enum(['devnet', 'mainnet-beta']).default('devnet'),
);

const envSchema = z
  .object({
    SLOTPILOT_ADAPTER_MODE: z.enum(['mock', 'live']).default('mock'),
    NETWORK: networkSchema,
    SOLANA_RPC_URL: optionalUrl,
    SOLANA_WS_URL: optionalUrl,
    YELLOWSTONE_GRPC_ENDPOINT: optionalNonEmptyString,
    YELLOWSTONE_GRPC_TOKEN: optionalNonEmptyString,
    JITO_BLOCK_ENGINE_URL: optionalUrl,
    JITO_TIP_FLOOR_URL: z
      .string()
      .url()
      .default('https://bundles.jito.wtf/api/v1/bundles/tip_floor'),
    JITO_MIN_REQUEST_INTERVAL_MS: z.coerce.number().int().min(0).default(1_000),
    JITO_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(10_000),
    JITO_SEARCHER_GRPC_URL: optionalNonEmptyString,
    JITO_AUTH_UUID: optionalNonEmptyString,
    JITO_AUTH_PRIVATE_KEY: optionalNonEmptyString,
    OPENAI_API_KEY: optionalNonEmptyString,
    OPENAI_BASE_URL: optionalUrl,
    OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
    AGENT_MODE: z.enum(['rule', 'openai']).default('rule'),
    PAYER_PRIVATE_KEY: optionalNonEmptyString,
    RECIPIENT_PUBLIC_KEY: optionalNonEmptyString,
    LOG_DIR: z.string().default('logs'),
    SLOTPILOT_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
    SLOTPILOT_LIFECYCLE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .default(30_000),
    SLOTPILOT_MIN_TIP_LAMPORTS: z.coerce.number().int().min(1).default(1_000),
    SLOTPILOT_MAX_TIP_LAMPORTS: z.coerce.number().int().min(1).default(100_000),
    SLOTPILOT_PRIORITY_FEE_PRESSURE_SCALE_MICROLAMPORTS: z.coerce
      .number()
      .min(1)
      .default(1_000_000),
    SLOTPILOT_MAX_LEADER_WAIT_SLOTS: z.coerce.number().int().min(0).default(16),
    SLOTPILOT_SUBMISSION_WINDOW_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .default(30_000),
    SLOTPILOT_MIN_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(1_100),
    SLOTPILOT_MAX_HOLD_CYCLES: z.coerce.number().int().min(0).default(3),
  })
  .superRefine((env, ctx) => {
    if (env.SLOTPILOT_ADAPTER_MODE !== 'live') {
      return;
    }

    const requiredLiveKeys: Array<keyof typeof env> = [
      'SOLANA_RPC_URL',
      'YELLOWSTONE_GRPC_ENDPOINT',
      'JITO_BLOCK_ENGINE_URL',
      'PAYER_PRIVATE_KEY',
      'RECIPIENT_PUBLIC_KEY',
    ];

    for (const key of requiredLiveKeys) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} is required when SLOTPILOT_ADAPTER_MODE=live`,
          path: [key],
        });
      }
    }
    if (env.SLOTPILOT_MIN_TIP_LAMPORTS < 1_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'SLOTPILOT_MIN_TIP_LAMPORTS must be at least 1000 in live mode',
        path: ['SLOTPILOT_MIN_TIP_LAMPORTS'],
      });
    }
    if (
      env.NETWORK === 'devnet' &&
      env.JITO_BLOCK_ENGINE_URL &&
      new URL(env.JITO_BLOCK_ENGINE_URL).hostname.endsWith(
        'block-engine.jito.wtf',
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Official Jito Block Engine endpoints do not serve Solana devnet; use NETWORK=mainnet-beta or a devnet-compatible bundle provider',
        path: ['NETWORK'],
      });
    }
  });

export type SlotPilotEnv = z.infer<typeof envSchema> & {
  SLOTPILOT_ADAPTER_MODE: AdapterMode;
  NETWORK: Network;
};

let cachedEnv: SlotPilotEnv | null = null;

export function loadEnv(): SlotPilotEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = parseEnv(process.env);
  return cachedEnv;
}

export function parseEnv(input: NodeJS.ProcessEnv): SlotPilotEnv {
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid SlotPilot environment:\n${message}`);
  }

  if (
    parsed.data.SLOTPILOT_MIN_TIP_LAMPORTS >
    parsed.data.SLOTPILOT_MAX_TIP_LAMPORTS
  ) {
    throw new Error(
      'Invalid SlotPilot environment: SLOTPILOT_MIN_TIP_LAMPORTS cannot exceed SLOTPILOT_MAX_TIP_LAMPORTS',
    );
  }

  return parsed.data;
}
