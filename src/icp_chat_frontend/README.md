# ICP Chat Frontend

基于 React + TypeScript + Vite 构建的 ICP 聊天应用前端。

## 技术栈

- **React 18** - 最新版本的 React
- **TypeScript** - 类型安全
- **Vite** - 快速构建工具
- **@dfinity/agent** - ICP 网络交互

## 开发

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

开发服务器会在 `http://localhost:8080` 启动。

### 构建生产版本

```bash
npm run build
```

构建产物会输出到 `dist` 目录。

## 部署

### 1. 生成后端类型声明

在项目根目录运行：

```bash
dfx generate
```

这会自动生成 `src/declarations/` 目录下的类型定义文件。

### 2. 构建前端

```bash
cd src/icp_chat_frontend
npm install
npm run build
```

### 3. 部署到 ICP

回到项目根目录：

```bash
dfx deploy
```

## 环境变量

前端会自动从 `.env` 文件中读取以下变量（由 `dfx deploy` 自动生成）：

- `DFX_NETWORK` - 网络类型（`ic` 或 `local`）
- `CANISTER_ID_ICP_CHAT_BACKEND` - 后端 Canister ID

## 功能特性

- ✅ 实时消息展示
- ✅ 消息发送（支持匿名和认证用户）
- ✅ 自动刷新（每5秒）
- ✅ 消息计数
- ✅ 清空消息功能
- ✅ 响应式设计
- ✅ 错误处理
- ✅ 字符计数限制（1000字符）

## 注意事项

1. 首次运行前需要先部署后端并生成类型声明
2. 本地开发时需要启动 ICP 本地网络：`dfx start --background`
3. 生产环境部署需要配置正确的 Canister ID

