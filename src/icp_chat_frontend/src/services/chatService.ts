import { createActor, createAnonymousActor } from './icpAgent';
import type { _SERVICE } from '../declarations/icp_chat_backend/icp_chat_backend.did.d.ts';
import { encryptionService } from './encryptionService';

export interface Message {
  id: number;
  author: string;
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

class ChatService {
  private actor: _SERVICE | null = null;

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
      // 将 Blob 转换为 Uint8Array（字节数组）
      const arrayBuffer = await imageBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const bytes = Array.from(uint8Array);
      console.log(`[ChatService] 图片转换为字节数组，长度: ${bytes.length}`);
      
      const result = await this.actor!.uploadImage(bytes);
      if ('ok' in result) {
        const imageId = Number(result.ok);
        console.log(`[ChatService] 图片上传成功，imageId: ${imageId}`);
        return {
          success: true,
          imageId: imageId,
        };
      } else {
        console.error(`[ChatService] 图片上传失败: ${result.err}`);
        return {
          success: false,
          error: result.err,
        };
      }
    } catch (error) {
      console.error('[ChatService] 图片上传异常:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '上传图片失败',
      };
    }
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
      const result = await this.actor!.sendMessage(encryptedText, imageIdOpt);
      if ('ok' in result) {
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
        return {
          success: true,
          message: {
            id: Number(msg.id),
            author: msg.author,
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

  async getLastMessages(n: number = 50): Promise<Message[]> {
    if (!this.actor) {
      await this.initialize();
    }

    try {
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
          
          return {
            id: Number(msg.id),
            author: msg.author,
            text: decryptedText,
            timestamp: msg.timestamp,
            imageId: imageIdValue,
          };
        })
      );
      return decryptedMessages;
    } catch (error) {
      console.error('获取消息失败:', error);
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
          
          return {
            id: Number(msg.id),
            author: msg.author,
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
          
          return {
            id: Number(msg.id),
            author: msg.author,
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

  async getMessageCount(): Promise<number> {
    if (!this.actor) {
      await this.initialize();
    }

    try {
      const count = await this.actor!.getMessageCount();
      return Number(count);
    } catch (error) {
      console.error('获取消息数量失败:', error);
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
}

export const chatService = new ChatService();

