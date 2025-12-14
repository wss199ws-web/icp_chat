import React, { useEffect, useState } from 'react';
import './KeyManagement.css';
import { userProfileService, type UserProfile as Profile } from '../services/userProfileService';
import { compressImageToDataURL } from '../utils/imageCompression';
import { authService } from '../services/authService';

const UserProfile: React.FC = () => {
  const [profile, setProfile] = useState<Profile>({
    nickname: '',
    avatar: '',
    color: '',
    bio: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userPrincipal, setUserPrincipal] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // 检查登录状态
        const authed = await authService.isAuthenticated();
        if (!mounted) return;
        setIsAuthenticated(authed);
        
        // 获取用户 Principal (UID)
        if (authed) {
          const principal = await authService.getPrincipalText();
          if (!mounted) return;
          setUserPrincipal(principal);
        }
        
        // 加载用户资料
        const data = await userProfileService.getProfile();
        if (!mounted) return;
        if (data) {
          setProfile({
            nickname: data.nickname ?? '',
            avatar: data.avatar ?? '',
            color: data.color ?? '',
            bio: data.bio ?? '',
          });
        }
      } catch (e) {
        console.error('[UserProfile] 加载用户资料失败:', e);
        if (mounted) {
          setError(e instanceof Error ? e.message : '加载用户资料失败');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 头像本地上传处理：读取为 data URL，用于圆形预览 & 持久化存储
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件作为头像');
      return;
    }

    try {
      // 如果图片超过2MB，先压缩
      if (file.size > 2 * 1024 * 1024) {
        const compressedBlob = await compressImageToDataURL(file);
        setProfile((prev) => ({
          ...prev,
          avatar: compressedBlob,
        }));
        setError(null);
      } else {
        // 小于2MB，直接读取
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === 'string') {
            setProfile((prev) => ({
              ...prev,
              avatar: result,
            }));
            setError(null);
          }
        };
        reader.onerror = () => {
          setError('读取头像文件失败，请重试');
        };
        reader.readAsDataURL(file);
      }
    } catch (error) {
      console.error('[UserProfile] 头像处理失败:', error);
      setError('头像处理失败，请重试');
    }
  };

  const handleChange =
    (field: keyof Profile) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setProfile((prev) => ({
        ...prev,
        [field]: e.target.value,
      }));
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 检查登录状态
    if (!isAuthenticated) {
      setError('请先登录以保存个人资料');
      return;
    }
    
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { success, error } = await userProfileService.saveProfile(profile);
      if (!success) {
        setError(error || '保存失败');
      } else {
        setSuccess('保存成功');
        // 通知其他组件（如 Chat）Profile 已更新
        if (typeof window !== 'undefined') {
          const BC: typeof BroadcastChannel | undefined = (window as any).BroadcastChannel;
          if (BC) {
            const channel = new BC('icp-chat-message-sync');
            channel.postMessage({ type: 'PROFILE_UPDATED' });
            channel.close();
          }
        }
      }
    } catch (err) {
      console.error('[UserProfile] 保存用户资料异常:', err);
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="key-management-container" style={{ textAlign: 'center' }}>
        <h2 className="key-management-title">个人信息配置</h2>
        <p>加载中...</p>
      </div>
    );
  }

  // 未登录时显示提示
  if (!isAuthenticated) {
    return (
      <div className="key-management-page">
        <div className="key-management-card">
          <div className="key-management-card-header">
            <div>
              <h2 className="key-management-title">个人信息配置</h2>
              <p className="key-management-desc">
                设置你的昵称、头像与主题色，发送消息时会以这里的配置作为「直播间角色」展示。
              </p>
            </div>
          </div>
          <div className="key-management-empty">
            <p>请先登录以修改个人资料</p>
            <button
              className="key-management-button primary"
              onClick={() => authService.login()}
            >
              登录
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="key-management-page">
      <div className="key-management-card">
        <div className="key-management-card-header">
          <div>
            <h2 className="key-management-title">个人信息配置</h2>
            <p className="key-management-desc">
              设置你的昵称、头像与主题色，发送消息时会以这里的配置作为「直播间角色」展示。
            </p>
          </div>
          <div className="profile-preview">
            <div className="profile-avatar-preview">
              {profile.avatar ? (
                <img src={profile.avatar} alt="头像预览" onError={(e) => (e.currentTarget.style.display = 'none')} />
              ) : (
                <span>{profile.nickname ? profile.nickname.charAt(0) : '你'}</span>
              )}
            </div>
            <div className="profile-preview-text">
              <div className="profile-preview-name" style={{ color: profile.color || '#333' }}>
                {profile.nickname || '未设置昵称'}
              </div>
              <div className="profile-preview-bio">
                {profile.bio || '这段签名会出现在你的个人信息中'}
              </div>
            </div>
          </div>
        </div>

        {error && <div className="key-management-error">{error}</div>}
        {success && <div className="key-management-success">{success}</div>}

        <form className="key-management-form" onSubmit={handleSubmit}>
          <div className="key-management-form-grid">
            <label className="key-management-label">
              <span className="field-label">
                昵称 <span className="field-required">*</span>
              </span>
              <input
                className="key-management-input"
                type="text"
                value={profile.nickname}
                onChange={handleChange('nickname')}
                maxLength={50}
                placeholder="例如：小电视、xx的直播间"
                required
              />
            </label>

            <label className="key-management-label">
              <span className="field-label">头像</span>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  className="key-management-input"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  style={{ flex: 1 }}
                />
                {profile.avatar && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfile((prev) => ({
                        ...prev,
                        avatar: '',
                      }));
                      setError(null);
                    }}
                    className="key-management-button"
                    style={{
                      padding: '8px 16px',
                      fontSize: '14px',
                      whiteSpace: 'nowrap',
                    }}
                    title="删除当前头像"
                  >
                    删除头像
                  </button>
                )}
              </div>
              <span className="field-desc">
                本地上传头像图，支持常见图片格式，预览区域会按圆形裁剪展示。
              </span>
            </label>

          <label className="key-management-label">
            <span className="field-label">昵称颜色</span>
            <input
              className="key-management-input"
              type="text"
              value={profile.color ?? ''}
              onChange={handleChange('color')}
              placeholder="#ff6699 或 css 颜色值"
              maxLength={50}
            />
            <span className="field-desc">用于列表中昵称展示，例如：#ff6699、rgb(255, 100, 150)。</span>
          </label>

          <label className="key-management-label">
            <span className="field-label">用户UID</span>
            <div style={{ 
              padding: '12px', 
              background: '#f5f5f5', 
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '13px',
              wordBreak: 'break-all',
              color: '#666'
            }}>
              {userPrincipal || (isAuthenticated ? '加载中...' : '请先登录')}
            </div>
            <span className="field-desc">这是你的唯一标识符（Principal），其他人可以通过此UID查找并联系你。</span>
          </label>
        </div>

          <label className="key-management-label">
            <span className="field-label">个性签名</span>
            <textarea
              className="key-management-textarea"
              value={profile.bio ?? ''}
              onChange={handleChange('bio')}
              maxLength={200}
              rows={3}
              placeholder="简单介绍一下自己，最多 200 字。"
            />
          </label>

          <div className="key-management-actions">
            <button className="key-management-button primary" type="submit" disabled={saving}>
              {saving ? '保存中...' : '保存配置'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserProfile;


