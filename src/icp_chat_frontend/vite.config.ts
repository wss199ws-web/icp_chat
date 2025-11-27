import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 读取 DFX 生成的 .env 文件
function loadDfxEnv() {
  try {
    const envPath = resolve(__dirname, '../../.env')
    const envContent = readFileSync(envPath, 'utf-8')
    const env: Record<string, string> = {}
    
    envContent.split('\n').forEach(line => {
      // 支持两种格式: KEY='value' 或 KEY=value
      const match = line.match(/^([^=]+)=['"]?([^'"]*)['"]?$/)
      if (match) {
        const key = match[1].trim()
        const value = match[2].trim()
        if (key && value) {
          env[key] = value
        }
      }
    })
    
    console.log('[Vite Config] 从 .env 文件加载配置:', {
      network: env.DFX_NETWORK,
      canisterId: env.CANISTER_ID_ICP_CHAT_BACKEND || env.CANISTER_ID_icp_chat_backend,
    })
    
    return env
  } catch (error) {
    console.warn('[Vite Config] 无法读取 .env 文件，使用默认配置:', error)
    return {}
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载 DFX 环境变量
  const dfxEnv = loadDfxEnv()
  
  // 合并环境变量
  const env = {
    ...loadEnv(mode, process.cwd(), ''),
    ...dfxEnv,
  }

  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
    },
    server: {
      port: 8080,
      allowedHosts: ['local.bilibili.co', '127.0.0.1', '0.0.0.0'],
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:4943',
          changeOrigin: true,
        },
      },
    },
    define: {
      // 注入环境变量到代码中
      'import.meta.env.CANISTER_ID_ICP_CHAT_BACKEND': JSON.stringify(
        env.CANISTER_ID_ICP_CHAT_BACKEND || env.CANISTER_ID_icp_chat_backend || ''
      ),
      'import.meta.env.DFX_NETWORK': JSON.stringify(
        env.DFX_NETWORK || 'local'
      ),
      // 为浏览器环境提供 global polyfill
      'global': 'globalThis',
    },
    resolve: {
      alias: {
        // 确保某些 Node.js 模块在浏览器中可用
        'buffer': 'buffer',
        'process': 'process/browser',
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        define: {
          global: 'globalThis',
        },
      },
    },
  }
})
