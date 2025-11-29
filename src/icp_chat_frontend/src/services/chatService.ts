import { createActor, createAnonymousActor } from './icpAgent';
import type { _SERVICE } from '../declarations/icp_chat_backend/icp_chat_backend.did.d.ts';
import { encryptionService } from './encryptionService';
import { getClientId } from './clientIdentity';

export interface Message {
  id: number;
  author: string;
  senderId: string;
  senderPrincipal?: string | null; // 发送者的 Principal（如果是已登录用户）
  authorAvatar?: string | null;
  authorColor?: string | null;
  text: string;
  timestamp: bigint;
  imageId?: number | null;
}

export interface MessagePage {
  messages: Message[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface CachedMessages {
  messages: Message[];
  timestamp: number;
  messageCount: number;
}

class ChatService {
  private actor: _SERVICE | null = null;
  private readonly DIRECT_UPLOAD_LIMIT = 3.5 * 1024 * 1024; // 3.5MB
  private readonly CHUNK_SIZE = 1 * 1024 * 1024; // 1MB
  
  // 消息缓存
  private messagesCache: CachedMessages | null = null;
  
  // 缓存过期时间（10秒，因为聊天消息需要实时性）
  private readonly CACHE_EXPIRY = 10 * 1000;

  async initialize(useAuth: boolean = false) {
    try {
      if (useAuth) {
        this.actor = await createActor();
      } else {
        this.actor = await createAnonymousActor();
      }
      console.log('[ChatService] 初始化成功');
    } catch (error) {
      console.error('[ChatService] 初始化失败:', error);
      throw error;
    }
  }

  async uploadImage(imageBlob: Blob): Promise<{ success: boolean; imageId?: number; error?: string }> {
    if (!this.actor) {
      await this.initialize();
    }

    try {
      console.log(`[ChatService] 开始上传图片，大小: ${imageBlob.size} bytes, 类型: ${imageBlob.type}`);
      const arrayBuffer = await imageBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      if (uint8Array.length <= this.DIRECT_UPLOAD_LIMIT) {
        return this.uploadImageDirect(uint8Array);
      }

      return this.uploadImageInChunks(uint8Array, imageBlob.type || 'application/octet-stream');
    } catch (error) {
      console.error('[ChatService] 图片上传异常:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '上传图片失败',
      };
    }
  }

  private async uploadImageDirect(uint8Array: Uint8Array): Promise<{ success: boolean; imageId?: number; error?: string }> {
    const bytes = Array.from(uint8Array);
    console.log(`[ChatService] 走直传路径，字节长度: ${bytes.length}`);
    const result = await this.actor!.uploadImage(bytes);
    if ('ok' in result) {
      const imageId = Number(result.ok);
      console.log(`[ChatService] 图片上传成功，imageId: ${imageId}`);
      return {
        success: true,
        imageId,
      };
    }
    console.error(`[ChatService] 图片上传失败: ${result.err}`);
    return {
      success: false,
      error: result.err,
    };
  }

  private async uploadImageInChunks(
    uint8Array: Uint8Array,
    mimeType: string
  ): Promise<{ success: boolean; imageId?: number; error?: string }> {
    console.log('[ChatService] 使用分块上传策略');
    const startResult = await this.actor!.startImageUpload(BigInt(uint8Array.length), mimeType);
    if ('err' in startResult) {
      console.error('[ChatService] 创建上传会话失败:', startResult.err);
      return {
        success: false,
        error: startResult.err,
      };
    }

    const uploadId = startResult.ok;
    let offset = 0;
    while (offset < uint8Array.length) {
      const end = Math.min(offset + this.CHUNK_SIZE, uint8Array.length);
      const chunk = uint8Array.slice(offset, end);
      const isFinal = end >= uint8Array.length;
      console.log(`[ChatService] 上传分块 offset=${offset}, end=${end}, isFinal=${isFinal}`);
      const chunkResult = await this.actor!.uploadImageChunk(uploadId, Array.from(chunk), isFinal);
      if ('err' in chunkResult) {
        console.error('[ChatService] 分块上传失败:', chunkResult.err);
        return {
          success: false,
          error: chunkResult.err,
        };
      }

      if (isFinal) {
        const optImageId = chunkResult.ok;
        if (Array.isArray(optImageId) && optImageId.length > 0) {
          const imageId = Number(optImageId[0]);
          console.log(`[ChatService] 分块上传完成，imageId: ${imageId}`);
          return {
            success: true,
            imageId,
          };
        }
        console.error('[ChatService] 分块上传完成但未返回图片ID');
        return {
          success: false,
          error: '图片上传失败，未返回图片ID',
        };
      }

      offset = end;
    }

    console.error('[ChatService] 分块上传流程异常结束');
    return {
      success: false,
      error: '图片上传失败，分块流程异常',
    };
  }

  async getImage(imageId: number): Promise<Blob | null> {
    if (!this.actor) {
      await this.initialize();
    }

    try {
      console.log(`[ChatService] 开始获取图片 ID ${imageId}`);
      const result = await this.actor!.getImage(BigInt(imageId));
      console.log(`[ChatService] getImage 返回结果:`, result);
      
      // getImage 返回 Opt<Vec<Nat8>>，在 JavaScript 中表示为 [] 或 [number[]]
      if (!result || !Array.isArray(result) || result.length === 0) {
        console.warn(`图片 ID ${imageId} 不存在或为空`);
        return null;
      }
      
      // result 是 [number[]] 格式，取第一个元素
      const bytes = result[0];
      if (!bytes || bytes.length === 0) {
        console.warn(`图片 ID ${imageId} 的数据为空`);
        return null;
      }
      
      console.log(`[ChatService] 获取到图片字节数组，长度: ${bytes.length}`);
      // 将字节数组转换为 Blob
      const uint8Array = new Uint8Array(bytes);
      const blob = new Blob([uint8Array]);
      console.log(`[ChatService] 成功获取图片 ID ${imageId}, 大小: ${blob.size} bytes`);
      return blob;
    } catch (error) {
      console.error(`[ChatService] 获取图片 ID ${imageId} 失败:`, error);
      throw error; // 重新抛出错误，让调用者知道失败原因
    }
  }

  async sendMessage(text: string, imageId?: number | null): Promise<{ success: boolean; message?: Message; error?: string }> {
    if (!this.actor) {
      await this.initialize();
    }

    try {
      // 加密消息文本（如果有文本内容）
      let encryptedText = text;
      if (text && text.trim().length > 0) {
        try {
          encryptedText = await encryptionService.encrypt(text);
          console.log('[ChatService] 消息已加密');
        } catch (error) {
          console.error('[ChatService] 加密失败:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : '消息加密失败',
          };
        }
      }

      // ICP 中 Opt<T> 类型在 JavaScript 中表示为数组：[] 表示 null，[value] 表示 some(value)
      const imageIdOpt: [] | [bigint] = imageId !== undefined && imageId !== null ? [BigInt(imageId)] : [];
      const textPreview = text.length > 50 ? `${text.substring(0, 50)}...` : text;
      console.log(`[ChatService] 发送消息，text: "${textPreview}", imageId: ${imageId}, imageIdOpt:`, imageIdOpt);
      const senderId = getClientId();
      const result = await this.actor!.sendMessage(encryptedText, imageIdOpt, senderId);
      if ('ok' in result) {
        // 清除消息缓存，因为发送了新消息
        this.clearMessagesCache();
        const msg = result.ok;
        // imageId 是 Opt<Nat>，在 JavaScript 中表示为 [] 或 [bigint]
        const imageIdValue = Array.isArray(msg.imageId) && msg.imageId.length > 0 ? Number(msg.imageId[0]) : null;
        
        // 解密返回的消息文本（用于显示）
        let decryptedText = msg.text;
        try {
          decryptedText = await encryptionService.decrypt(msg.text);
          // 如果返回的是加密文本（解密失败），检查是否是旧消息
          if (decryptedText === msg.text && encryptionService.isEncrypted(msg.text)) {
            console.warn('[ChatService] 返回消息解密失败，可能是密钥不匹配');
          }
        } catch (error) {
          // 如果解密抛出异常（不应该发生，因为 decrypt 现在会返回原文）
          console.warn('[ChatService] 解密返回消息异常，使用原始文本:', error);
          decryptedText = msg.text;
        }
        
        console.log(`[ChatService] 消息发送成功，消息 ID: ${Number(msg.id)}, imageId: ${imageIdValue}, 原始 imageId:`, msg.imageId);
        const authorAvatarValue = Array.isArray(msg.authorAvatar) && msg.authorAvatar.length > 0 ? msg.authorAvatar[0] : null;
        const authorColorValue = Array.isArray(msg.authorColor) && msg.authorColor.length > 0 ? msg.authorColor[0] : null;
        const senderPrincipalValue = Array.isArray(msg.senderPrincipal) && msg.senderPrincipal.length > 0 ? String(msg.senderPrincipal[0]) : null;
        return {
          success: true,
          message: {
            id: Number(msg.id),
            author: msg.author,
            senderId: msg.senderId,
            senderPrincipal: senderPrincipalValue,
            authorAvatar: authorAvatarValue,
            authorColor: authorColorValue,
            text: decryptedText,
            timestamp: msg.timestamp,
            imageId: imageIdValue,
          },
        };
      } else {
        console.error(`[ChatService] 消息发送失败: ${result.err}`);
        return {
          success: false,
          error: result.err,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '发送消息失败',
      };
    }
  }

  /**
   * 检查消息缓存是否有效
   */
  private isMessagesCacheValid(): boolean {
    if (!this.messagesCache) return false;
    const now = Date.now();
    return (now - this.messagesCache.timestamp) < this.CACHE_EXPIRY;
  }

  /**
   * 清除消息缓存（发送新消息后调用）
   */
  clearMessagesCache(): void {
    this.messagesCache = null;
  }

  async getLastMessages(n: number = 50, forceRefresh: boolean = false): Promise<Message[]> {
    if (!this.actor) {
      await this.initialize();
    }

    // 检查缓存
    if (!forceRefresh && this.isMessagesCacheValid() && this.messagesCache) {
      console.log('[ChatService] 从缓存获取消息');
      return this.messagesCache.messages;
    }

    try {
      console.log('[ChatService] 从服务器获取消息');
      const messages = await this.actor!.getLastMessages(BigInt(n));
      // 并行解密所有消息
      const decryptedMessages = await Promise.all(
        messages.map(async (msg) => {
        // imageId 是 Opt<Nat>，在 JavaScript 中表示为 [] 或 [bigint]
        const imageIdValue = Array.isArray(msg.imageId) && msg.imageId.length > 0 ? Number(msg.imageId[0]) : null;
          
          // 尝试解密消息文本
          let decryptedText = msg.text;
          try {
            decryptedText = await encryptionService.decrypt(msg.text);
            // 如果返回的是加密文本（解密失败），检查是否是旧消息
            if (decryptedText === msg.text && encryptionService.isEncrypted(msg.text)) {
              // 这是加密消息但解密失败，可能是密钥不匹配
              console.warn(`[ChatService] 消息 ${Number(msg.id)} 解密失败，可能是密钥不匹配`);
              // 保留加密文本，UI 会显示解密错误提示
            }
          } catch (error) {
            // 如果解密抛出异常（不应该发生，因为 decrypt 现在会返回原文）
            // 保留原始文本
            console.warn(`[ChatService] 消息 ${Number(msg.id)} 解密异常:`, error);
            decryptedText = msg.text;
          }
          
        const authorAvatarValue = Array.isArray(msg.authorAvatar) && msg.authorAvatar.length > 0 ? msg.authorAvatar[0] : null;
        const authorColorValue = Array.isArray(msg.authorColor) && msg.authorColor.length > 0 ? msg.authorColor[0] : null;
        const senderPrincipalValue = Array.isArray(msg.senderPrincipal) && msg.senderPrincipal.length > 0 ? String(msg.senderPrincipal[0]) : null;
        return {
          id: Number(msg.id),
          author: msg.author,
          senderId: msg.senderId,
          senderPrincipal: senderPrincipalValue,
          authorAvatar: authorAvatarValue,
          authorColor: authorColorValue,
            text: decryptedText,
          timestamp: msg.timestamp,
          imageId: imageIdValue,
        };
        })
      );
      
      // 更新缓存
      this.messagesCache = {
        messages: decryptedMessages,
        timestamp: Date.now(),
        messageCount: decryptedMessages.length,
      };
      
      return decryptedMessages;
    } catch (error) {
      console.error('获取消息失败:', error);
      // 如果出错，尝试返回缓存数据
      if (this.messagesCache) {
        console.log('[ChatService] 使用缓存数据作为降级方案');
        return this.messagesCache.messages;
      }
      return [];
    }
  }

  async getAllMessages(): Promise<Message[]> {
    if (!this.actor) {
      await this.initialize();
    }

    try {
      const messages = await this.actor!.getAllMessages();
      // 并行解密所有消息
      const decryptedMessages = await Promise.all(
        messages.map(async (msg) => {
        // imageId 是 Opt<Nat>，在 JavaScript 中表示为 [] 或 [bigint]
        const imageIdValue = Array.isArray(msg.imageId) && msg.imageId.length > 0 ? Number(msg.imageId[0]) : null;
          
          // 尝试解密消息文本
          let decryptedText = msg.text;
          try {
            decryptedText = await encryptionService.decrypt(msg.text);
            // 如果返回的是加密文本（解密失败），检查是否是旧消息
            if (decryptedText === msg.text && encryptionService.isEncrypted(msg.text)) {
              console.warn(`[ChatService] 消息 ${Number(msg.id)} 解密失败，可能是密钥不匹配`);
            }
          } catch (error) {
            // 如果解密抛出异常（不应该发生，因为 decrypt 现在会返回原文）
            console.warn(`[ChatService] 消息 ${Number(msg.id)} 解密异常:`, error);
            decryptedText = msg.text;
          }
          
        const authorAvatarValue = Array.isArray(msg.authorAvatar) && msg.authorAvatar.length > 0 ? msg.authorAvatar[0] : null;
        const authorColorValue = Array.isArray(msg.authorColor) && msg.authorColor.length > 0 ? msg.authorColor[0] : null;
        const senderPrincipalValue = Array.isArray(msg.senderPrincipal) && msg.senderPrincipal.length > 0 ? String(msg.senderPrincipal[0]) : null;
        return {
          id: Number(msg.id),
          author: msg.author,
          senderId: msg.senderId,
          senderPrincipal: senderPrincipalValue,
          authorAvatar: authorAvatarValue,
          authorColor: authorColorValue,
            text: decryptedText,
          timestamp: msg.timestamp,
          imageId: imageIdValue,
        };
        })
      );
      return decryptedMessages;
    } catch (error) {
      console.error('获取所有消息失败:', error);
      return [];
    }
  }

  async getMessagesPage(page: number, pageSize: number): Promise<MessagePage> {
    if (!this.actor) {
      await this.initialize();
    }

    try {
      const result = await this.actor!.getMessagesPage(BigInt(page), BigInt(pageSize));
      // 并行解密所有消息
      const decryptedMessages = await Promise.all(
        result.messages.map(async (msg) => {
          // imageId 是 Opt<Nat>，在 JavaScript 中表示为 [] 或 [bigint]
          const imageIdValue = Array.isArray(msg.imageId) && msg.imageId.length > 0 ? Number(msg.imageId[0]) : null;
          
          // 尝试解密消息文本
          let decryptedText = msg.text;
          try {
            decryptedText = await encryptionService.decrypt(msg.text);
            // 如果返回的是加密文本（解密失败），检查是否是旧消息
            if (decryptedText === msg.text && encryptionService.isEncrypted(msg.text)) {
              console.warn(`[ChatService] 消息 ${Number(msg.id)} 解密失败，可能是密钥不匹配`);
            }
          } catch (error) {
            // 如果解密抛出异常（不应该发生，因为 decrypt 现在会返回原文）
            console.warn(`[ChatService] 消息 ${Number(msg.id)} 解密异常:`, error);
            decryptedText = msg.text;
          }
          
          const authorAvatarValue = Array.isArray(msg.authorAvatar) && msg.authorAvatar.length > 0 ? msg.authorAvatar[0] : null;
          const authorColorValue = Array.isArray(msg.authorColor) && msg.authorColor.length > 0 ? msg.authorColor[0] : null;
          const senderPrincipalValue = Array.isArray(msg.senderPrincipal) && msg.senderPrincipal.length > 0 ? String(msg.senderPrincipal[0]) : null;
          return {
            id: Number(msg.id),
            author: msg.author,
            senderId: msg.senderId,
            senderPrincipal: senderPrincipalValue,
            authorAvatar: authorAvatarValue,
            authorColor: authorColorValue,
            text: decryptedText,
            timestamp: msg.timestamp,
            imageId: imageIdValue,
          };
        })
      );
      
      return {
        messages: decryptedMessages,
        total: Number(result.total),
        page: Number(result.page),
        pageSize: Number(result.pageSize),
        totalPages: Number(result.totalPages),
      };
    } catch (error) {
      console.error('分页获取消息失败:', error);
      return {
        messages: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }
  }

  async getMessageCount(forceRefresh: boolean = false): Promise<number> {
    // 如果缓存有效，使用缓存中的消息数量
    if (!forceRefresh && this.isMessagesCacheValid() && this.messagesCache) {
      return this.messagesCache.messageCount;
    }

    if (!this.actor) {
      await this.initialize();
    }

    try {
      const count = await this.actor!.getMessageCount();
      const messageCount = Number(count);
      
      // 更新缓存中的消息数量
      if (this.messagesCache) {
        this.messagesCache.messageCount = messageCount;
      }
      
      return messageCount;
    } catch (error) {
      console.error('获取消息数量失败:', error);
      // 如果出错，尝试返回缓存中的数量
      if (this.messagesCache) {
        return this.messagesCache.messageCount;
      }
      return 0;
    }
  }

  async clearAllMessages(): Promise<boolean> {
    if (!this.actor) {
      await this.initialize();
    }

    try {
      return await this.actor!.clearAllMessages();
    } catch (error) {
      console.error('清空消息失败:', error);
      return false;
    }
  }

  // ========== 密钥同步相关功能 ==========

  /**
   * 同步加密密钥到服务器
   */
  async syncEncryptionKey(): Promise<{ success: boolean; error?: string }> {
    if (!this.actor) {
      await this.initialize();
    }

    try {
      // 检查方法是否存在
      if (typeof this.actor!.saveEncryptionKey !== 'function') {
        return {
          success: false,
          error: '密钥同步功能需要重新部署后端。请运行: dfx deploy icp_chat_backend',
        };
      }

      const keyBase64 = await encryptionService.exportKeyString();
      const result = await this.actor!.saveEncryptionKey(keyBase64);
      if ('ok' in result) {
        console.log('[ChatService] 密钥同步成功');
        return { success: true };
      } else {
        console.error('[ChatService] 密钥同步失败:', result.err);
        return { success: false, error: result.err };
      }
    } catch (error) {
      console.error('[ChatService] 密钥同步异常:', error);
      // 检查是否是方法不存在的错误
      if (error instanceof TypeError && error.message.includes('is not a function')) {
        return {
          success: false,
          error: '密钥同步功能需要重新部署后端。请运行: dfx deploy icp_chat_backend',
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : '密钥同步失败',
      };
    }
  }

  /**
   * 从服务器获取加密密钥
   */
  async getEncryptionKeyFromServer(): Promise<{ success: boolean; key?: string; error?: string }> {
    if (!this.actor) {
      await this.initialize();
    }

    try {
      // 检查方法是否存在
      if (typeof this.actor!.getEncryptionKey !== 'function') {
        return {
          success: false,
          error: '密钥同步功能需要重新部署后端。请运行: dfx deploy icp_chat_backend',
        };
      }

      const result = await this.actor!.getEncryptionKey();
      if (result && result.length > 0) {
        const keyBase64 = result[0];
        console.log('[ChatService] 从服务器获取密钥成功');
        return { success: true, key: keyBase64 };
      } else {
        return { success: false, error: '服务器上没有保存的密钥' };
      }
    } catch (error) {
      console.error('[ChatService] 获取密钥异常:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取密钥失败',
      };
    }
  }

  /**
   * 从服务器恢复加密密钥
   */
  async restoreEncryptionKey(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.getEncryptionKeyFromServer();
      if (result.success && result.key) {
        await encryptionService.importKeyString(result.key);
        console.log('[ChatService] 密钥恢复成功');
        return { success: true };
      } else {
        return { success: false, error: result.error || '无法获取密钥' };
      }
    } catch (error) {
      console.error('[ChatService] 密钥恢复异常:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '密钥恢复失败',
      };
    }
  }

  /**
   * 删除服务器上的加密密钥
   */
  async deleteEncryptionKeyFromServer(): Promise<{ success: boolean; error?: string }> {
    if (!this.actor) {
      await this.initialize();
    }

    try {
      // 检查方法是否存在
      if (typeof this.actor!.deleteEncryptionKey !== 'function') {
        return {
          success: false,
          error: '密钥同步功能需要重新部署后端。请运行: dfx deploy icp_chat_backend',
        };
      }

      const result = await this.actor!.deleteEncryptionKey();
      if (result) {
        console.log('[ChatService] 服务器密钥删除成功');
        return { success: true };
      } else {
        return { success: false, error: '删除失败' };
      }
    } catch (error) {
      console.error('[ChatService] 删除密钥异常:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除密钥失败',
      };
    }
  }

  // ========== 群组密钥相关功能 ==========

  /**
   * 设置群组密钥到服务器
   */
  async setGroupKey(groupId: string, keyBase64: string): Promise<{ success: boolean; error?: string }> {
    if (!this.actor) {
      await this.initialize();
    }

    try {
      // 检查方法是否存在
      if (typeof this.actor!.setGroupKey !== 'function') {
        return {
          success: false,
          error: '群组密钥功能需要重新部署后端。请运行: dfx deploy icp_chat_backend',
        };
      }

      const result = await this.actor!.setGroupKey(groupId, keyBase64);
      if ('ok' in result) {
        // 同时保存到本地缓存
        await encryptionService.setGroupKey(groupId, keyBase64);
        console.log(`[ChatService] 群组 ${groupId} 密钥设置成功`);
        return { success: true };
      } else {
        console.error(`[ChatService] 群组 ${groupId} 密钥设置失败:`, result.err);
        return { success: false, error: result.err };
      }
    } catch (error) {
      console.error('[ChatService] 设置群组密钥异常:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '设置群组密钥失败',
      };
    }
  }

  /**
   * 从服务器获取群组密钥
   */
  async getGroupKey(groupId: string): Promise<{ success: boolean; key?: string; error?: string }> {
    if (!this.actor) {
      await this.initialize();
    }

    try {
      // 检查方法是否存在
      if (typeof this.actor!.getGroupKey !== 'function') {
        return {
          success: false,
          error: '群组密钥功能需要重新部署后端。请运行: dfx deploy icp_chat_backend',
        };
      }

      const result = await this.actor!.getGroupKey(groupId);
      if (result && result.length > 0) {
        const keyBase64 = result[0];
        if (keyBase64) {
          // 同时保存到本地缓存
          await encryptionService.setGroupKey(groupId, keyBase64);
          console.log(`[ChatService] 群组 ${groupId} 密钥获取成功`);
          return { success: true, key: keyBase64 };
        }
      }
      return { success: false, error: `群组 ${groupId} 的密钥不存在` };
    } catch (error) {
      console.error('[ChatService] 获取群组密钥异常:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取群组密钥失败',
      };
    }
  }

  /**
   * 删除群组密钥
   */
  async deleteGroupKey(groupId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.actor) {
      await this.initialize();
    }

    try {
      // 检查方法是否存在
      if (typeof this.actor!.deleteGroupKey !== 'function') {
        return {
          success: false,
          error: '群组密钥功能需要重新部署后端。请运行: dfx deploy icp_chat_backend',
        };
      }

      const result = await this.actor!.deleteGroupKey(groupId);
      if (result) {
        console.log(`[ChatService] 群组 ${groupId} 密钥删除成功`);
        return { success: true };
      } else {
        return { success: false, error: '删除失败' };
      }
    } catch (error) {
      console.error('[ChatService] 删除群组密钥异常:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除群组密钥失败',
      };
    }
  }
}

export const chatService = new ChatService();

