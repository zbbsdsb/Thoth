# 数据库更新计划：支持用户配额限制

为了实现“普通用户有额度限制，富有用户可自备 API Key”的功能，我们需要在数据库中增加对用户使用额度的追踪。

## 1. 变更目标
- 在 `User` 实体中增加额度追踪字段。
- 记录用户使用公共额度（即开发者提供的 Key）进行转录的次数。
- 当用户使用自己的 API Key 时，不计入此额度。

## 2. `firebase-blueprint.json` 更新内容

### 新增字段：
- `public_usage_count`: (number) 用户使用公共 API Key 进行转录的累计次数。
- `quota_limit`: (number) 用户享有的公共额度上限（默认为 5 次，可根据需要调整）。
- `is_premium`: (boolean) 是否为高级用户（可选，用于未来扩展）。

### 更新后的 `User` 实体结构：
```json
"User": {
  "title": "User",
  "description": "用户个人资料及配额信息",
  "type": "object",
  "properties": {
    "email": { "type": "string", "format": "email" },
    "created_at": { "type": "string", "format": "date-time" },
    "public_usage_count": { "type": "integer", "description": "使用公共额度的次数" },
    "quota_limit": { "type": "integer", "description": "公共额度上限" }
  },
  "required": ["email", "created_at", "public_usage_count"]
}
```

## 3. `firestore.rules` 更新内容
- 增加对 `public_usage_count` 的保护：用户可以读取自己的额度，但不能随意修改（应由后端逻辑或受限的客户端逻辑在转录成功后增加）。
- 验证 `public_usage_count` 必须为非负整数。

## 4. 执行步骤
1. **更新 `firebase-blueprint.json`**：同步最新的数据模型定义。
2. **更新 `firestore.rules`**：增加字段校验逻辑。
3. **部署规则**：使用 `deploy_firebase` 工具。
4. **代码集成**：
   - 在 `App.tsx` 的 `handleRecordStop` 逻辑中，增加额度检查。
   - 如果 `hasUserKey` 为 `false` 且 `public_usage_count >= quota_limit`，则提示用户额度已耗尽，建议使用个人 Key。
   - 转录成功后，若使用的是公共 Key，则更新 Firestore 中的 `public_usage_count`。

---
**请确认以上计划。确认后我将开始执行。**
