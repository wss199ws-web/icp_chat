import React, { useState, useEffect } from 'react';
import { config } from '../config';
import './NetworkConfig.css';

interface NetworkConfigProps {
  onClose?: () => void;
}

const NetworkConfig: React.FC<NetworkConfigProps> = ({ onClose }) => {
  const [currentHost, setCurrentHost] = useState<string>(config.host);
  const [selectedHost, setSelectedHost] = useState<string>(config.host);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [network, setNetwork] = useState<string>(config.network);

  useEffect(() => {
    setCurrentHost(config.host);
    setSelectedHost(config.host);
    setNetwork(config.network);
  }, []);

  const availableHosts = network === 'ic' ? config.availableHosts : [config.host];

  const testConnection = async (host: string) => {
    setIsTesting(true);
    setTestResult(null);

    try {
      // 简单的连接测试
      const response = await fetch(`${host}/api/v2/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5秒超时
      });
      
      if (response.ok) {
        setTestResult({ success: true, message: '连接成功' });
      } else {
        setTestResult({ success: false, message: `连接失败: HTTP ${response.status}` });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setTestResult({ 
        success: false, 
        message: `连接失败: ${errorMessage.includes('timeout') ? '连接超时' : errorMessage}` 
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    if (selectedHost !== currentHost) {
      if (network === 'ic') {
        config.setCustomHost(selectedHost);
      }
      setCurrentHost(selectedHost);
      setTestResult(null);
      
      // 提示用户刷新页面
      if (window.confirm('API 端点已更改，需要刷新页面才能生效。是否立即刷新？')) {
        window.location.reload();
      }
    } else if (onClose) {
      onClose();
    }
  };

  const handleReset = () => {
    if (network === 'ic') {
      config.clearCustomHost();
      const defaultHost = config.availableHosts[0];
      setSelectedHost(defaultHost);
      setCurrentHost(defaultHost);
    }
    setTestResult(null);
  };

  if (network === 'local') {
    return (
      <div className="network-config">
        <div className="network-config-content">
          <h3>网络配置</h3>
          <p>当前为本地网络模式，无需配置 API 端点。</p>
          <p>当前端点: <code>{currentHost}</code></p>
          {onClose && (
            <button onClick={onClose} className="network-config-button">
              关闭
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="network-config">
      <div className="network-config-content">
        <h3>ICP 网络配置</h3>
        <p className="network-config-description">
          如果无法访问 ICP 主网，可以尝试切换不同的 API 端点。
          <br />
          <small>提示：在中国大陆可能需要使用 VPN 才能访问 ICP 主网。</small>
        </p>

        <div className="network-config-section">
          <label>当前使用的端点:</label>
          <code className="network-config-current">{currentHost}</code>
        </div>

        <div className="network-config-section">
          <label>选择 API 端点:</label>
          <div className="network-config-hosts">
            {availableHosts.map((host) => (
              <label key={host} className="network-config-host-option">
                <input
                  type="radio"
                  name="host"
                  value={host}
                  checked={selectedHost === host}
                  onChange={(e) => setSelectedHost(e.target.value)}
                />
                <span>{host}</span>
                {host === currentHost && <span className="network-config-badge">当前</span>}
              </label>
            ))}
          </div>
        </div>

        {testResult && (
          <div className={`network-config-test-result ${testResult.success ? 'success' : 'error'}`}>
            {testResult.success ? '✓' : '✗'} {testResult.message}
          </div>
        )}

        <div className="network-config-actions">
          <button
            onClick={() => testConnection(selectedHost)}
            disabled={isTesting}
            className="network-config-button network-config-button-secondary"
          >
            {isTesting ? '测试中...' : '测试连接'}
          </button>
          <button
            onClick={handleReset}
            className="network-config-button network-config-button-secondary"
          >
            重置为默认
          </button>
          <button
            onClick={handleSave}
            className="network-config-button network-config-button-primary"
          >
            保存并刷新
          </button>
          {onClose && (
            <button onClick={onClose} className="network-config-button">
              取消
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NetworkConfig;

