import React, { useState } from 'react';
import { encryptionService } from '../services/encryptionService';
import { chatService } from '../services/chatService';
import './KeyManagement.css';

interface KeyManagementProps {
  onClose: () => void;
}

const KeyManagement: React.FC<KeyManagementProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'sync' | 'group'>('export');
  const [exportedKey, setExportedKey] = useState<string>('');
  const [importKeyValue, setImportKeyValue] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [groupId, setGroupId] = useState<string>('');
  const [groupKeyStatus, setGroupKeyStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // 导出密钥
  const handleExportKey = async () => {
    try {
      setLoading(true);
      const key = await encryptionService.exportKeyString();
      setExportedKey(key);
      setSyncStatus('密钥导出成功！请妥善保管，不要泄露给他人。');
    } catch (error) {
      setSyncStatus(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 复制密钥到剪贴板
  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(exportedKey);
      setSyncStatus('密钥已复制到剪贴板！');
    } catch (error) {
      setSyncStatus('复制失败，请手动复制');
    }
  };

  // 导入密钥
  const handleImportKey = async () => {
    if (!importKeyValue.trim()) {
      setSyncStatus('请输入密钥');
      return;
    }

    try {
      setLoading(true);
      await encryptionService.importKeyString(importKeyValue.trim());
      setSyncStatus('密钥导入成功！页面将刷新以应用新密钥。');
      setImportKeyValue('');
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      setSyncStatus(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 同步密钥到服务器
  const handleSyncToServer = async () => {
    try {
      setLoading(true);
      setSyncStatus('正在同步密钥到服务器...');
      const result = await chatService.syncEncryptionKey();
      if (result.success) {
        setSyncStatus('✅ 密钥已成功同步到服务器！');
      } else {
        // 显示友好的错误消息
        const errorMsg = result.error || '未知错误';
        setSyncStatus(`❌ ${errorMsg}`);
      }
    } catch (error) {
      // 捕获所有错误，包括 TypeError
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('is not a function')) {
        setSyncStatus('❌ 密钥同步功能需要重新部署后端。请运行: dfx deploy icp_chat_backend');
      } else {
        setSyncStatus(`❌ 同步异常: ${errorMsg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // 从服务器恢复密钥
  const handleRestoreFromServer = async () => {
    try {
      setLoading(true);
      setSyncStatus('正在从服务器恢复密钥...');
      const result = await chatService.restoreEncryptionKey();
      if (result.success) {
        setSyncStatus('✅ 密钥已成功从服务器恢复！页面将刷新以应用新密钥。');
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setSyncStatus(`❌ 恢复失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      setSyncStatus(`❌ 恢复异常: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 设置群组密钥
  const handleSetGroupKey = async () => {
    if (!groupId.trim()) {
      setGroupKeyStatus('请输入群组ID');
      return;
    }

    try {
      setLoading(true);
      // 生成新密钥或使用现有密钥
      const key = await encryptionService.exportKeyString();
      const result = await chatService.setGroupKey(groupId.trim(), key);
      if (result.success) {
        setGroupKeyStatus(`✅ 群组 ${groupId} 的密钥已设置！`);
        setGroupId('');
      } else {
        setGroupKeyStatus(`❌ 设置失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      setGroupKeyStatus(`❌ 设置异常: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 获取群组密钥
  const handleGetGroupKey = async () => {
    if (!groupId.trim()) {
      setGroupKeyStatus('请输入群组ID');
      return;
    }

    try {
      setLoading(true);
      const result = await chatService.getGroupKey(groupId.trim());
      if (result.success) {
        setGroupKeyStatus(`✅ 群组 ${groupId} 的密钥已获取并缓存！`);
        setGroupId('');
      } else {
        setGroupKeyStatus(`❌ 获取失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      setGroupKeyStatus(`❌ 获取异常: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="key-management-overlay" onClick={onClose}>
      <div className="key-management-modal" onClick={(e) => e.stopPropagation()}>
        <div className="key-management-header">
          <h2>🔐 密钥管理</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="key-management-tabs">
          <button
            className={activeTab === 'export' ? 'active' : ''}
            onClick={() => setActiveTab('export')}
          >
            导出密钥
          </button>
          <button
            className={activeTab === 'import' ? 'active' : ''}
            onClick={() => setActiveTab('import')}
          >
            导入密钥
          </button>
          <button
            className={activeTab === 'sync' ? 'active' : ''}
            onClick={() => setActiveTab('sync')}
          >
            密钥同步
          </button>
          <button
            className={activeTab === 'group' ? 'active' : ''}
            onClick={() => setActiveTab('group')}
          >
            群组密钥
          </button>
        </div>

        <div className="key-management-content">
          {activeTab === 'export' && (
            <div className="key-management-section">
              <h3>导出密钥</h3>
              <p className="description">
                导出您的加密密钥用于备份。请妥善保管，不要泄露给他人。
              </p>
              <button
                className="action-btn"
                onClick={handleExportKey}
                disabled={loading}
              >
                {loading ? '导出中...' : '导出密钥'}
              </button>
              {exportedKey && (
                <div className="exported-key">
                  <textarea
                    readOnly
                    value={exportedKey}
                    className="key-textarea"
                    rows={6}
                  />
                  <button className="copy-btn" onClick={handleCopyKey}>
                    复制密钥
                  </button>
                </div>
              )}
              {syncStatus && (
                <div className={`status-message ${syncStatus.includes('✅') ? 'success' : 'error'}`}>
                  {syncStatus}
                </div>
              )}
            </div>
          )}

          {activeTab === 'import' && (
            <div className="key-management-section">
              <h3>导入密钥</h3>
              <p className="description">
                从备份恢复您的加密密钥。导入后页面将自动刷新。
              </p>
              <textarea
                value={importKeyValue}
                onChange={(e) => setImportKeyValue(e.target.value)}
                placeholder="粘贴您的密钥..."
                className="key-textarea"
                rows={6}
              />
              <button
                className="action-btn"
                onClick={handleImportKey}
                disabled={loading || !importKeyValue.trim()}
              >
                {loading ? '导入中...' : '导入密钥'}
              </button>
              {syncStatus && (
                <div className={`status-message ${syncStatus.includes('✅') ? 'success' : 'error'}`}>
                  {syncStatus}
                </div>
              )}
            </div>
          )}

          {activeTab === 'sync' && (
            <div className="key-management-section">
              <h3>密钥同步</h3>
              <p className="description">
                将密钥同步到服务器，以便在其他设备上恢复。需要登录账户。
              </p>
              <div className="sync-actions">
                <button
                  className="action-btn"
                  onClick={handleSyncToServer}
                  disabled={loading}
                >
                  {loading ? '同步中...' : '同步到服务器'}
                </button>
                <button
                  className="action-btn secondary"
                  onClick={handleRestoreFromServer}
                  disabled={loading}
                >
                  {loading ? '恢复中...' : '从服务器恢复'}
                </button>
              </div>
              {syncStatus && (
                <div className={`status-message ${syncStatus.includes('✅') ? 'success' : 'error'}`}>
                  {syncStatus}
                </div>
              )}
            </div>
          )}

          {activeTab === 'group' && (
            <div className="key-management-section">
              <h3>群组密钥</h3>
              <p className="description">
                管理群组聊天密钥。群组密钥允许群组内所有成员互相解密消息。
              </p>
              <div className="group-key-input">
                <input
                  type="text"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  placeholder="输入群组ID"
                  className="group-id-input"
                />
                <div className="group-key-actions">
                  <button
                    className="action-btn"
                    onClick={handleSetGroupKey}
                    disabled={loading || !groupId.trim()}
                  >
                    {loading ? '设置中...' : '设置群组密钥'}
                  </button>
                  <button
                    className="action-btn secondary"
                    onClick={handleGetGroupKey}
                    disabled={loading || !groupId.trim()}
                  >
                    {loading ? '获取中...' : '获取群组密钥'}
                  </button>
                </div>
              </div>
              {groupKeyStatus && (
                <div className={`status-message ${groupKeyStatus.includes('✅') ? 'success' : 'error'}`}>
                  {groupKeyStatus}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KeyManagement;

