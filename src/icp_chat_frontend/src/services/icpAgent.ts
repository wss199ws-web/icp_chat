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

  // 所有端点都失败，检查是否是 canister_not_found 错误
  const errorMessage = lastError?.message || '未知错误';
  if (errorMessage.includes('canister_not_found') || errorMessage.includes('does not exist')) {
    throw new Error(
      `Canister 不存在 (canister_not_found)。\n` +
      `Canister ID: ${canisterId}\n` +
      `网络: ${network}\n` +
      `可能的原因：\n` +
      `1. Canister 未部署或已被删除\n` +
      `2. 使用了错误的 canister ID\n` +
      `3. 网络配置不匹配（本地/主网）\n` +
      `解决方案：\n` +
      `- 检查 canister 状态: dfx canister ${network === 'ic' ? '--network ic' : ''} status icp_chat_backend\n` +
      `- 重新部署: dfx deploy ${network === 'ic' ? '--network ic' : ''} --upgrade-unchanged icp_chat_backend\n` +
      `- 重新构建前端: cd src/icp_chat_frontend && npm run build\n` +
      `- 或运行修复脚本: ./fix-canister-id.sh ${network}`
    );
  }
  
  // 其他错误
  throw new Error(
    `无法连接到 ICP 网络。已尝试的端点: ${hostsToTry.join(', ')}。` +
    `最后错误: ${errorMessage}` +
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
      throw new Error(
        'Canister ID 未配置。\n' +
        '可能的原因：\n' +
        '1. 未运行 dfx deploy\n' +
        '2. .env 文件不存在或配置错误\n' +
        '3. 前端未重新构建\n' +
        '解决方案：\n' +
        '- 运行: dfx deploy --upgrade-unchanged icp_chat_backend\n' +
        '- 重新构建前端: cd src/icp_chat_frontend && npm run build\n' +
        '- 或运行修复脚本: ./fix-canister-id.sh'
      );
    }

    return await createActorWithFallback(canisterId, network, identity);
  } catch (error) {
    // 检查是否是 canister_not_found 错误
    if (error instanceof Error && (
      error.message.includes('canister_not_found') || 
      error.message.includes('does not exist')
    )) {
      // 直接抛出，不回退到匿名 Actor
      throw error;
    }
    
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

  if (!canisterId) {
    throw new Error(
      'Canister ID 未配置。\n' +
      '可能的原因：\n' +
      '1. 未运行 dfx deploy\n' +
      '2. .env 文件不存在或配置错误\n' +
      '3. 前端未重新构建\n' +
      '解决方案：\n' +
      '- 运行: dfx deploy --upgrade-unchanged icp_chat_backend\n' +
      '- 重新构建前端: cd src/icp_chat_frontend && npm run build\n' +
      '- 或运行修复脚本: ./fix-canister-id.sh'
    );
  }

  return await createActorWithFallback(canisterId, network);
}

