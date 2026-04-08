# Jest Imports 批量修复指南

## 需要修复的文件列表

所有以下文件都需要在文件顶部（在第一个 import 语句之前）添加：

```typescript
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
```

### 文件列表：

1. node/tests/collaboration.test.ts
2. node/tests/skills/registry.test.ts
3. node/tests/skills/unified-interface.test.ts
4. node/tests/skills/loader.test.ts
5. node/tests/skills/adapters/claude-code-adapter.test.ts
6. node/tests/skills/adapters/codex-adapter.test.ts
7. node/tests/skills/adapters/openclaw-adapter.test.ts
8. node/tests/skills/design/api_design.test.ts
9. node/tests/skills/development/frontend_development.test.ts
10. node/tests/skills/requirements/requirement_decomposition.test.ts

## 注意事项

- 每个文件根据实际使用情况，可能不需要所有导出（如 jest, beforeEach 等）
- 但为了一致性，建议都包含完整导入
- 确保此导入是**第一个** import 语句
- 文件头部的注释应该在导入之前

## 为什么会被回退？

可能原因：
1. ESLint 的 `sort-imports` 规则
2. Prettier 或其他格式化工具
3. VS Code 的自动导入整理

## 解决方案

可以考虑：
1. 在 .eslintrc 中禁用测试文件的 import 排序
2. 在 package.json 的 lint:fix 命令中排除测试文件
3. 使用 `// eslint-disable-next-line` 注释保护导入行
