import { loadEnv } from './config/env';
import { OpenAiRetryAgent, RuleBasedAgent } from './agent/ai-agent';
import { FailureClassifier } from './lifecycle/failure-classifier';
import { JsonlLifecycleLogStore } from './lifecycle/lifecycle-log-store';
import { LifecycleTracker } from './lifecycle/lifecycle-tracker';
import { MockJitoClient, JitoJsonRpcClient } from './jito/jito-client';
import { JitoBundleBuilder } from './jito/bundle-builder';
import { DynamicTipOracle } from './jito/tip-oracle';
import {
  JitoLeaderSubmissionPlanner,
  MockSubmissionPlanner,
} from './jito/submission-planner';
import { SubmissionWindowCoordinator } from './jito/submission-window';
import { MockSolanaRpc, Web3SolanaRpc } from './solana/connection';
import { BlockhashManager } from './solana/blockhash-manager';
import { parseKeypair, parsePublicKey } from './solana/keypair';
import { TransferTransactionBuilder } from './solana/transaction-builder';
import {
  MockStreamClient,
  YellowstoneStreamClient,
} from './geyser/geyser-client';
import { TransactionEngine } from './transaction-engine/transaction-engine';
import { RetryDecisionExecutor } from './retry/retry-decision-executor';

export function createSlotPilotRuntime() {
  const env = loadEnv();
  const live = env.SLOTPILOT_ADAPTER_MODE === 'live';

  const solanaRpc = live
    ? new Web3SolanaRpc(env.SOLANA_RPC_URL!)
    : new MockSolanaRpc();
  const blockhashManager = new BlockhashManager(solanaRpc);
  const payer = parseKeypair(env.PAYER_PRIVATE_KEY);
  const jitoAuthKeypair = env.JITO_AUTH_PRIVATE_KEY
    ? parseKeypair(env.JITO_AUTH_PRIVATE_KEY)
    : undefined;
  const recipient = parsePublicKey(env.RECIPIENT_PUBLIC_KEY);
  const transactionBuilder = new TransferTransactionBuilder(payer, recipient);
  const jitoClient = live
    ? new JitoJsonRpcClient(
        env.JITO_BLOCK_ENGINE_URL!,
        env.JITO_AUTH_UUID,
        env.JITO_TIP_FLOOR_URL,
        env.JITO_MIN_REQUEST_INTERVAL_MS,
        env.JITO_REQUEST_TIMEOUT_MS,
      )
    : new MockJitoClient();
  const tipOracle = new DynamicTipOracle(
    jitoClient,
    env.SLOTPILOT_MIN_TIP_LAMPORTS,
    env.SLOTPILOT_MAX_TIP_LAMPORTS,
    env.SLOTPILOT_PRIORITY_FEE_PRESSURE_SCALE_MICROLAMPORTS,
  );
  const bundleBuilder = new JitoBundleBuilder(jitoClient);
  const submissionPlanner =
    live && env.JITO_SEARCHER_GRPC_URL
      ? new JitoLeaderSubmissionPlanner(
          env.JITO_SEARCHER_GRPC_URL,
          env.SLOTPILOT_MAX_LEADER_WAIT_SLOTS,
          jitoAuthKeypair,
        )
      : new MockSubmissionPlanner();
  const stream = live
    ? new YellowstoneStreamClient(
        env.YELLOWSTONE_GRPC_ENDPOINT!,
        env.YELLOWSTONE_GRPC_TOKEN,
      )
    : new MockStreamClient();
  const lifecycleTracker = new LifecycleTracker(
    stream,
    solanaRpc,
    bundleBuilder,
    env.SLOTPILOT_LIFECYCLE_TIMEOUT_MS,
  );
  const submissionWindow = new SubmissionWindowCoordinator(
    submissionPlanner,
    env.SLOTPILOT_SUBMISSION_WINDOW_TIMEOUT_MS,
  );
  const classifier = new FailureClassifier();
  const agent =
    env.AGENT_MODE === 'openai' && env.OPENAI_API_KEY
      ? new OpenAiRetryAgent(
          env.OPENAI_API_KEY,
          env.OPENAI_MODEL,
          env.OPENAI_BASE_URL,
        )
      : new RuleBasedAgent();
  const retryExecutor = new RetryDecisionExecutor(
    agent,
    solanaRpc,
    stream,
    live ? env.SLOTPILOT_MIN_RETRY_DELAY_MS : 0,
    env.SLOTPILOT_MAX_HOLD_CYCLES,
  );
  const logs = new JsonlLifecycleLogStore(env.LOG_DIR);
  const engine = new TransactionEngine(
    env.NETWORK,
    solanaRpc,
    blockhashManager,
    transactionBuilder,
    tipOracle,
    bundleBuilder,
    stream,
    lifecycleTracker,
    submissionWindow,
    classifier,
    retryExecutor,
    logs,
    env.SLOTPILOT_MAX_RETRIES,
    !live,
  );

  return {
    env,
    engine,
    logs,
    solanaRpc,
    jitoClient,
    stream,
    submissionPlanner,
    agent,
    payerPublicKey: payer.publicKey.toBase58(),
  };
}
