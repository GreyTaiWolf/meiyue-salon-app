# 美约管家项目维护规则

本文件给后续 Codex / 开发者使用。修改本项目之前请先阅读，并保持下面规则不被无意破坏。

## 项目定位

- 这是一个中文界面的美甲美容院预约记账 App。
- 技术栈是 React + Vite + TypeScript，使用 Capacitor 打包 Android / iOS。
- 首屏必须保持为可操作的排班工具，不要改成营销页、介绍页或落地页。
- UI 继续以手机优先为主，同时兼容手机浏览器、Android APK 和后续 iOS 壳。

## 数据与业务规则

- 预约、员工、设置数据继续保存在本机 IndexedDB。
- 不要默认引入登录、云同步、后端 API 或会清空旧数据的存储迁移。
- 如果必须调整 IndexedDB schema，必须保证已有预约、员工、设置可迁移保留。
- 排班时间格由设置页控制，当前支持 10 / 15 / 30 分钟。
- 预约时长使用分钟保存，不要再用当前时间格数量解释历史预约时长。
- 同一员工、同一日期、同一时间段发生冲突时，继续弹出提醒，但允许用户确认后保存。
- 不同员工同一时间可以同时预约，不应触发冲突提醒。
- 服务项目可在设置页维护名称、价格和所需时长；预约选择已有服务时应自动带入价格和时长。
- 收入货币是全店统一显示设置，支持人民币、欧元、美元、英镑；切换货币只改变显示格式，不做汇率换算，也不为单个预约保存不同币种。
- 包名保持 `com.meiyue.salon`，应用名保持 `美约管家`，除非用户明确要求修改。

## 移动端 UI 规则

- 员工变多时，员工栏和下面时间表必须保持横向同步滚动。
- 时间轴列宽要稳定，员工列要和对应预约格对齐。
- 排班区域在手机上支持双指缩放；缩小后预约块只显示更少的关键信息。
- 日期选择控件使用应用内统一样式日历，不能退回不可控的原生裸输入样式。
- 窄屏下文字不能溢出按钮、卡片或时间格。
- 不要用解释性大段文字占据主界面；主要操作应直接可用。

## 构建与同步

- 修改前端代码后必须运行：

```bash
npm run build
npm run cap:sync
```

- 如果 Windows 终端找不到 `npm`，本机可用：

```powershell
& 'C:\Users\chena\.trae\binaries\node\versions\24.13.1\npm.cmd' run build
& 'C:\Users\chena\.trae\binaries\node\versions\24.13.1\npm.cmd' run cap:sync
```

- Android debug 包命令：

```bash
npm run android:build:debug
```

- Android debug APK 默认输出：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

- 当前 Windows Android 构建依赖 JDK 21、Android SDK 35。
- 因为项目路径包含中文，`android/gradle.properties` 里需要保留：

```properties
android.overridePathCheck=true
```

- iOS 打包需要 macOS + Xcode + CocoaPods；Windows 不直接生成 `.ipa`。

## 验证要求

- 文档类修改只需检查内容可读、路径正确。
- 前端功能修改至少运行 `npm run build`。
- 涉及 Capacitor / 原生资源 / Android 的修改，运行 `npm run cap:sync` 后再打包验证。
- 预约相关修改要手动覆盖这些场景：新增预约、刷新后数据保留、编辑价格后收入更新、同员工冲突提醒、不同员工同时间不冲突、切换日期只显示当天预约、切换 10 / 15 / 30 分钟间隔后历史预约时长不变、切换收入货币后账本和预约金额只改变显示符号。
