/**
 * EKET Framework - Design System Skill
 * Version: 1.0.0
 *
 * 设计系统技能：从设计语言到组件库的完整规范体系
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface DesignSystemInput {
  /** 产品名称 */
  productName: string;
  /** 品牌主色（可选） */
  brandColor?: string;
  /** 是否已有设计系统（更新vs新建） */
  isUpdate?: boolean;
  /** 目标框架（影响交付物格式） */
  frontendFramework?: 'react' | 'vue' | 'angular' | 'vanilla';
}

export const designSystemSkill: Skill = {
  name: 'design-system',
  category: SkillCategory.UX,
  description: '设计系统：从 Token 到组件库的完整规范，与开发同步',
  version: '1.0.0',

  async execute(input: SkillInput): Promise<SkillOutput> {
    const data = input as unknown as DesignSystemInput;
    const framework = data.frontendFramework ?? 'react';
    const mode = data.isUpdate ? '更新' : '新建';

    const start = Date.now();
    return { success: true, data: {
      steps: [
        {
          step: 1,
          title: '设计语言定义（Design Tokens）',
          description: '建立视觉语言的最小单元',
          actions: [
            `${mode}「${data.productName}」设计系统`,
            `色彩系统：主色${data.brandColor ? `（${data.brandColor}）` : ''}、辅色、语义色（成功/警告/错误/信息）、中性色阶`,
            '色彩可访问性：对比度 ≥ 4.5:1（文字），≥ 3:1（大文字/UI组件），工具：Contrast Checker',
            '排版：字体族、字号阶梯（8/12/14/16/18/24/32/40）、行高、字重',
            '间距系统：基础单位 4px，阶梯 4/8/12/16/24/32/48/64',
            '圆角/阴影/动效：统一规范，避免随意使用',
            '输出：Figma Token 文件 + CSS Variables / JSON Token 文件',
          ],
        },
        {
          step: 2,
          title: '基础组件库',
          description: '构建可复用的 UI 积木',
          actions: [
            '原子组件：Button（含所有变体/尺寸/状态）、Input、Checkbox、Radio、Select、Tag、Badge',
            '分子组件：Form、Card、Modal、Drawer、Dropdown、Tooltip、Toast',
            '有机体：Header、Sidebar、Table、List、Pagination',
            '每个组件覆盖所有状态：Default / Hover / Active / Focus / Disabled / Loading / Error',
            '响应式：定义断点（320/768/1024/1440），组件在各断点的行为',
          ],
        },
        {
          step: 3,
          title: '组件文档',
          description: '让开发和设计都能高效使用',
          actions: [
            '每个组件文档：用途描述、属性列表（类型/默认值/必填）',
            '交互示例：可运行的 Demo（Storybook 或 Figma Interactive）',
            'Dos & Don\'ts：明确什么时候该用/不该用',
            '相关组件：指向相似或替代组件',
            `输出路径：docs/design-system/{component-name}.md + ${framework} Storybook`,
          ],
        },
        {
          step: 4,
          title: '可访问性检查',
          description: '确保所有用户都能使用',
          actions: [
            '颜色对比度：使用 axe 或 Stark（Figma插件）批量检查',
            '键盘导航：所有交互元素可 Tab 聚焦，焦点状态可见',
            'ARIA 标签：交互组件有语义化标签（role/aria-label/aria-describedby）',
            '屏幕阅读器：VoiceOver/NVDA 测试核心流程',
            '动效：提供减少动效选项（prefers-reduced-motion）',
            '合规目标：WCAG 2.1 AA 级',
          ],
        },
        {
          step: 5,
          title: '与开发同步',
          description: '消除设计-开发交付摩擦',
          actions: [
            `Figma → ${framework} 映射：CSS Variables 命名与 Token 名称一致`,
            'Storybook：每个组件有 Story，支持所有变体预览',
            '交付规范：标注工具（Figma Inspect / Zeplin），切图规范（2x/3x）',
            '设计-开发对齐会（Design Review）：每个 Sprint 开始前同步',
            '版本化：语义化版本号，Figma 分支对应代码分支',
          ],
        },
        {
          step: 6,
          title: '版本管理',
          description: '保持设计系统可持续演进',
          actions: [
            '语义化版本：Major（破坏性变更）/ Minor（新增）/ Patch（修复）',
            '变更日志（CHANGELOG.md）：每次发布说明变更内容和影响范围',
            '废弃策略：弃用通知 → 保留2个版本 → 移除（不可跳过）',
            '向后兼容：新增属性设默认值，不直接删除现有属性',
            '健康指标：组件采用率、Design-Dev 差异率定期统计',
          ],
        },
      ],
      summary: `设计系统${mode}完成：「${data.productName}」，6步流程，Token→组件→文档→可访问性→${framework}同步`,
    }, duration: Date.now() - start };
  },
};
