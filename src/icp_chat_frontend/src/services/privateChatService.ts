import { createActor } from './icpAgent';
import type { _SERVICE } from '../declarations/icp_chat_backend/icp_chat_backend.did.d.ts';
import { encryptionService } from './encryptionService';
import { getClientId } from './clientIdentity';

export interface PrivateMessage {
  id: number;
  author: string;
  senderId: string;
  senderPrincipal?: string | null;
  receiverPrincipal?: string | null;
  authorAvatar?: string | null;
  authorColor?: string | null;
  text: string;
  timestamp: bigint;
  imageId?: number | null;
  replyTo?: number | null;
}

export interface PrivateChatSession {
  sessionId: string;
  otherPrincipal: string;
  otherNickname?: string | null;
  otherAvatar?: string | null;
  lastMessage?: PrivateMessage | null;
  lastMessageTime: bigint;
  unreadCount: number;
}

export interface PrivateMessagePage {
  messages: PrivateMessage[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

class PrivateChatService {
  private actor: _SERVICE | null = null;

  async initialize(useAuth: boolean = true) {
    try {
      // 私聊功能需要登录，所以必须使用带身份的actor
      if (useAuth) {
        this.actor = await createActor();
      } else {
        throw new Error('私聊功能需要登录');
      }
    } catch (error) {
      console.error('[PrivateChatService] 初始化失败:', error);
      throw error;
    }
  }

  private async ensureActor() {
    if (!this.actor) {
      await this.initialize(true);
    }
  }

  /**
   * 发送私聊消息
   */
  async sendPrivateMessage(
    receiverPrincipal: string,
    text: string,
    imageId?: number | null,
    replyTo?: number | null
  ): Promise<{ success: boolean; message?: PrivateMessage; error?: string }> {
    await this.ensureActor();

    try {
      // 加密消息文本（如果有文本内容）
      let encryptedText = text;
      if (text && text.trim().length > 0) {
        try {
          encryptedText = await encryptionService.encrypt(text);
        } catch (error) {
          console.error('[PrivateChatService] 加密失败:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : '消息加密失败',
          };
        }
      }

      const imageIdOpt: [] | [bigint] = imageId !== undefined && imageId !== null ? [BigInt(imageId)] : [];
      const replyToOpt: [] | [bigint] = replyTo !== undefined && replyTo !== null ? [BigInt(replyTo)] : [];
      const senderId = getClientId();

      // 根据类型定义，后端接受的是 string 类型的 Principal
      const result = await this.actor!.sendPrivateMessage(
        receiverPrincipal,
        encryptedText,
        imageIdOpt,
        senderId,
        replyToOpt
      );

      if ('ok' in result) {
        const msg = result.ok;
        const imageIdValue = Array.isArray(msg.imageId) && msg.imageId.length > 0 ? Number(msg.imageId[0]) : null;
        const senderPrincipalValue = Array.isArray(msg.senderPrincipal) && msg.senderPrincipal.length > 0 ? String(msg.senderPrincipal[0]) : null;
        const receiverPrincipalValue = Array.isArray(msg.receiverPrincipal) && msg.receiverPrincipal.length > 0 ? String(msg.receiverPrincipal[0]) : null;
        const authorAvatarValue = Array.isArray(msg.authorAvatar) && msg.authorAvatar.length > 0 ? msg.authorAvatar[0] : null;
        const authorColorValue = Array.isArray(msg.authorColor) && msg.authorColor.length > 0 ? msg.authorColor[0] : null;
        const replyToValue = Array.isArray(msg.replyTo) && msg.replyTo.length > 0 ? Number(msg.replyTo[0]) : null;

        // 解密返回的消息文本
        let decryptedText = msg.text;
        try {
          decryptedText = await encryptionService.decrypt(msg.text);
        } catch (error) {
          console.warn('[PrivateChatService] 解密返回消息异常:', error);
          decryptedText = msg.text;
        }

        return {
          success: true,
          message: {
            id: Number(msg.id),
            author: msg.author,
            senderId: msg.senderId,
            senderPrincipal: senderPrincipalValue,
            receiverPrincipal: receiverPrincipalValue,
            authorAvatar: authorAvatarValue,
            authorColor: authorColorValue,
            text: decryptedText,
            timestamp: msg.timestamp,
            imageId: imageIdValue,
            replyTo: replyToValue,
          },
        };
      } else {
        console.error(`[PrivateChatService] 私聊消息发送失败: ${result.err}`);
        return {
          success: false,
          error: result.err,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '发送私聊消息失败',
      };
    }
  }

  /**
   * 获取私聊会话列表
   */
  async getPrivateChatSessions(): Promise<PrivateChatSession[]> {
    await this.ensureActor();

    try {
      const sessions = await this.actor!.getPrivateChatSessions();
      // 并行处理所有会话的最后消息
      const processedSessions = await Promise.all(
        sessions.map(async (session: any) => {
          let lastMessage: PrivateMessage | null = null;
          if (session.lastMessage && session.lastMessage.length > 0) {
            const msg = session.lastMessage[0];
            const imageIdValue = Array.isArray(msg.imageId) && msg.imageId.length > 0 ? Number(msg.imageId[0]) : null;
            const senderPrincipalValue = Array.isArray(msg.senderPrincipal) && msg.senderPrincipal.length > 0 ? String(msg.senderPrincipal[0]) : null;
            const receiverPrincipalValue = Array.isArray(msg.receiverPrincipal) && msg.receiverPrincipal.length > 0 ? String(msg.receiverPrincipal[0]) : null;
            const authorAvatarValue = Array.isArray(msg.authorAvatar) && msg.authorAvatar.length > 0 ? msg.authorAvatar[0] : null;
            const authorColorValue = Array.isArray(msg.authorColor) && msg.authorColor.length > 0 ? msg.authorColor[0] : null;
            const replyToValue = Array.isArray(msg.replyTo) && msg.replyTo.length > 0 ? Number(msg.replyTo[0]) : null;

            // 解密消息文本
            let decryptedText = msg.text;
            try {
              decryptedText = await encryptionService.decrypt(msg.text);
            } catch (error) {
              console.warn('[PrivateChatService] 解密会话最后消息异常:', error);
              decryptedText = msg.text;
            }

            lastMessage = {
              id: Number(msg.id),
              author: msg.author,
              senderId: msg.senderId,
              senderPrincipal: senderPrincipalValue,
              receiverPrincipal: receiverPrincipalValue,
              authorAvatar: authorAvatarValue,
              authorColor: authorColorValue,
              text: decryptedText,
              timestamp: msg.timestamp,
              imageId: imageIdValue,
              replyTo: replyToValue,
            };
          }

          return {
            sessionId: session.sessionId,
            otherPrincipal: String(session.otherPrincipal),
            otherNickname: session.otherNickname && session.otherNickname.length > 0 ? session.otherNickname[0] : null,
            otherAvatar: session.otherAvatar && session.otherAvatar.length > 0 ? session.otherAvatar[0] : null,
            lastMessage,
            lastMessageTime: session.lastMessageTime,
            unreadCount: Number(session.unreadCount),
          };
        })
      );

      return processedSessions;
    } catch (error) {
      console.error('[PrivateChatService] 获取会话列表失败:', error);
      return [];
    }
  }

  /**
   * 获取私聊会话的最近n条消息
   */
  async getLastPrivateMessages(
    otherPrincipal: string,
    n: number = 50
  ): Promise<PrivateMessage[]> {
    await this.ensureActor();

    try {
      const messages = await this.actor!.getLastPrivateMessages(
        otherPrincipal,
        BigInt(n)
      );

      // 并行解密所有消息
      const decryptedMessages = await Promise.all(
        messages.map(async (msg: any) => {
          const imageIdValue = Array.isArray(msg.imageId) && msg.imageId.length > 0 ? Number(msg.imageId[0]) : null;
          const senderPrincipalValue = Array.isArray(msg.senderPrincipal) && msg.senderPrincipal.length > 0 ? String(msg.senderPrincipal[0]) : null;
          const receiverPrincipalValue = Array.isArray(msg.receiverPrincipal) && msg.receiverPrincipal.length > 0 ? String(msg.receiverPrincipal[0]) : null;
          const authorAvatarValue = Array.isArray(msg.authorAvatar) && msg.authorAvatar.length > 0 ? msg.authorAvatar[0] : null;
          const authorColorValue = Array.isArray(msg.authorColor) && msg.authorColor.length > 0 ? msg.authorColor[0] : null;
          const replyToValue = Array.isArray(msg.replyTo) && msg.replyTo.length > 0 ? Number(msg.replyTo[0]) : null;

          // 尝试解密消息文本
          let decryptedText = msg.text;
          try {
            decryptedText = await encryptionService.decrypt(msg.text);
          } catch (error) {
            console.warn(`[PrivateChatService] 消息 ${Number(msg.id)} 解密异常:`, error);
            decryptedText = msg.text;
          }

          return {
            id: Number(msg.id),
            author: msg.author,
            senderId: msg.senderId,
            senderPrincipal: senderPrincipalValue,
            receiverPrincipal: receiverPrincipalValue,
            authorAvatar: authorAvatarValue,
            authorColor: authorColorValue,
            text: decryptedText,
            timestamp: msg.timestamp,
            imageId: imageIdValue,
            replyTo: replyToValue,
          };
        })
      );

      return decryptedMessages;
    } catch (error) {
      console.error('[PrivateChatService] 获取私聊消息失败:', error);
      return [];
    }
  }

  /**
   * 分页获取私聊消息
   */
  async getPrivateMessagesPage(
    otherPrincipal: string,
    page: number,
    pageSize: number
  ): Promise<PrivateMessagePage> {
    await this.ensureActor();

    try {
      const result = await this.actor!.getPrivateMessagesPage(
        otherPrincipal,
        BigInt(page),
        BigInt(pageSize)
      );

      // 并行解密所有消息
      const decryptedMessages = await Promise.all(
        result.messages.map(async (msg: any) => {
          const imageIdValue = Array.isArray(msg.imageId) && msg.imageId.length > 0 ? Number(msg.imageId[0]) : null;
          const senderPrincipalValue = Array.isArray(msg.senderPrincipal) && msg.senderPrincipal.length > 0 ? String(msg.senderPrincipal[0]) : null;
          const receiverPrincipalValue = Array.isArray(msg.receiverPrincipal) && msg.receiverPrincipal.length > 0 ? String(msg.receiverPrincipal[0]) : null;
          const authorAvatarValue = Array.isArray(msg.authorAvatar) && msg.authorAvatar.length > 0 ? msg.authorAvatar[0] : null;
          const authorColorValue = Array.isArray(msg.authorColor) && msg.authorColor.length > 0 ? msg.authorColor[0] : null;
          const replyToValue = Array.isArray(msg.replyTo) && msg.replyTo.length > 0 ? Number(msg.replyTo[0]) : null;

          // 尝试解密消息文本
          let decryptedText = msg.text;
          try {
            decryptedText = await encryptionService.decrypt(msg.text);
          } catch (error) {
            console.warn(`[PrivateChatService] 消息 ${Number(msg.id)} 解密异常:`, error);
            decryptedText = msg.text;
          }

          return {
            id: Number(msg.id),
            author: msg.author,
            senderId: msg.senderId,
            senderPrincipal: senderPrincipalValue,
            receiverPrincipal: receiverPrincipalValue,
            authorAvatar: authorAvatarValue,
            authorColor: authorColorValue,
            text: decryptedText,
            timestamp: msg.timestamp,
            imageId: imageIdValue,
            replyTo: replyToValue,
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
      console.error('[PrivateChatService] 分页获取私聊消息失败:', error);
      return {
        messages: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }
  }

  /**
   * 根据ID获取私聊消息
   */
  async getPrivateMessageById(id: number): Promise<PrivateMessage | null> {
    await this.ensureActor();

    try {
      const result = await this.actor!.getPrivateMessageById(BigInt(id));
      if (!result) {
        return null;
      }

      const msg = result;
      const imageIdValue = Array.isArray(msg.imageId) && msg.imageId.length > 0 ? Number(msg.imageId[0]) : null;
      const senderPrincipalValue = Array.isArray(msg.senderPrincipal) && msg.senderPrincipal.length > 0 ? String(msg.senderPrincipal[0]) : null;
      const receiverPrincipalValue = Array.isArray(msg.receiverPrincipal) && msg.receiverPrincipal.length > 0 ? String(msg.receiverPrincipal[0]) : null;
      const authorAvatarValue = Array.isArray(msg.authorAvatar) && msg.authorAvatar.length > 0 ? msg.authorAvatar[0] : null;
      const authorColorValue = Array.isArray(msg.authorColor) && msg.authorColor.length > 0 ? msg.authorColor[0] : null;
      const replyToValue = Array.isArray(msg.replyTo) && msg.replyTo.length > 0 ? Number(msg.replyTo[0]) : null;

      // 解密消息文本
      let decryptedText = msg.text;
      try {
        decryptedText = await encryptionService.decrypt(msg.text);
      } catch (error) {
        console.warn(`[PrivateChatService] 消息 ${id} 解密异常:`, error);
        decryptedText = msg.text;
      }

      return {
        id: Number(msg.id),
        author: msg.author,
        senderId: msg.senderId,
        senderPrincipal: senderPrincipalValue,
        receiverPrincipal: receiverPrincipalValue,
        authorAvatar: authorAvatarValue,
        authorColor: authorColorValue,
        text: decryptedText,
        timestamp: msg.timestamp,
        imageId: imageIdValue,
        replyTo: replyToValue,
      };
    } catch (error) {
      console.error(`[PrivateChatService] 获取私聊消息 ${id} 失败:`, error);
      return null;
    }
  }
}

export const privateChatService = new PrivateChatService();

