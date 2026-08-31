# Pareto Explorer（PBv7 / PBv8）

Pareto Explorer 帮助你分析 PBv7 和 PBv8 优化结果、比较取舍、筛选配置并创建后续 Optimize 预设。它专为多目标结果设计，在这些结果中没有任何单一指标能给出完整答案。

## 在哪里打开

- PBGui：**PBv7/PBv8 -> Optimize -> Results**，或匹配的 **Pareto Explorer** 导航条目。
- 从 Optimize 结果表或结果侧边栏用 **Pareto Explorer** 打开一个结果。
- 页面可以以快速的仅 pareto 模式启动，之后从侧边栏扫描完整的 `all_results.bin` 流。

## 核心概念

每个分数、图表和 Pareto 星标都相对于当前加载并可见的配置集。

- 快速模式主要比较 Passivbot pareto JSON 候选。
- 完整模式扫描所有 `all_results.bin` 记录，然后比较由 **Max Configs** 和 **Candidate Selection** 保留的候选子集。
- Display Range 改变可见切片，因此排名和可见的 Pareto 星标可能改变。
- 将排名和分数视为筛选信号，而不是最终的实盘交易决策。

## 总览

Overview 是决策仪表板。加载结果后首先使用它。

- **Top Champions** 显示当前可见切片中最强的候选。
- **Insights** 突出显示明显的信号，如参数边界压力或风格多样性。
- **Pareto Front Preview** 显示当前取舍前沿的形状。
- **Robustness vs Performance** 显示收益是否有一致性支撑。
- 只有一个场景时，稳健性可能饱和在 `1.00`；PBGui 将该情况标记为缺乏多场景证据，而不是声称已证明一致性。
- 选择配置后，所选配置详情出现在图表下方。

推荐流程：

1. 扫描 Top Champions。
2. 单击一个冠军或图表点。
3. 查看 Metrics、Trading Style、Robustness、Scenario Metrics 和 Full Configuration。
4. 信任候选前使用 **Run Backtest**。
5. 只有配置看起来值得精炼时，才使用 **Create Optimize Preset from this Config**。PBGui 保留结果的 PB7/PB8 代。

PB8 完整模式在分析前重建增量的压缩 `all_results.bin` 条目。第一次扫描在结果文件旁边构建经过源验证的检查点缓存。之后的加载（包括 API 重启后的加载）在源文件大小和修改时间不变时复用该缓存。嵌套的 PB8 机器人参数和边界显示为点分路径，并在预设和 Backtest 传递时转换回规范的嵌套配置对象。

## 资源管理器

Explorer 用于交互式取舍分析。

- **Visualization** 在 2D 散点、3D 散点、3D 投影和雷达图之间切换。
- **Quick Views** 为常见决策挑选有用的指标组合。
- **Custom** 让你手动选择 X、Y 以及可选的 Z 指标。
- **Color by** 通过点颜色增加一个指标维度。
- **Show all configs** 将所选候选与完整可见点云进行比较，而不仅仅是 pareto 点。
- **Performance Priority**、**Risk Aversion** 和 **Robustness Importance** 驱动 Best Match 辅助工具。

需要回答以下问题时使用 Explorer：

- 这个配置真的在好的前沿上，还是只是单一指标表现好？
- 哪个邻近配置牺牲少量利润但大幅降低风险？
- 雷达候选是均衡的轮廓，还是一个极端优势掩盖了弱点的轮廓？

## 深度智能：参数

Parameters Intelligence 解释优化搜索在参数值周围的行为。

- **Parameter Influence Heatmap** 显示可变参数与绩效指标之间的相关性。
- **Parameters Near Bounds** 显示接近其优化边界的参数。
- **Top N Parameters** 控制显示多少个参数。

创建后续预设前使用此标签页。接近边界的参数是精炼的好候选，因为优化器可能想在那个方向搜索更远。

## 深度智能：场景

Scenario Analysis 跨加载的回测场景比较可见配置集。

- 指标选择器选择用于场景箱线图和统计的值。
- 图表和统计卡片是可见配置集上的聚合视图。
- 此标签页不表示单个所选配置；它显示可见种群在不同场景下的行为。

用它来避免选择只在某个狭窄场景中表现好的配置。

## 深度智能：进化

Optimization Evolution 显示优化运行是否仍在随时间找到显著更好的配置。它需要完整模式，因为快速的 pareto JSON 文件不保留原始 `all_results.bin` 配置索引。

- **Metric** 选择时间线值。
- **Show all configs** 在仅 pareto 点和所有可见配置之间切换。
- **Hide liquidation outliers** 防止极端值压垮图表比例。
- **Meaningful Improvement (%)** 忽略微小的最佳迄今变化，使噪音不会看起来像进步。
- 蓝色的 **Best So Far** 线显示到每个点为止找到的最佳值。
- 在完整模式下单击一个点会选中该配置，供图表下方检查。

在快速模式下，此标签页显示提示而不是图表。需要所选完整流时间线时，使用侧边栏 **Scan all_results** 按钮。

用摘要决定另一次运行是否可能有帮助：

- 接近末尾的 **Last meaningful improvement** 表明搜索可能仍有产出。
- 接近零的 **Final 20% improvement** 表明运行已经趋于平坦。
- **Suggested minimum iterations** 根据最后一次有意义改进发生的位置给出实用的下次运行目标。

## 深度智能：相关性

Multi-Metric Correlation 跨规范化的风险/轮廓维度比较几个配置。

- **Selection Strategy** 选择如何挑选配置：Top Performers、Diverse Styles 或 Risk Spectrum。
- **Configs** 控制雷达中显示多少条轨迹。
- Weighted 和 BTC 开关在可用时选择首选指标变体。

用它快速比较候选形状。均衡的雷达通常比在一个轴获胜而输掉其他几个轴的配置更容易验证。

## 设置与加载

Settings 控制加载什么数据。

- **Result Path** 是优化结果目录或 pareto 目录。
- **Max Configs** 限制为交互式分析保留多少候选；它不限制扫描多少源记录。
- **Candidate Selection** 控制保留的混合。Metric criteria 保留排名最高的配置，而 **coverage (optimize timeline)** 均匀采样运行，暴露更广的搜索历史范围。
- **Persist defaults** 保存当前加载偏好。
- 完整模式使用侧边栏 **Scan all_results** 按钮。Candidate Set 卡片分别报告可见、选择和扫描计数。
- 使用 **Show Passivbot Paretos** 切回快速的仅 pareto 模式。

大结果的第一次扫描可能需要时间。成功的扫描会创建持久缓存，因此即使 API 重启后下次加载也快得多。`all_results.bin` 改变时缓存自动重建。如果加载后交互式 UI 感觉缓慢，减少 Max Configs 或使用仅 pareto 模式，直到你知道结果的哪部分值得深入检查。

更改 Result Path 会立即清除之前的详情、选择和固定的基准线。来自先前结果的延迟后台加载、图表、详情、playground、预设、命令中心或深度智能响应会被忽略。

## Optimize 预设精炼

预设面板为所选结果的 PBv7 或 PBv8 代创建 Optimize 配置，并使用该版本的保存和排队 API。

- 首先选择 **Optimization goal**。默认的 Balanced 选项保持运行评分。
- 除非需要自定义名称，否则保留生成的 **Preset name**。
- 正常精炼运行保持 **Only adjust parameters near optimize bounds** 启用。
- 使用 **Bounds window (%)** 在所选值周围收紧搜索边界。
- PB8 精炼预设自动使用所选候选作为 `Starting Seeds = self`。已知候选通过 `--start` 传给 PB8，并在收窄的边界内评估，而不是依赖新的随机种群重新发现它。
- 使用 **Risk adjustment** 收紧或放宽风险相关的边界和限制。
- **Create Optimize Preset** 保存配置并打开 Optimize。
- **Create & Queue** 保存并排队，不打开 Optimize。

先使用小的边界窗口。紧窗口对精炼有用，但过度收紧可能隐藏更好的邻近区域。

## 最佳实践

1. 从 Overview 开始，而不是 Deep Intelligence。首先识别值得研究的候选。
2. 可用时在最终决定前扫描 `all_results.bin`，需要指标领先者之外的替代方案时包含 **coverage**。
3. 有意使用 Display Range。在前 500 中强大的配置在前 5000 中可能看起来普通。
4. 优先选择风险可接受的均衡候选，而不是绝对最高的利润点。
5. 将所选配置用作实盘候选前，始终在 Backtest 中验证。
6. 创建后续 Optimize 预设前使用 Deep Intelligence Parameters。
7. 精炼预设时，先调整接近边界的参数，并保持边界更改适度。
8. 决定前至少比较两个邻近替代方案。最好的实盘候选往往不是排名最高的点。

## 相关

- PBv7/PBv8 Optimize：创建并排队后续优化运行。
- PBv7/PBv8 Backtest：信任所选配置前先验证它。
- Strategy Explorer：缩小候选列表后可视化检查一个配置。对于 PB8，用 **Pin Explorer Baseline** 固定一个候选，从同一结果选择另一个候选，并打开 Strategy Explorer 用原生有界重放比较两者。基准是临时的且仅限页面；更改结果或重新加载会清除它。引用的稀疏覆盖必须可用，否则 PBGui 阻止传递。Explorer 字段距活动 Optimize 边界 5% 以内会高亮；配置边界缺失时运行时参数范围是回退。
