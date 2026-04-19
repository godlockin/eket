# Convention: Node ID

**规范等级**: MUST
**适用**: 所有加入协作的节点（AI/人/脚本）

---

## 格式

```
<host>-<engine>-<role>-<short-id>
```

- `host`: 主机标识（hostname 小写，去 `.local` 后缀）
- `engine`: `shell` / `node` / `hybrid`
- `role`: `master` / `slaver-<specialty>` / `human` / `bot`
- `short-id`: 6-8 位，来自 `$RANDOM` 或 `uuid v4` 前缀

### 示例

```
alicemac-node-master-a1b2c3
serverbox-shell-slaver-frontend-7d8e9f
bob-laptop-hybrid-human-qa-2b3c4d
ci-runner-shell-bot-cron-5e6f7g
```

### 正则（canonical）

```
^[a-z][a-z0-9_-]{2,63}$
```

**注**: 允许下划线以兼容 `specialty` 中的 `frontend_dev` 等。`host-engine-role-shortid` 是**逻辑**分段，不是正则强制；实际分隔可用 `-` 或 `_`。

---

## 生成

### Shell

```bash
generate_node_id() {
  local host
  host=$(hostname -s | tr '[:upper:]' '[:lower:]' | sed 's/\.local$//')
  local engine="${1:-shell}"
  local role="${2:-slaver}"
  local specialty="${3:-}"
  local short_id
  short_id=$(head -c 16 /dev/urandom | xxd -p | head -c 6)

  local role_part="$role"
  [[ -n "$specialty" ]] && role_part="${role}-${specialty}"

  echo "${host}-${engine}-${role_part}-${short_id}"
}
```

### Node

```typescript
import { hostname } from 'os';
import { randomBytes } from 'crypto';

export function generateNodeId(opts: {
  engine: 'shell' | 'node' | 'hybrid';
  role: 'master' | 'slaver' | 'human' | 'bot';
  specialty?: string;
}): string {
  const host = hostname().toLowerCase().replace(/\.local$/, '');
  const shortId = randomBytes(3).toString('hex');
  const rolePart = opts.specialty ? `${opts.role}-${opts.specialty}` : opts.role;
  return `${host}-${opts.engine}-${rolePart}-${shortId}`;
}
```

---

## 持久化

节点 ID 生成后写入 `.eket/state/instance_config.yml`：

```yaml
instance_id: alicemac-node-master-a1b2c3
role: master
engine: node
generated_at: 2026-04-17T10:00:00Z
```

**禁止**每次启动重新生成；**应**复用已有 ID，除非用户显式 `--reset`。

---

## 唯一性

- **单机**: `short-id` 保证同主机同角色无冲突
- **跨主机**: `host` 保证跨主机无冲突
- **多 session 同 role**: `short-id` 区分，因此同一台 Mac 可以起多个 Master (虽然选举层面仍只有一个生效)

---

## 注意

- **禁止**在 node_id 中使用中文、空格、大写字母
- **禁止**在 node_id 中暴露敏感信息（用户名、邮箱、token）
- **建议**长度不超过 64 字符
