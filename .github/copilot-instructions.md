# Coding Rules

## 1. Quy tắc khai báo TypeScript types

- **Bắt buộc sử dụng keyword `type`** cho tất cả các khai báo kiểu dữ liệu trong TypeScript.
- **Không được sử dụng `interface`** cho các type thông thường.

### ✅ Trường hợp duy nhất được phép dùng `interface`

- Chỉ sử dụng `interface` khi khai báo **để một `class` implement**.

### ✅ Ví dụ đúng

```ts
type User = {
  id: string
  name: string
  email: string
}

type ApiResponse<T> = {
  data: T
  error?: string
}

interface Repository {
  save(data: unknown): void
}

class UserRepository implements Repository {
  save(data: unknown) {
    // implementation
  }
}
```

### ❌ Ví dụ sai

```ts
interface User {
  id: string
  name: string
}

interface ApiResponse<T> {
  data: T
}
```
