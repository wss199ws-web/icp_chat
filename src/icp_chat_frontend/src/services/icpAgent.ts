import { Actor, HttpAgent } from '@dfinity/agent';
import { AuthClient } from '@dfinity/auth-client';
import { idlFactory } from '../declarations/icp_chat_backend/icp_chat_backend.did.js';
import type { _SERVICE } from '../declarations/icp_chat_backend/icp_chat_backend.did.d.ts';
import { config } from '../config';

// 创建 Actor 实例
export async function createActor(): Promise<_SERVICE> {
  const authClient = await AuthClient.create();
  const identity = authClient.getIdentity();

  const agent = new HttpAgent({
    identity,
    host: config.host,
  });

  // 本地开发时需要获取 root key
  if (config.network !== 'ic') {
    await agent.fetchRootKey();
  }

  return Actor.createActor(idlFactory, {
    agent,
    canisterId: config.canisterId,
  });
}

// 获取匿名 Actor（用于未登录用户）
export async function createAnonymousActor(): Promise<_SERVICE> {
  const canisterId = config.canisterId;
  const host = config.host;
  const network = config.network;

  console.log('[ICP Agent] 创建匿名 Actor:', {
    canisterId,
    host,
    network,
  });

  if (!canisterId) {
    throw new Error('Canister ID 未配置。请先运行: dfx deploy');
  }

  const agent = new HttpAgent({
    host,
  });

  // 本地开发时需要获取 root key
  if (network !== 'ic') {
    console.log('[ICP Agent] 获取本地 root key...');
    await agent.fetchRootKey();
  }

  return Actor.createActor(idlFactory, {
    agent,
    canisterId,
  });
}

