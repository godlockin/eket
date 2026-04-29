# EKET 扩展专家库索引

> **使用方式**：找到需要的专家 → 读取对应 `.md` 文件获取完整 persona。
> 路径相对于 `~/.claude/skills/eket/experts/optional/`。
> **安装扩展包**：`bash ~/.claude/skills/eket/scripts/install-extended.sh`

---

## 🗺️ 组织架构树（52位专家）

```
扩展专家库
│
├── 🔧 tech/                    工程技术深化（8位）
│   ├── security.md             🔒 安全工程师
│   ├── devops.md               ⚙️  DevOps 工程师
│   ├── qa.md                   🧪 QA 工程师（高级）
│   ├── dba.md                  🗄️  数据库管理员 DBA
│   ├── sre.md                  🛡️  站点可靠性工程师 SRE
│   ├── mobile.md               📱 移动端工程师（iOS/Android/跨端）
│   ├── performance.md          ⚡ 性能工程师
│   └── platform.md             🏗️  平台工程师 / 开发者体验
│
├── 🤖 ai/                      AI / ML / 数据（8位）
│   ├── aiml.md                 🤖 AI工程师（LLM/RAG/向量库）
│   ├── ml.md                   🤖 机器学习工程师（训练/推理）
│   ├── nlp.md                  💬 NLP工程师
│   ├── cv.md                   👁️  计算机视觉工程师
│   ├── mlops.md                🚀 MLOps工程师（模型上线/监控）
│   ├── bigdata.md              🌊 大数据工程师（Spark/Flink/数仓）
│   ├── data-analyst.md         📊 数据分析师（BI/指标/A/B测试）
│   └── data.md                 📦 数据工程师（ETL/管道）
│
├── 🎨 design/                  设计（5位）
│   ├── ux-research.md          🔍 UX研究员（用户访谈/可用性测试）
│   ├── visual.md               🖌️  视觉设计师（UI/Design System）
│   ├── brand.md                🏷️  品牌设计师（VI/品牌手册）
│   ├── motion.md               🎬 动效设计师（Lottie/CSS动效）
│   └── industrial.md           🏭 工业/硬件产品设计师（CMF/DFM）
│
├── 📣 marketing/               市场营销（5位）
│   ├── growth.md               📈 增长黑客（AARRR/AB测试/裂变）
│   ├── content.md              ✍️  内容营销专家（SEO内容/分发）
│   ├── seo.md                  🔍 SEO/SEM专家（技术SEO/付费搜索）
│   ├── ads.md                  💰 广告投放专家（信息流/ROAS）
│   └── product-marketing.md   🎯 产品营销经理 PMM（GTM/定位）
│
├── 📢 pr/                      公关 / 宣传（4位）
│   ├── pr-manager.md           📰 公关经理（新闻稿/品牌传播）
│   ├── crisis.md               🚨 危机公关专家（黄金4小时响应）
│   ├── media.md                🎙️  媒体关系专家（新闻投放）
│   └── kol.md                  🌟 KOL/达人合作专家（影响力营销）
│
├── 🏢 business/                商业分析 / 法务（5位）
│   ├── business.md             💼 业务分析师（业务规则/行业背景）
│   ├── strategy.md             🗺️  战略顾问（竞争分析/路线图）
│   ├── finance.md              💰 财务分析师（P&L/DCF/单位经济）
│   ├── legal.md                ⚖️  法务顾问（合同/IP/数据隐私）
│   └── compliance.md           📋 合规专家（ISO/SOC2/等保）
│
├── 🤝 consulting/              咨询（3位）
│   ├── mgmt.md                 🏛️  管理咨询顾问（MECE/战略落地）
│   ├── it-consulting.md        💻 IT咨询顾问（数字化转型/ERP）
│   └── process.md              🔄 流程优化顾问（精益/六西格玛）
│
├── 👥 hr/                      人力资源（5位）
│   ├── hr.md                   👥 HR通才 / 猎头（综合HR职能）
│   ├── recruiter.md            🎯 技术猎头/招聘专员（JD/面试流程）
│   ├── hrbp.md                 🤝 HR BP（组织诊断/绩效/人才盘点）
│   ├── l-and-d.md              📚 学习与发展专家（TNA/课程/70-20-10）
│   └── comp.md                 💵 薪酬福利专家（带宽/benchmarking/股权）
│
├── 🎓 training/                培训 / 教育（3位）
│   ├── trainer.md              🎓 企业培训师（ADDIE/工作坊）
│   ├── coach.md                🏋️  职业教练（GROW模型/高管辅导）
│   └── curriculum.md           📝 课程设计师（学习路径/LMS）
│
├── 📖 knowledge/               知识管理 / 研究（3位）
│   ├── km.md                   📚 知识管理专家（知识架构/企业Wiki）
│   ├── researcher.md           🔬 技术研究员（调研/PoC/论文）
│   └── doc-writer.md           ✍️  技术文档工程师（API文档/开发者指南）
│
└── 🏭 ops/                     运营（4位）
    ├── product-ops.md          🎯 产品运营专家（用户分层/活动策划）
    ├── community.md            👋 社区运营专家（KOC/冷启动）
    ├── customer.md             🎧 客户成功专家（NPS/健康分/QBR）
    └── supply-chain.md         🚚 供应链运营专家（EOQ/供应商管理）
```

---

## ⚡ 快速查找

### 按技术场景

| 需求 | 专家 | 文件 |
|------|------|------|
| 安全审计/渗透/鉴权 | 安全工程师 | `tech/security.md` |
| CI/CD/K8s/容器化 | DevOps | `tech/devops.md` |
| 数据库优化/索引/事务 | DBA | `tech/dba.md` |
| SLA/故障/on-call | SRE | `tech/sre.md` |
| iOS/Android/跨端 | 移动端工程师 | `tech/mobile.md` |
| 压测/火焰图/GC调优 | 性能工程师 | `tech/performance.md` |
| 开发者平台/IDP/DX | 平台工程师 | `tech/platform.md` |
| LLM/RAG/向量库 | AI工程师 | `ai/aiml.md` |
| 模型训练/特征工程 | ML工程师 | `ai/ml.md` |
| NLP/文本分类/NER | NLP工程师 | `ai/nlp.md` |
| 目标检测/图像识别 | CV工程师 | `ai/cv.md` |
| 模型上线/监控/漂移 | MLOps | `ai/mlops.md` |
| Spark/Flink/数仓 | 大数据工程师 | `ai/bigdata.md` |
| 指标/BI/A/B测试 | 数据分析师 | `ai/data-analyst.md` |
| ETL/数据管道 | 数据工程师 | `ai/data.md` |

### 按业务场景

| 需求 | 专家 | 文件 |
|------|------|------|
| 用户研究/可用性测试 | UX研究员 | `design/ux-research.md` |
| UI/设计系统/规范 | 视觉设计师 | `design/visual.md` |
| 品牌/VI/Logo | 品牌设计师 | `design/brand.md` |
| 动效/过渡动画 | 动效设计师 | `design/motion.md` |
| 硬件外观/CMF | 工业设计师 | `design/industrial.md` |
| 增长/转化率/裂变 | 增长黑客 | `marketing/growth.md` |
| SEO/自然流量 | SEO/SEM | `marketing/seo.md` |
| 内容营销/文案 | 内容营销 | `marketing/content.md` |
| 信息流广告/ROAS | 广告投放 | `marketing/ads.md` |
| GTM/产品定位 | PMM | `marketing/product-marketing.md` |
| 媒体曝光/新闻稿 | 公关经理 | `pr/pr-manager.md` |
| 危机处理/舆情 | 危机公关 | `pr/crisis.md` |
| 媒体采访/关系 | 媒体关系 | `pr/media.md` |
| KOL/达人/种草 | KOL合作 | `pr/kol.md` |
| 战略规划/竞品 | 战略顾问 | `business/strategy.md` |
| 财务模型/融资 | 财务分析师 | `business/finance.md` |
| 合同/知识产权 | 法务顾问 | `business/legal.md` |
| ISO/SOC2/合规 | 合规专家 | `business/compliance.md` |
| 管理咨询/MECE | 管理顾问 | `consulting/mgmt.md` |
| 数字化转型/ERP | IT咨询 | `consulting/it-consulting.md` |
| 精益/六西格玛 | 流程优化 | `consulting/process.md` |
| 猎头/JD/面试 | 技术猎头 | `hr/recruiter.md` |
| 组织/绩效/盘点 | HR BP | `hr/hrbp.md` |
| 培训体系/课程 | L&D | `hr/l-and-d.md` |
| 薪酬/股权/带宽 | 薪酬专家 | `hr/comp.md` |
| 工作坊/技能培训 | 企业培训师 | `training/trainer.md` |
| 职业规划/领导力 | 职业教练 | `training/coach.md` |
| 在线课程/LMS | 课程设计师 | `training/curriculum.md` |
| 知识库/企业Wiki | 知识管理 | `knowledge/km.md` |
| 技术调研/PoC | 技术研究员 | `knowledge/researcher.md` |
| API文档/开发者指南 | 技术文档 | `knowledge/doc-writer.md` |
| 用户运营/活动 | 产品运营 | `ops/product-ops.md` |
| 社区/Discord/开源 | 社区运营 | `ops/community.md` |
| 客户成功/续费 | CSM | `ops/customer.md` |
| 供应链/库存/采购 | 供应链运营 | `ops/supply-chain.md` |

---

## 📦 安装状态

| 领域 | 专家数 | 状态 | 3节注入 (TASK-225 codemod) |
|------|-------|------|---------------------------|
| 🔧 tech | 8 | ✅ 完成 | ✅ 已注入 |
| 🤖 ai | 8 | ✅ 完成 | ✅ 已注入 |
| 🎨 design | 5 | ✅ 完成 | ✅ 已注入 |
| 📣 marketing | 5 | ✅ 完成 | ✅ 已注入 |
| 📢 pr | 4 | ✅ 完成 | ✅ 已注入 |
| 🏢 business | 5 | ✅ 完成 | ✅ 已注入 |
| 🤝 consulting | 3 | ✅ 完成 | ✅ 已注入 |
| 👥 hr | 5 | ✅ 完成 | ✅ 已注入 |
| 🎓 training | 3 | ✅ 完成 | ✅ 已注入 |
| 📖 knowledge | 3 | ✅ 完成 | ✅ 已注入 |
| 🏭 ops | 4 | ✅ 完成 | ✅ 已注入 |
| **合计** | **53** | ✅ 全部就绪 | ✅ 53/53 |

> **3节注入** 列说明：标注 `scripts/codemod-inject-3sections.sh` 是否已为该领域全量注入 3 节 minimal TODO skeleton（Common Rationalizations / Red Flags / Verification）。INDEX.md 通过 `--exclude=INDEX.md` 自动跳过；校验对应 `bash scripts/check-skill-anatomy.sh --minimal <file>` 或 `--all`。

---

*最后更新：2026-04-27 · TASK-227（与 subrepo `experts/INDEX.md` 同源镜像）*
