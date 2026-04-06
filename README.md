# AI Studio OSS

基于 React + TypeScript + Vite 的 Gemini 图像对话应用，支持多轮对话、参考图输入、图像预览与下载。

## Requirements

- Node.js 20+
- pnpm 9+

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

## Environment Variables

- `PASSWORD`: 访问密码（由 `middleware.js` 校验，必填）
- `GEMINI_API_KEY`: Gemini API Key（必填，兼容 `VITE_GEMINI_API_KEY`）
- `GEMINI_API_BASE_URL`: 可选自定义网关地址（兼容 `VITE_GEMINI_BASE_URL`）

## Scripts

- `pnpm dev`: 启动开发环境
- `pnpm build`: 类型检查并构建生产包
- `pnpm preview`: 本地预览生产构建
- `pnpm lint`: 运行 ESLint

## Core Capabilities

- 图像对话：文本生成图像、对话上下文续写
- 多模态输入：文本 + 多张图片附件
- 预览体验：缩放、拖拽、触控手势、键盘切换
- 会话管理：本地持久化历史会话与设置
