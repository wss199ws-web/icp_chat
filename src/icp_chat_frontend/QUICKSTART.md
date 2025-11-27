# 快速开始指南

## 解决"初始化失败"错误

如果看到"初始化失败，请检查网络连接"的错误，请按以下步骤操作：

### 1. 检查 ICP 本地网络是否运行

```bash
# 启动本地 ICP 网络（如果未启动）
dfx start --background
```

### 2. 部署后端到本地网络

```bash
# 在项目根目录运行
dfx deploy
```

这会：
- 部署后端 canister 到本地网络
- 生成 `.env` 文件（包含 canister ID）
- 生成类型声明文件

### 3. 重启前端开发服务器

```bash
cd src/icp_chat_frontend
npm run dev
```

## 使用主网（已部署）

如果你的 canister 已经部署到主网，需要确保：

1. `.env` 文件中的 `DFX_NETWORK='ic'`
2. Canister ID 正确配置

## 调试步骤

1. **检查浏览器控制台**：查看是否有详细的错误信息
2. **检查 Canister ID**：在控制台输入 `window.__ICP_ENV__` 查看配置
3. **检查网络连接**：确保可以访问 `http://localhost:4943`（本地）或 `https://icp-api.io`（主网）

## 常见问题

### Canister ID 未找到

**错误**：`Canister ID 未配置`

**解决**：
```bash
dfx deploy
```

### 无法连接到本地网络

**错误**：`无法连接到 ICP 网络`

**解决**：
```bash
dfx start --background
dfx deploy
```

### 类型声明文件缺失

**错误**：TypeScript 类型错误

**解决**：
```bash
dfx generate
```

