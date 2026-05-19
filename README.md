# 美约管家

美约管家是一个中文移动端优先的美甲美容院预约记账 App。它使用 React + Vite + TypeScript 开发，通过 Capacitor 提供 Android / iOS 原生工程，本地数据保存在 IndexedDB。

## 当前功能

- 多员工预约排班，默认初始化员工为：小美、傻大春、小甜。
- 时间格支持 10 / 15 / 30 分钟，预约时长按分钟保存。
- 手机端排班支持横向滚动、双指缩放、过去时间灰色、当前时间行高亮。
- 预约详情支持客户姓名、电话、服务内容、价格、员工、日期、开始时间、时长和备注。
- 未保存的新预约会按日期、员工和开始时间缓存草稿。
- 设置页可维护服务项目、货币、收入显示模式和营业时间。
- 账本按当天汇总预约数量、收入和员工小计。

## 常用命令

```bash
npm install
npm run dev
npm run build
npm run cap:sync
npm run android:build:debug
```

Windows 本机 npm 路径可用：

```powershell
& 'C:\Users\chena\.trae\binaries\node\versions\24.13.1\npm.cmd' run build
```

Android debug APK 输出：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

iOS 打包需要 macOS + Xcode + CocoaPods，Windows 只负责同步 iOS 工程，不能直接生成 `.ipa`。

## 项目文档

- `AGENTS.md`：后续 Codex / 开发者必须先读的维护规则。
- `CONTENT_UPDATES.md`：已经完成的内容更新记录。
- `ROADMAP.md`：后续开发规划和验收方向。
- `MOBILE_BUILD.md`：Android / iOS 原生打包说明。
