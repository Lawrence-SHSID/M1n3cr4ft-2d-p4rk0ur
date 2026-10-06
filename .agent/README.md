# Skybound 项目记录

首次归档日期：2026-10-02；最近更新：2026-10-06（Asia/Shanghai）。这些记录保存在项目内，用于跨会话继续开发。

| 文件 | 内容 |
| --- | --- |
| [DESIGN.md](DESIGN.md) | 游戏设计大纲、当前实现、模块与资源位置 |
| [CHANGELOG.md](CHANGELOG.md) | 按本次会话顺序记录需求、修改与验证 |
| [DECISIONS.md](DECISIONS.md) | 用户明确确定的要求及其最新版本；助手实现选择另有标注 |
| [REJECTED.md](REJECTED.md) | 用户明确否决的方案，以及被后续要求替换的旧方案 |

## 使用原则

1. 继续开发前阅读设计大纲、已确定方案和否决记录；再查看修改记录的最新条目。
2. 当前会话中最新的用户指令优先。旧方案的历史记录不代表它仍有效。
3. “已实现”不等于“用户明确确认”。没有用户明确表态，不得捏造批准或否决。
4. 助手的实现默认值可以随后续需求调整，不应被当成必须再次审批的用户约束。
5. 修改后同步更新设计大纲和修改记录。用户明确确定或否决方案时，更新相应文件并保留替代关系。
6. 验证记录必须注明范围与日期。本地构建、测试、浏览器检查不代表已上线。
7. 不在这些文件中保存密码、令牌或其他秘密。

本次记录的事实来源是本聊天中的用户要求、当前源码及本次开发的实际验证。早期草稿不能覆盖已实现并验证的现状。

## 最新阶段 M15（2026-10-06）

启动时进入标题菜单：Singleplayer、Multiplayer、Level editor、My levels、How to play；背景用现有游戏渲染器生成 Steve 跳跃画面并轻微模糊。新增可测试／保存的关卡编辑器，支持方块、移动半格石板、梯子、树、起终点、检查点和自行绘制的实心／危险障碍。My levels 保存在当前浏览器，支持编辑及单／双人游玩。需求见 D29，具体范围见 DESIGN.md／CHANGELOG.md M15。本地 191 项测试与 TypeScript／生产构建通过，localhost 保持运行；截图 artifacts/skybound-menu-preview.jpg、skybound-editor-preview.jpg。没有线上部署。

## 最新阶段 M16（2026-10-06）

编辑器左键放置、右键删除；工具分为 Blocks、Obstacles、Objects、Tools。梯子每片固定 1 格，拖动可堆叠；Select & move 可拖动对象，Ctrl+Z 撤销、Ctrl+Y 重做，每次拖动一个撤销步骤。旧高梯子打开编辑器时拆成单格，游玩时相连梯子合并为连续攀爬区域。要求见 D30，替换关系见 S11。本地 198/198 测试及 TypeScript／生产构建通过，浏览器验证点击、拖动、快捷键和梯子堆叠；localhost 保持运行，截图 artifacts/skybound-editor-controls-preview.jpg。没有线上部署。

## 最新阶段 M17（2026-10-06）

每位玩家每次新课程有 5% 几率获得马，普通跳高 2.5 格，跑速为冲刺的 130%（8.45 格／秒）；重试保留，完整重开重新抽取。骷髅箭改为 2.5 心伤害、0.75 格击退。新增 Dream、Silver、Skeppy，使用本次用户参考图片，可各自选皮肤并保存偏好。具体默认规则见 D31／DESIGN M17。本地 204/204 测试、TypeScript／生产构建通过；浏览器确认自然抽到马、三种皮肤、双人独立选择和飞行外观。localhost 运行，最终打开 Solo Bonus 8／Dream；截图 artifacts/skybound-horse-skins-preview.jpg、skybound-new-skins-bonus-preview.jpg。未部署线上网站。

## 最新阶段 M18（2026-10-06）

Dream、Silver、Skeppy 游戏人物改用用户展开图第二列的侧视图，四肢收拢为侧身站姿；左右方向沿用镜像，骑乘和飞行复用同一侧视部件。TypeScript／生产构建通过，浏览器检查三种皮肤及飞行，控制台无警告／错误。localhost 保持运行，最终第 1 关 Teamwork／Dream 与 Skeppy ready，截图 artifacts/skybound-side-skins-preview.jpg。本轮未重跑 M17 的 204 项物理测试，未上线。

## 最新阶段 M19（2026-10-06）

按用户要求移除 SpeedSilver／Silver，当前皮肤为 Steve、Alex、Dream、Skeppy。Dream／Skeppy 保留 M18 侧视图。旧 silver 偏好安全回到对应默认。6/6 坐骑／外观针对性测试及 TypeScript／生产构建通过；浏览器两位玩家选择器确认 Silver 为零项，localhost 保持第 1 关 Teamwork ready。截图 artifacts/skybound-skins-without-silver-preview.jpg。没有上线。
