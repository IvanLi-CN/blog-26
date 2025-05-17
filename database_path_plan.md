# 增加数据库路径环境变量计划

## 1. 确定环境变量名称

确定用于存储数据库文件路径的环境变量名称，例如 `DB_PATH`。

## 2. 修改 `src/lib/db.ts`

*   读取环境变量 `DB_PATH` 的值。
*   如果环境变量存在，则使用环境变量的值作为数据库路径。
*   如果环境变量不存在，则使用默认路径 `${PWD}/sqlite.db`。**解释：** `src/lib/db.ts` 文件位于 `src/lib/` 目录下，而 `sqlite.db` 文件位于项目根目录下。因此，从 `src/lib/db.ts` 文件访问 `sqlite.db` 文件，需要使用 `${PWD}/sqlite.db` 这个路径，其中 `PWD` 表示当前工作目录。
*   如果环境变量是相对路径，则使用 `path.resolve(process.env.PWD, DB_PATH)` 解析为绝对路径。

## 3. 修改 `drizzle.config.ts`

*   读取环境变量 `DB_PATH` 的值。
*   如果环境变量存在，则使用环境变量的值作为数据库路径。
*   如果环境变量不存在，则使用默认路径 `./sqlite.db`。

## 4. 添加环境变量到 `.env` 文件（如果需要）

如果项目中有 `.env` 文件，则将 `DB_PATH` 添加到该文件中。

## 5. 构建过程优化

*   在构建过程中，将 `sqlite.db` 文件复制到 `src/lib/` 目录下，或者使用绝对路径。
*   更新 `drizzle.config.ts` 文件中的数据库路径，使其指向构建后的数据库文件。

## 6. 测试

测试代码，确保环境变量能够正确设置数据库路径，并且相对路径能够正确解析。

## Mermaid 图

```mermaid
graph LR
    A[开始] --> B{定义环境变量 DB_PATH};
    B --> C{修改 src/lib/db.ts};
    C --> D{读取 DB_PATH};
    D --> E{环境变量是否存在？};
    E -- 是 --> F{使用环境变量值作为数据库路径};
    E -- 否 --> G{使用默认路径 "${PWD}/sqlite.db"};
    G --> G1[解释：src/lib/db.ts 位于 src/lib/ 目录下，sqlite.db 位于项目根目录下，PWD 表示当前工作目录];
    G1 --> H{路径是否是相对路径？};
    F --> H;
    H -- 是 --> I{使用 path.resolve(process.env.PWD, DB_PATH) 解析为绝对路径};
    H -- 否 --> J{使用路径};
    I --> J;
    J --> K{修改 drizzle.config.ts};
    K --> L{读取 DB_PATH};
    L --> M{环境变量是否存在？};
    M -- 是 --> N{使用环境变量值作为数据库路径};
    M -- 否 --> O{使用默认路径 "./sqlite.db"};
    N --> P{添加环境变量到 .env 文件（如果需要）};
    O --> P;
    P --> Q{构建过程优化};
    Q --> Q1{复制 sqlite.db 到 src/lib/ 目录，或者使用绝对路径};
    Q1 --> Q2{更新 drizzle.config.ts 中的数据库路径};
    Q2 --> R[测试];
    R --> S[结束];
