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
- `VITE_GEMINI_PROXY_PATH`: UI 中转模式请求路径，默认 `/api/gemini`

## API Access Modes

设置面板可以切换两种访问方式：

- 直连：浏览器端沿用当前 `GEMINI_API_BASE_URL` / `VITE_GEMINI_BASE_URL` 直接访问 Gemini 端点。
- 中转：浏览器请求同源 `/api/gemini`，由 Vercel Function 在服务器侧读取 `GEMINI_API_KEY` 和 `GEMINI_API_BASE_URL` 后转发。

Vercel 部署会自动识别仓库根目录的 `api/gemini.ts`。`vercel.json` 将该函数最大执行时间设置为 300 秒，匹配当前 Hobby 计划的 Node.js Function 上限。Vercel Function 对请求体或响应体有 4.5 MB 限制，参考图或高分辨率图片响应过大时中转模式可能返回 413；这种场景需要改用直连或降低图片尺寸。

本地 `pnpm dev` 只启动 Vite 前端；需要在本地验证中转函数时使用 Vercel 本地运行环境，例如 `pnpm dlx vercel dev`。

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
