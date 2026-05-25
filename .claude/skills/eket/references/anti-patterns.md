# EKET 反模式库

> AI 编码常见错误模式及正确做法，派生自 Karpathy Guidelines 和 EKET 实践经验

---

## 1. 隐藏假设 (Hidden Assumptions)

**场景**: "添加用户数据导出功能"

❌ **反模式**:
```python
def export_users():
    users = db.query("SELECT * FROM users")
    return jsonify(users)  # 直接返回全部字段
```
直接实现，未确认格式、字段范围、权限控制。

✅ **正确做法**:
```python
# 先列出假设并确认：
# - 导出格式？(CSV/JSON/Excel)
# - 包含哪些字段？密码/手机号如何处理？
# - 谁有权限导出？需要审计日志吗？
# - 数据量大时如何分页或流式处理？

def export_users(format: str, fields: list[str], requester_id: str):
    audit_log(requester_id, "user_export")
    users = db.query(f"SELECT {','.join(fields)} FROM users")
    return serialize(users, format)
```

**口诀**: "Don't assume. Don't hide confusion."

---

## 2. 过度抽象 (Over-Abstraction)

**场景**: "写一个计算折扣的函数"

❌ **反模式**:
```python
class DiscountStrategyFactory:
    _strategies = {}
    
    @classmethod
    def register(cls, name: str, strategy: "DiscountStrategy"):
        cls._strategies[name] = strategy
    
    @classmethod
    def create(cls, name: str) -> "DiscountStrategy":
        return cls._strategies[name]()

class DiscountStrategy(ABC):
    @abstractmethod
    def calculate(self, price: float) -> float: ...

class PercentageDiscount(DiscountStrategy):
    def __init__(self, percent: float):
        self.percent = percent
    
    def calculate(self, price: float) -> float:
        return price * (1 - self.percent / 100)
```

✅ **正确做法**:
```python
def calculate_discount(price: float, percent: float) -> float:
    """计算折扣后价格"""
    return price * (1 - percent / 100)
```

**口诀**: "Minimum code. Nothing speculative."

---

## 3. Drive-by 重构 (Drive-by Refactoring)

**场景**: "修复空邮箱导致验证器崩溃的 bug"

❌ **反模式**:
```python
# PR diff 包含:
# 1. 修复空邮箱 bug（必要）
# 2. 重命名 validate_email -> validate_email_address（不必要）
# 3. 添加类型注解到整个文件（不必要）
# 4. 调整缩进风格（不必要）
```

✅ **正确做法**:
```python
# 只修改导致 bug 的那一行
def validate_email(email: str) -> bool:
    if not email:  # 新增：空值检查
        return False
    return "@" in email and "." in email
```

**口诀**: "Touch only what you must. Clean up only your own mess."

---

## 4. 风格漂移 (Style Drift)

**场景**: "给上传函数添加日志"

❌ **反模式**:
```python
# 原代码用 snake_case，你改成 camelCase
# 原代码用双引号，你改成单引号
# 原代码用 logging，你改成 print
def uploadFile(file):  # 原本是 upload_file
    print('Uploading...')  # 原本用 logging
    ...
```

✅ **正确做法**:
```python
# 保持现有风格
def upload_file(file):
    logging.info("Uploading file: %s", file.name)  # 新增日志
    ...
```

**口诀**: "Match existing style. Don't impose preferences."

---

## 5. 模糊目标 (Vague Goals)

**场景**: "修复认证系统"

❌ **反模式**:
```
直接开始改代码，没有明确：
- 具体是什么问题？
- 如何验证修复成功？
- 会影响哪些功能？
```

✅ **正确做法**:
```markdown
## 目标定义
- 问题：用户登录后 token 5分钟过期，应为 24 小时
- 验证：修改后 token 有效期为 24h，现有 session 不受影响
- 范围：只改 token 生成逻辑，不动刷新机制

## 步骤
1. 写测试验证当前 token 过期时间
2. 修改 TOKEN_EXPIRY 常量
3. 运行测试确认修复
4. 验证现有 session 仍有效
```

**口诀**: "Define success. Loop until verified."

---

## 6. any 类型滥用 (any Type Abuse)

**场景**: TypeScript 项目中处理 API 响应

❌ **反模式**:
```typescript
async function fetchUser(id: string): Promise<any> {
    const res = await fetch(`/api/users/${id}`);
    return res.json();  // any 类型，调用方无类型检查
}

// 调用处
const user = await fetchUser("123");
console.log(user.nmae);  // 拼写错误，编译器不报错
```

✅ **正确做法**:
```typescript
interface User {
    id: string;
    name: string;
    email: string;
}

async function fetchUser(id: string): Promise<User> {
    const res = await fetch(`/api/users/${id}`);
    const data: unknown = await res.json();
    return validateUser(data);  // 运行时校验
}

// 调用处
const user = await fetchUser("123");
console.log(user.nmae);  // TS Error: Property 'nmae' does not exist
```

**口诀**: "Type first, implement second."

---

## 7. 缺失错误边界 (Missing Error Boundaries)

**场景**: 调用外部 API

❌ **反模式**:
```python
def get_weather(city: str) -> dict:
    response = requests.get(f"https://api.weather.com/{city}")
    return response.json()  # 网络失败？404？超时？
```

✅ **正确做法**:
```python
def get_weather(city: str) -> dict | None:
    try:
        response = requests.get(
            f"https://api.weather.com/{city}",
            timeout=5
        )
        response.raise_for_status()
        return response.json()
    except requests.Timeout:
        logger.warning("Weather API timeout for %s", city)
        return None
    except requests.HTTPError as e:
        logger.error("Weather API error: %s", e)
        return None
```

**口诀**: "Assume everything fails. Handle gracefully."

---

## 8. 硬编码配置 (Hardcoded Configuration)

**场景**: 数据库连接

❌ **反模式**:
```python
def get_db():
    return psycopg2.connect(
        host="192.168.1.100",
        port=5432,
        user="admin",
        password="supersecret123"  # 密码提交到 git
    )
```

✅ **正确做法**:
```python
def get_db():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", "5432")),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )
```

**口诀**: "Secrets in env. Fail fast at startup."

---

## 快速检查清单

| 反模式 | 信号 | 检查命令 |
|--------|------|----------|
| 隐藏假设 | 无需求澄清直接编码 | — |
| 过度抽象 | 只用一次的 Factory/Strategy | `grep -r "Factory\|Strategy" src/` |
| Drive-by 重构 | PR 改动超出 ticket 范围 | `git diff --stat` |
| 风格漂移 | 新代码与现有风格不一致 | lint 工具 |
| 模糊目标 | 无测试直接改代码 | — |
| any 滥用 | TypeScript 中 any 计数 | `grep -r ": any" src/ \| wc -l` |
| 缺失错误边界 | 无 try/catch 的外部调用 | `grep -r "fetch\|requests\." src/` |
| 硬编码配置 | 代码中的 IP/密码/URL | `grep -rE "[0-9]+\.[0-9]+\.[0-9]+\|password" src/` |

---

## 参考

- [Andrej Karpathy on LLM Coding Pitfalls](https://twitter.com/karpathy)
- [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)
- EKET 项目实践经验
