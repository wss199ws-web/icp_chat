# ICP Chat 部署指南

## 快速开始

### 1. 安装依赖

```bash
# 安装前端依赖
cd src/icp_chat_frontend
npm install
cd ../..
```

### 2. 启动本地 ICP 网络

```bash
dfx start --background
```

### 3. 部署后端并生成类型声明

```bash
dfx deploy
```

这会自动：
- 部署后端 canister
- 生成前端需要的类型声明文件
- 创建 `.env` 文件（包含 canister ID）

### 4. 构建前端

```bash
cd src/icp_chat_frontend
npm run build
cd ../..
```

### 5. 部署前端

```bash
dfx deploy
```

### 6. 访问应用

本地开发：
- 前端开发服务器：`http://localhost:8080`（运行 `npm run dev`）
- 部署后的应用：`http://localhost:4943?canisterId={frontend_canister_id}`

## 开发模式

### 启动开发服务器

```bash
# 终端 1: 启动 ICP 本地网络
dfx start --background

# 终端 2: 部署后端（首次或修改后端后）
dfx deploy

# 终端 3: 启动前端开发服务器
cd src/icp_chat_frontend
npm run dev
```

前端开发服务器会在 `http://localhost:8080` 启动，支持热重载。

## 生产部署

### 部署到 ICP 主网

1. **确保已登录 ICP 钱包**

```bash
dfx identity whoami
```

2. **部署到主网**

```bash
dfx deploy --network ic
```

3. **更新前端环境变量**

部署后，`.env` 文件会包含主网的 canister ID。前端会自动使用这些 ID。

4. **构建并部署前端**

```bash
cd src/icp_chat_frontend
npm run build
cd ../..
dfx deploy --network ic
```

## 环境变量说明

`.env` 文件（由 `dfx deploy` 自动生成）包含：

- `DFX_NETWORK` - 网络类型（`local` 或 `ic`）
- `CANISTER_ID_ICP_CHAT_BACKEND` - 后端 canister ID
- `CANISTER_ID_ICP_CHAT_FRONTEND` - 前端 canister ID

前端代码会自动读取这些变量。

## 常见问题

### 1. 类型声明文件缺失

如果看到类型错误，运行：

```bash
dfx generate
```

### 2. Canister ID 未找到

确保已运行 `dfx deploy`，这会生成 `.env` 文件。

### 3. 本地网络连接失败

确保本地 ICP 网络正在运行：

```bash
dfx start --background
```

### 4. 前端构建失败

确保已安装所有依赖：

```bash
cd src/icp_chat_frontend
npm install
```

## 项目结构

```
icp_chat/
├── dfx.json                    # DFX 配置文件
├── canister_ids.json          # Canister ID 配置
├── src/
│   ├── icp_chat_backend/      # 后端 Motoko 代码
│   │   └── main.mo
│   └── icp_chat_frontend/     # 前端 React 代码
│       ├── src/
│       │   ├── components/    # React 组件
│       │   ├── services/       # API 服务
│       │   └── App.tsx        # 主应用
│       ├── package.json
│       └── vite.config.ts
└── .env                        # 环境变量（自动生成）
```

