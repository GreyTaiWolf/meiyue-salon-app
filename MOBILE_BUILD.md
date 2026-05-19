# 美约管家原生打包说明

这个项目已经接入 Capacitor，并生成了 Android 与 iOS 原生工程。

## 已生成内容

- Android 工程：`android/`
- iOS 工程：`ios/`
- 应用名：`美约管家`
- 包名 / Bundle ID：`com.meiyue.salon`
- 图标与启动页：已从 `public/app-icon.svg` 生成到原生工程

## 每次修改前端后同步

```bash
npm run cap:sync
```

如果当前 Windows 终端找不到 `npm`，本机可用：

```powershell
& 'C:\Users\chena\.trae\binaries\node\versions\24.13.1\npm.cmd' run cap:sync
```

## Android 打包

需要先安装：

- Android Studio
- JDK 21
- Android SDK / Build Tools 35

当前 Windows 本机可用 JDK 路径：

```powershell
$env:JAVA_HOME='C:\Users\chena\.gradle\jdks\eclipse_adoptium-21-amd64-windows.2'
```

因为项目路径包含中文，`android/gradle.properties` 需要保留：

```properties
android.overridePathCheck=true
```

安装好后可运行：

```bash
npm run android:build:debug
```

Debug APK 输出位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

为了方便发送给手机测试，也可以复制到项目根目录并命名为：

```text
美约管家-debug.apk
```

正式发布包：

```bash
npm run android:build:release
```

Release 包需要在 Android Studio 中配置签名后才能发布到应用商店。

## iOS 打包

iOS 需要在 macOS 上完成，Windows 不能直接编译 `.ipa`。

Mac 上需要：

- Xcode
- CocoaPods
- Apple Developer 账号（真机安装或 App Store 发布需要）

在 Mac 上执行：

```bash
npm install
npm run cap:sync
npm run ios:open
```

然后在 Xcode 中选择 Team / 签名证书，使用 Archive 导出 `.ipa` 或上传 App Store Connect。
