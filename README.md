# 若叶睦 Live2D 直播动捕

## 快速启动

双击 `start-live2d.bat`。首次运行会自动安装依赖并生成模型配置，之后直接启动直播应用。

## 启动

```powershell
npm install
npm run prepare:models
npm run dev
```

## 热键

- F1：便装
- F2：活动剧情装
- F3：夏季校服
- F4：冬季校服

输出窗口聚焦时也可以用 1-4 切换。

## OBS

1. 新建窗口捕获。
2. 选择“若叶睦 Live2D”输出窗口。
3. 确认背景透明。

## 抖音/B 站直播伴侣

1. 在 OBS 中把输出窗口加入场景。
2. 开启 OBS VirtualCam。
3. 直播伴侣的摄像头选择 OBS Virtual Camera。
