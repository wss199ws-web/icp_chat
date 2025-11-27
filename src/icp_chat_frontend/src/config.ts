// 环境配置
// 优先使用 import.meta.env（Vite），如果没有则使用全局变量（DFX 注入）

// 从 .env 文件加载配置（DFX 会自动生成）
// 在浏览器环境中，DFX 会将环境变量注入到 window 对象
declare global {
  interface Window {
    __CANISTER_IDS__?: {
      icp_chat_backend?: string;
    };
    __ICP_ENV__?: {
      DFX_NETWORK?: string;
      CANISTER_ID_ICP_CHAT_BACKEND?: string;
    };
    process?: {
      env?: {
        DFX_NETWORK?: string;
        CANISTER_ID_ICP_CHAT_BACKEND?: string;
      };
    };
  }
}

// 运行时检测是否在主网
function detectNetwork(): string {
  if (typeof window === 'undefined') {
    return 'local';
  }
  
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const port = window.location.port;
  
  // 优先级 1: 通过 hostname 检测是否在主网（最可靠的方式）
  // ICP 主网的域名通常是 *.ic0.app 或 *.icp0.io
  if (hostname.includes('.ic0.app') || hostname.includes('.icp0.io')) {
    console.log('[Config] 通过 hostname 检测到主网:', hostname);
    return 'ic';
  }
  
  // 优先级 2: 通过协议检测（主网使用 https，本地通常使用 http）
  // 如果使用 https 且不是 localhost，很可能是主网
  if (protocol === 'https:' && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    // 但需要排除一些特殊情况，比如通过代理访问
    // 如果 hostname 不是本地地址，且使用 https，可能是主网
    console.log('[Config] 通过协议检测到可能是主网:', { protocol, hostname });
    // 这里不直接返回 'ic'，继续检查其他条件
  }
  
  // 优先级 3: 检查是否有 canister ID 在 URL 中（DFX 部署到主网后通常会有）
  const urlParams = new URLSearchParams(window.location.search);
  const hasCanisterId = urlParams.has('canisterId');
  
  // 如果 URL 中有 canisterId 参数，且不是通过 localhost:4943 访问，很可能是主网
  if (hasCanisterId && port !== '4943' && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    console.log('[Config] 通过 URL 参数检测到可能是主网（有 canisterId 且不是本地端口）');
    // 这里也不直接返回，继续检查
  }
  
  // 优先级 4: localhost 或 127.0.0.1 且端口是 4943，明确是本地网络
  if ((hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') && port === '4943') {
    console.log('[Config] 检测到本地网络:', { hostname, port });
    return 'local';
  }
  
  // 优先级 5: 如果通过 localhost 访问，检查构建时环境变量
  // 如果构建时环境变量是 'ic'，说明是主网部署（通过 DFX 代理访问）
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // 优先检查构建时注入的环境变量（最可靠）
    if (typeof import.meta !== 'undefined') {
      const env = import.meta.env as Record<string, string>;
      const network = env.VITE_DFX_NETWORK;
      if (network === 'ic') {
        console.log('[Config] 通过构建时环境变量检测到主网（通过 localhost 代理访问主网）');
        return 'ic';
      }
    }
    
    // 检查 window.__ICP_ENV__（HTML 中注入的）
    if (typeof window !== 'undefined' && window.__ICP_ENV__?.DFX_NETWORK === 'ic') {
      console.log('[Config] 通过 window.__ICP_ENV__ 检测到主网');
      return 'ic';
    }
    
    // 检查是否有主网的 canister ID（如果有主网 canister ID，说明是主网部署）
    const canisterId = config.canisterId;
    if (canisterId && canisterId.length > 0) {
      // 主网 canister ID 通常以特定前缀开头，但更可靠的方式是检查环境变量
      // 这里我们主要依赖环境变量，但如果环境变量不可用，至少确保有 canister ID
      console.log('[Config] localhost 访问，但检测到 canister ID，使用本地网络（DFX 代理）');
    } else {
      console.log('[Config] localhost 访问，未检测到 canister ID，使用本地网络');
    }
    
    // 默认 localhost 是本地网络
    return 'local';
  }
  
  // 优先级 6: 根据环境变量判断（构建时注入）
  if (typeof import.meta !== 'undefined') {
    const env = import.meta.env as Record<string, string>;
    const network = env.VITE_DFX_NETWORK;
    if (network) {
      console.log('[Config] 从 Vite 环境变量获取网络类型:', network);
      return network;
    }
  }
  
  if (typeof window !== 'undefined' && window.__ICP_ENV__?.DFX_NETWORK) {
    const network = window.__ICP_ENV__.DFX_NETWORK;
    console.log('[Config] 从 window.__ICP_ENV__ 获取网络类型:', network);
    return network;
  }
  
  if (typeof window !== 'undefined' && window.process?.env?.DFX_NETWORK) {
    const network = window.process.env.DFX_NETWORK;
    console.log('[Config] 从 window.process.env 获取网络类型:', network);
    return network;
  }
  
  // 默认本地网络
  console.log('[Config] 未检测到明确的网络类型，默认使用本地网络');
  return 'local';
}

// 从 URL 参数获取 canister ID（DFX 部署时会在 URL 中包含 canisterId 参数）
function getCanisterIdFromUrl(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  
  const urlParams = new URLSearchParams(window.location.search);
  const canisterId = urlParams.get('canisterId');
  
  // 也可以从 URL 路径中提取（DFX 部署格式：https://{canister-id}.ic0.app）
  if (!canisterId && window.location.hostname.includes('.')) {
    const parts = window.location.hostname.split('.');
    // 如果 hostname 是 canister-id.ic0.app 格式
    if (parts.length > 2 && parts[parts.length - 2] === 'ic0' && parts[parts.length - 1] === 'app') {
      // 这种情况下，前端 canister ID 在 hostname 中，后端 ID 需要从其他地方获取
      // 暂时返回 null，让其他方式处理
    }
  }
  
  return canisterId;
}

export const config = {
  get canisterId(): string {
    // 尝试多种方式获取 canister ID
    // 1. 从 URL 参数获取（DFX 部署时）
    const urlCanisterId = getCanisterIdFromUrl();
    if (urlCanisterId) {
      console.log('[Config] 从 URL 参数获取 canister ID:', urlCanisterId);
      return urlCanisterId;
    }
    
    // 2. Vite 环境变量（开发/构建时）- 由 vite.config.ts 注入
    if (typeof import.meta !== 'undefined') {
      const env = import.meta.env as Record<string, string>;
      const id = env.VITE_CANISTER_ID_ICP_CHAT_BACKEND;
      if (id) {
        console.log('[Config] 从 Vite 环境变量获取 canister ID:', id);
        return id;
      }
    }
    
    // 3. 从 window.__ICP_ENV__ 获取（HTML 中注入）
    if (typeof window !== 'undefined' && window.__ICP_ENV__?.CANISTER_ID_ICP_CHAT_BACKEND) {
      const id = window.__ICP_ENV__.CANISTER_ID_ICP_CHAT_BACKEND;
      if (id) {
        console.log('[Config] 从 window.__ICP_ENV__ 获取 canister ID:', id);
        return id;
      }
    }
    
    // 4. 从 window.__CANISTER_IDS__ 获取（DFX 可能注入）
    if (typeof window !== 'undefined' && window.__CANISTER_IDS__?.icp_chat_backend) {
      const id = window.__CANISTER_IDS__.icp_chat_backend;
      if (id) {
        console.log('[Config] 从 window.__CANISTER_IDS__ 获取 canister ID:', id);
        return id;
      }
    }
    
    // 5. 从全局变量获取（DFX 可能注入）
    if (typeof window !== 'undefined' && (window as any).CANISTER_ID_ICP_CHAT_BACKEND) {
      const id = (window as any).CANISTER_ID_ICP_CHAT_BACKEND;
      if (id) {
        console.log('[Config] 从全局变量获取 canister ID:', id);
        return id;
      }
    }
    
    // 6. Node.js 环境变量（构建时，浏览器中通常不可用）
    if (typeof process !== 'undefined' && process.env?.CANISTER_ID_ICP_CHAT_BACKEND) {
      const id = process.env.CANISTER_ID_ICP_CHAT_BACKEND;
      if (id) {
        console.log('[Config] 从 process.env 获取 canister ID:', id);
        return id;
      }
    }
    
    console.warn('[Config] 未找到 canister ID，返回空字符串');
    return '';
  },
  get network(): string {
    const network = detectNetwork();
    console.log('[Config] 检测到的网络类型:', network, 'hostname:', typeof window !== 'undefined' ? window.location.hostname : 'N/A');
    return network;
  },
  get host(): string {
    const network = this.network;
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    
    // 主网使用 icp-api.io，本地使用 localhost:4943
    // 特殊情况：如果通过 localhost 访问但 network 是 'ic'，说明是通过 DFX 代理访问主网
    // 这种情况下应该使用 localhost:4943（DFX 代理会转发到主网）
    let host: string;
    if (network === 'ic') {
      // 如果直接访问主网域名，使用主网 API
      if (hostname.includes('.ic0.app') || hostname.includes('.icp0.io')) {
        host = 'https://icp-api.io';
      } else {
        // 通过 localhost 代理访问主网，使用 localhost:4943
        host = 'http://localhost:4943';
      }
    } else {
      host = 'http://localhost:4943';
    }
    
    console.log('[Config] 使用的 host:', host, 'network:', network, 'hostname:', hostname, '当前 URL:', typeof window !== 'undefined' ? window.location.href : 'N/A');
    return host;
  },
};
