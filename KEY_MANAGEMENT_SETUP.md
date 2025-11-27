# 密钥管理功能设置指南

## 问题：`saveEncryptionKey is not a function`

如果遇到此错误，说明后端代码还没有部署。需要重新部署后端以启用密钥管理功能。

## 解决步骤

### 1. 重新部署后端

**本地开发环境：**
```bash
# 确保本地网络运行
dfx start --background

# 部署后端（这会自动生成新的类型定义）
dfx deploy icp_chat_backend
```

**生产环境（IC 主网）：**
```bash
# 部署后端到主网
dfx deploy --network ic icp_chat_backend
```

### 2. 重新生成类型定义（如果需要）

部署后会自动生成类型定义，但如果需要手动生成：

```bash
dfx generate icp_chat_backend
```

### 3. 重新构建前端

**本地开发：**
```bash
cd src/icp_chat_frontend
npm run dev
```

**生产环境：**
```bash
cd src/icp_chat_frontend
npm run build
cd ../..
dfx deploy --network ic icp_chat_frontend
```

## 验证部署

部署完成后，检查浏览器控制台：

1. 打开浏览器开发者工具（F12）
2. 查看控制台是否有错误
3. 点击"密钥管理"按钮
4. 尝试"同步到服务器"功能

如果仍然报错，检查：

1. **后端是否成功部署**：
   ```bash
   dfx canister status icp_chat_backend
   ```

2. **类型定义文件是否更新**：
   检查 `src/icp_chat_frontend/src/declarations/icp_chat_backend/icp_chat_backend.did.d.ts`
   应该包含 `saveEncryptionKey`、`getEncryptionKey` 等方法

3. **浏览器缓存**：
   清除浏览器缓存或使用硬刷新（Ctrl+Shift+R 或 Cmd+Shift+R）

## 功能说明

部署成功后，密钥管理功能包括：

### ✅ 密钥导出/导入
- **导出密钥**：将密钥导出为 Base64 字符串，可保存到安全位置
- **导入密钥**：从备份恢复密钥

### ✅ 密钥同步
- **同步到服务器**：将密钥保存到 ICP 后端（需要登录账户）
- **从服务器恢复**：在其他设备上恢复密钥

### ✅ 群组密钥
- **设置群组密钥**：为群组创建共享密钥
- **获取群组密钥**：从服务器获取群组密钥

## 注意事项

1. **密钥同步需要登录**：匿名用户无法使用密钥同步功能
2. **密钥安全**：导出的密钥请妥善保管，不要泄露
3. **跨设备同步**：密钥同步后，可以在其他设备上恢复并解密消息

## 故障排查

### 错误：`this.actor.saveEncryptionKey is not a function`

**原因**：后端代码未部署或类型定义未更新

**解决**：
```bash
# 重新部署后端
dfx deploy icp_chat_backend

# 重新生成类型定义
dfx generate icp_chat_backend

# 重新构建前端
cd src/icp_chat_frontend
npm run build
```

### 错误：`匿名用户无法保存密钥`

**原因**：密钥同步功能需要登录账户

**解决**：使用 ICP 身份认证登录后再使用密钥同步功能

### 错误：`Web Crypto API 不可用`

**原因**：非 HTTPS 环境或浏览器不支持

**解决**：
- 使用 HTTPS 访问
- 或通过 localhost 访问
- 检查浏览器是否支持 Web Crypto API

