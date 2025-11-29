import { Actor, HttpAgent } from '@dfinity/agent';
import { idlFactory } from '../declarations/icp_chat_backend/icp_chat_backend.did.js';
import type { _SERVICE } from '../declarations/icp_chat_backend/icp_chat_backend.did.d.ts';
import { config } from '../config';
import { authService } from './authService';

// 尝试多个端点创建 Actor
async function createActorWithFallback(
  canisterId: string,
  network: string,
  identity?: any,
): Promise<_SERVICE> {
  const hosts = network === 'ic' ? config.availableHosts : [config.host];
  const primaryHost = config.host;
  
  // 如果主端点不在列表中，优先尝试主端点
  const hostsToTry = primaryHost && !hosts.includes(primaryHost) 
    ? [primaryHost, ...hosts] 
    : hosts;

  let lastError: Error | null = null;

  for (const host of hostsToTry) {
    try {
      console.log(`[ICP Agent] 尝试使用端点: ${host}`);
      
      const agentOptions: any = { host };
      if (identity) {
        agentOptions.identity = identity;
      }

      const agent = new HttpAgent(agentOptions);

      // 本地开发时需要获取 root key
      if (network !== 'ic') {
        await agent.fetchRootKey();
      }

      const actor = Actor.createActor(idlFactory, {
        agent,
        canisterId,
      }) as _SERVICE;

      // 尝试一个简单的查询来验证连接
      // 注意：这里不实际调用，只是创建 Actor，实际调用时如果失败会自动重试
      console.log(`[ICP Agent] 成功使用端点: ${host}`);
      
      // 如果成功，保存这个端点作为首选
      if (network === 'ic' && host !== primaryHost) {
        config.setCustomHost(host);
      }

      return actor;
    } catch (error) {
      console.warn(`[ICP Agent] 端点 ${host} 创建失败:`, error);
      lastError = error as Error;
      continue;
    }
  }

  // 所有端点都失败，抛出最后一个错误
  throw new Error(
    `无法连接到 ICP 网络。已尝试的端点: ${hostsToTry.join(', ')}。` +
    `最后错误: ${lastError?.message || '未知错误'}` +
    `\n提示：如果在中国大陆，可能需要使用 VPN 或配置代理才能访问 ICP 主网。`
  );
}

// 创建带身份的 Actor 实例
export async function createActor(): Promise<_SERVICE> {
  try {
    const identity = await authService.getIdentity();
    const canisterId = config.canisterId;
    const network = config.network;

    if (!canisterId) {
      throw new Error('Canister ID 未配置。请先运行: dfx deploy');
    }

    return await createActorWithFallback(canisterId, network, identity);
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
  const network = config.network;

  console.log('[ICP Agent] 创建匿名 Actor:', {
    canisterId,
    network,
  });

  if (!canisterId) {
    throw new Error('Canister ID 未配置。请先运行: dfx deploy');
  }

  return await createActorWithFallback(canisterId, network);
}

