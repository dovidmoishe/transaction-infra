import { Injectable } from '@nestjs/common';
import { loadEnv } from './config/env';

@Injectable()
export class AppService {
  getStatus() {
    const env = loadEnv();
    return {
      service: 'SlotPilot',
      status: 'ok',
      adapterMode: env.SLOTPILOT_ADAPTER_MODE,
      network: env.NETWORK,
      agentMode: env.AGENT_MODE,
      persistence: 'jsonl',
    };
  }
}
