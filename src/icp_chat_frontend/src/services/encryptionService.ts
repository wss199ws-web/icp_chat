/**
 * 端到端加密服务
 * 使用 Web Crypto API 实现 AES-GCM 加密
 * 注意：在本地开发环境（DFX_NETWORK=local）下禁用加密
 */

import { config } from '../config';

const STORAGE_KEY = 'icp_chat_encryption_key';
const KEY_ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256; // 256位密钥
const IV_LENGTH = 12; // 96位初始化向量（GCM推荐）
const TAG_LENGTH = 128; // 128位认证标签

/**
 * 检查是否应该启用加密
 * 本地开发环境禁用加密
 */
function shouldEnableEncryption(): boolean {
  const network = config.network;
  const enabled = network !== 'local';
  if (!enabled) {
    console.log('[EncryptionService] 本地开发环境，禁用端到端加密');
  }
  return enabled;
}

export interface EncryptionResult {
  encrypted: string; // Base64编码的加密数据
  iv: string; // Base64编码的初始化向量
}

class EncryptionService {
  private key: CryptoKey | null = null;
  private keyPromise: Promise<CryptoKey> | null = null;
  private cryptoAvailable: boolean | null = null;

  /**
   * 检查 Web Crypto API 是否可用
   */
  private checkCryptoAvailable(): boolean {
    if (this.cryptoAvailable !== null) {
      return this.cryptoAvailable;
    }

    // 检查全局 crypto 对象
    if (typeof crypto === 'undefined') {
      this.cryptoAvailable = false;
      return false;
    }

    // 检查 crypto.subtle（在非 HTTPS 环境下可能不可用）
    if (!crypto.subtle) {
      this.cryptoAvailable = false;
      return false;
    }

    // 检查是否在安全上下文中（HTTPS 或 localhost）
    const isSecureContext = 
      typeof window !== 'undefined' && 
      (window.isSecureContext || 
       window.location.protocol === 'https:' ||
       window.location.hostname === 'localhost' ||
       window.location.hostname === '127.0.0.1');

    if (!isSecureContext) {
      console.warn('[EncryptionService] 非安全上下文，Web Crypto API 可能不可用');
    }

    this.cryptoAvailable = true;
    return true;
  }

  /**
   * 生成新的加密密钥
   */
  private async generateKey(): Promise<CryptoKey> {
    if (!this.checkCryptoAvailable() || !crypto.subtle) {
      throw new Error('Web Crypto API 不可用，请使用 HTTPS 或 localhost 访问');
    }
    return await crypto.subtle.generateKey(
      {
        name: KEY_ALGORITHM,
        length: KEY_LENGTH,
      },
      true, // 可导出
      ['encrypt', 'decrypt']
    );
  }

  /**
   * 从 ArrayBuffer 导入密钥
   */
  private async importKey(keyData: ArrayBuffer): Promise<CryptoKey> {
    if (!this.checkCryptoAvailable() || !crypto.subtle) {
      throw new Error('Web Crypto API 不可用，请使用 HTTPS 或 localhost 访问');
    }
    return await crypto.subtle.importKey(
      'raw',
      keyData,
      {
        name: KEY_ALGORITHM,
        length: KEY_LENGTH,
      },
      true, // 可导出
      ['encrypt', 'decrypt']
    );
  }

  /**
   * 导出密钥为 ArrayBuffer
   */
  private async exportKey(key: CryptoKey): Promise<ArrayBuffer> {
    if (!this.checkCryptoAvailable() || !crypto.subtle) {
      throw new Error('Web Crypto API 不可用，请使用 HTTPS 或 localhost 访问');
    }
    return await crypto.subtle.exportKey('raw', key);
  }

  /**
   * 获取或生成加密密钥
   */
  async getKey(): Promise<CryptoKey> {
    // 如果已有密钥，直接返回
    if (this.key) {
      return this.key;
    }

    // 如果正在生成密钥，等待完成
    if (this.keyPromise) {
      return await this.keyPromise;
    }

    // 创建新的密钥生成 Promise
    this.keyPromise = (async () => {
      try {
        // 尝试从 localStorage 加载密钥
        const storedKey = localStorage.getItem(STORAGE_KEY);
        if (storedKey) {
          try {
            // 将 Base64 字符串转换为 ArrayBuffer
            const keyData = this.base64ToArrayBuffer(storedKey);
            this.key = await this.importKey(keyData);
            console.log('[EncryptionService] 从本地存储加载密钥成功');
            return this.key;
          } catch (error) {
            console.warn('[EncryptionService] 加载密钥失败，将生成新密钥:', error);
            // 如果加载失败，删除无效的密钥
            localStorage.removeItem(STORAGE_KEY);
          }
        }

        // 生成新密钥
        console.log('[EncryptionService] 生成新的加密密钥');
        this.key = await this.generateKey();
        
        // 保存密钥到 localStorage
        const keyData = await this.exportKey(this.key);
        const keyBase64 = this.arrayBufferToBase64(keyData);
        localStorage.setItem(STORAGE_KEY, keyBase64);
        console.log('[EncryptionService] 密钥已保存到本地存储');

        return this.key;
      } finally {
        this.keyPromise = null;
      }
    })();

    return await this.keyPromise;
  }

  /**
   * 重置密钥（生成新密钥）
   */
  async resetKey(): Promise<void> {
    this.key = null;
    this.keyPromise = null;
    localStorage.removeItem(STORAGE_KEY);
    await this.getKey();
    console.log('[EncryptionService] 密钥已重置');
  }

  /**
   * 加密文本
   */
  async encrypt(text: string): Promise<string> {
    try {
      // 本地开发环境不加密，直接返回原文
      if (!shouldEnableEncryption()) {
        console.log('[EncryptionService] 本地环境，跳过加密');
        return text;
      }

      // 检查 Web Crypto API 是否可用
      if (!this.checkCryptoAvailable()) {
        const protocol = typeof window !== 'undefined' ? window.location.protocol : 'unknown';
        const hostname = typeof window !== 'undefined' ? window.location.hostname : 'unknown';
        throw new Error(
          `Web Crypto API 不可用。` +
          `请使用 HTTPS 协议访问（当前: ${protocol}）` +
          `或通过 localhost 访问（当前: ${hostname}）`
        );
      }

      if (!crypto.subtle) {
        throw new Error('crypto.subtle 不可用，请使用 HTTPS 或 localhost 访问');
      }

      // 空字符串也需要加密（保持一致性）
      const key = await this.getKey();
      
      // 生成随机初始化向量
      const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
      
      // 将文本转换为 ArrayBuffer
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      
      // 加密
      const encrypted = await crypto.subtle.encrypt(
        {
          name: KEY_ALGORITHM,
          iv: iv,
          tagLength: TAG_LENGTH,
        },
        key,
        data
      );

      // 将 IV 和加密数据组合：IV + 加密数据
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);

      // 转换为 Base64
      const base64 = this.arrayBufferToBase64(combined.buffer);
      
      // 添加标识前缀，便于识别加密消息
      return `encrypted:${base64}`;
    } catch (error) {
      console.error('[EncryptionService] 加密失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      throw new Error(`消息加密失败: ${errorMessage}`);
    }
  }

  /**
   * 解密文本
   */
  async decrypt(encryptedText: string): Promise<string> {
    try {
      // 检查是否是加密消息
      if (!encryptedText.startsWith('encrypted:')) {
        // 不是加密消息，直接返回原文（向后兼容）
        return encryptedText;
      }

      // 本地开发环境：如果消息是加密的，尝试解密（可能是从生产环境来的数据）
      if (!shouldEnableEncryption()) {
        console.log('[EncryptionService] 本地环境，尝试解密（可能是生产环境数据）');
        // 在本地环境下，如果 Web Crypto API 可用，尝试解密
        // 如果不可用或解密失败，返回提示信息
        if (!this.checkCryptoAvailable() || !crypto.subtle) {
          console.warn('[EncryptionService] 本地环境 Web Crypto API 不可用，无法解密加密消息');
          return '[加密消息 - 本地环境无法解密]';
        }
        // 继续执行解密流程（下面会处理）
      }

      // 检查 Web Crypto API 是否可用（生产环境需要）
      if (!this.checkCryptoAvailable()) {
        const protocol = typeof window !== 'undefined' ? window.location.protocol : 'unknown';
        const hostname = typeof window !== 'undefined' ? window.location.hostname : 'unknown';
        throw new Error(
          `Web Crypto API 不可用，无法解密消息。` +
          `请使用 HTTPS 协议访问（当前: ${protocol}）` +
          `或通过 localhost 访问（当前: ${hostname}）`
        );
      }

      if (!crypto.subtle) {
        throw new Error('crypto.subtle 不可用，无法解密消息');
      }

      // 检查是否是加密消息
      if (!encryptedText.startsWith('encrypted:')) {
        // 不是加密消息，直接返回原文（向后兼容）
        return encryptedText;
      }

      const key = await this.getKey();
      
      // 移除前缀（已经在上面检查过了）
      const base64 = encryptedText.substring('encrypted:'.length);
      
      // 验证 Base64 格式
      if (!base64 || base64.length === 0) {
        throw new Error('加密数据格式无效');
      }
      
      // 将 Base64 转换为 ArrayBuffer
      let combined: ArrayBuffer;
      try {
        combined = this.base64ToArrayBuffer(base64);
      } catch (error) {
        throw new Error('Base64 解码失败');
      }
      
      const combinedArray = new Uint8Array(combined);
      
      // 验证数据长度（至少需要 IV 的长度）
      if (combinedArray.length < IV_LENGTH) {
        throw new Error('加密数据长度不足');
      }
      
      // 提取 IV 和加密数据
      const iv = combinedArray.slice(0, IV_LENGTH);
      const encrypted = combinedArray.slice(IV_LENGTH);
      
      // 验证加密数据不为空
      if (encrypted.length === 0) {
        throw new Error('加密数据为空');
      }
      
      // 解密
      let decrypted: ArrayBuffer;
      try {
        decrypted = await crypto.subtle.decrypt(
          {
            name: KEY_ALGORITHM,
            iv: iv,
            tagLength: TAG_LENGTH,
          },
          key,
          encrypted
        );
      } catch (decryptError) {
        // 解密操作失败（可能是密钥不匹配、数据损坏等）
        console.error('[EncryptionService] 解密操作失败:', decryptError);
        // 返回原始加密文本，让调用者决定如何处理
        return encryptedText;
      }

      // 转换为文本
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('[EncryptionService] 解密过程出错:', error);
      // 如果解密失败，返回原始文本（可能是未加密的旧消息）
      // 这样不会影响消息显示
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.warn(`[EncryptionService] 解密失败，返回原始文本: ${errorMessage}`);
      return encryptedText;
    }
  }

  /**
   * 检查文本是否是加密消息
   */
  isEncrypted(text: string): boolean {
    return text.startsWith('encrypted:');
  }

  /**
   * 检查加密功能是否可用（公共方法）
   */
  isAvailable(): boolean {
    // 本地环境禁用加密
    if (!shouldEnableEncryption()) {
      return false;
    }
    return this.checkCryptoAvailable();
  }

  /**
   * 获取加密不可用的原因（用于显示给用户）
   */
  getUnavailableReason(): string | null {
    // 本地环境禁用加密是预期行为，不显示警告
    if (!shouldEnableEncryption()) {
      return null;
    }

    if (this.checkCryptoAvailable()) {
      return null;
    }

    if (typeof window === 'undefined') {
      return '非浏览器环境';
    }

    const protocol = window.location.protocol;
    const hostname = window.location.hostname;

    if (typeof crypto === 'undefined') {
      return '浏览器不支持 Web Crypto API';
    }

    if (!crypto.subtle) {
      if (protocol === 'http:' && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return 'Web Crypto API 需要 HTTPS 协议。请使用 HTTPS 访问，或通过 localhost 访问';
      }
      return 'Web Crypto API 不可用，请使用 HTTPS 或 localhost 访问';
    }

    return '加密功能不可用';
  }

  /**
   * ArrayBuffer 转 Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Base64 转 ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export const encryptionService = new EncryptionService();

