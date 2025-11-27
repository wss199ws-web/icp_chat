import { createActor, createAnonymousActor } from './icpAgent';
import type { _SERVICE } from '../declarations/icp_chat_backend/icp_chat_backend.did.d.ts';

export interface Message {
  id: number;
  author: string;
  text: string;
  timestamp: bigint;
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

  async sendMessage(text: string): Promise<{ success: boolean; message?: Message; error?: string }> {
    if (!this.actor) {
      await this.initialize();
    }

    try {
      const result = await this.actor!.sendMessage(text);
      if ('ok' in result) {
        const msg = result.ok;
        return {
          success: true,
          message: {
            id: Number(msg.id),
            author: msg.author,
            text: msg.text,
            timestamp: msg.timestamp,
          },
        };
      } else {
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
      return messages.map((msg: { id: bigint; author: string; text: string; timestamp: bigint }) => ({
        id: Number(msg.id),
        author: msg.author,
        text: msg.text,
        timestamp: msg.timestamp,
      }));
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
      return messages.map((msg: { id: bigint; author: string; text: string; timestamp: bigint }) => ({
        id: Number(msg.id),
        author: msg.author,
        text: msg.text,
        timestamp: msg.timestamp,
      }));
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
      return {
        messages: result.messages.map((msg: { id: bigint; author: string; text: string; timestamp: bigint }) => ({
          id: Number(msg.id),
          author: msg.author,
          text: msg.text,
          timestamp: msg.timestamp,
        })),
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

