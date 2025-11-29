import { Actor, HttpAgent } from '@dfinity/agent';
import { AuthClient } from '@dfinity/auth-client';
import { idlFactory } from '../declarations/icp_chat_backend/icp_chat_backend.did.js';
import type { _SERVICE } from '../declarations/icp_chat_backend/icp_chat_backend.did.d.ts';
import { config } from '../config';

// 创建带身份的 Actor 实例
export async function createActor(): Promise<_SERVICE> {
  try {
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
  } catch (error) {
    // 某些开发环境（不安全上下文、缺少 SubtleCrypto 等）下 AuthClient 会因为没有 global crypto 而报错
    console.warn(
      '[ICP Agent] 创建带身份 Actor 失败，回退到匿名 Actor。错误：',
      error,
    );
    // 回退到匿名身份，至少保证功能可用；需要基于 Principal 的接口（如保存个人资料）会在后端被匿名校验拦截
    return createAnonymousActor();
  }
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

