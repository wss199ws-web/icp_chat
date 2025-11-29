import type {
  _SERVICE,
  UserProfile as BackendUserProfile,
} from '../declarations/icp_chat_backend/icp_chat_backend.did.d.ts';
import { createActor } from './icpAgent';

/**
 * 前端使用的用户资料类型
 */
export interface UserProfile {
  nickname: string;
  avatar?: string | null;
  color?: string | null;
  bio?: string | null;
}

class UserProfileService {
  private actor: _SERVICE | null = null;

  private async ensureActor() {
    if (!this.actor) {
      // 使用带身份的 actor，因为需要基于 Principal 存储
      this.actor = await createActor();
    }
  }

  private toOptText(value: string | null | undefined): [] | [string] {
    if (value == null || value === '') {
      return [];
    }
    return [value];
  }

  private toBackendProfile(profile: UserProfile): BackendUserProfile {
    return {
      nickname: profile.nickname,
      avatar: this.toOptText(profile.avatar ?? null),
      color: this.toOptText(profile.color ?? null),
      bio: this.toOptText(profile.bio ?? null),
    };
  }

  private fromBackendProfile(profile: BackendUserProfile): UserProfile {
    return {
      nickname: profile.nickname,
      avatar: profile.avatar.length > 0 ? profile.avatar[0] : null,
      color: profile.color.length > 0 ? profile.color[0] : null,
      bio: profile.bio.length > 0 ? profile.bio[0] : null,
    };
  }

  /**
   * 获取当前用户的个人资料
   */
  async getProfile(): Promise<UserProfile | null> {
    await this.ensureActor();

    try {
      if (typeof this.actor!.getUserProfile !== 'function') {
        console.warn('[UserProfileService] 后端未部署用户资料接口，请重新部署 canister');
        return null;
      }

      const result = await this.actor!.getUserProfile();
      if (!result || result.length === 0) {
        return null;
      }

      const backendProfile = result[0];
      return this.fromBackendProfile(backendProfile);
    } catch (error) {
      console.error('[UserProfileService] 获取用户资料失败:', error);
      return null;
    }
  }

  /**
   * 保存当前用户的个人资料
   */
  async saveProfile(profile: UserProfile): Promise<{ success: boolean; error?: string }> {
    await this.ensureActor();

    try {
      if (typeof this.actor!.saveUserProfile !== 'function') {
        return {
          success: false,
          error: '后端未部署用户资料接口，请运行 dfx deploy icp_chat_backend',
        };
      }

      const backendProfile = this.toBackendProfile(profile);
      const result = await this.actor!.saveUserProfile(backendProfile);
      if ('ok' in result) {
        return { success: true };
      }
      return { success: false, error: result.err };
    } catch (error) {
      console.error('[UserProfileService] 保存用户资料失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '保存用户资料失败',
      };
    }
  }
}

export const userProfileService = new UserProfileService();

