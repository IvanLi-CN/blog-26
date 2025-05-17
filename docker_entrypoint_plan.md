# Docker Entrypoint Plan

## 目标

创建一个 Docker 容器使用的入口点，实现先执行数据库迁移，然后启动程序。

## 计划

1.  **创建 `entrypoint.sh` 脚本：**
    *   在项目根目录下创建 `entrypoint.sh` 文件。
    *   在该文件中添加以下内容：

    ```bash
    #!/bin/bash
    set -e

    echo "Running database migrations..."
    bun run migrate

    echo "Starting application..."
    bun ./dist/server/entry.mjs
    ```

    *   为 `entrypoint.sh` 脚本添加可执行权限：`chmod +x entrypoint.sh`

2.  **修改 `Dockerfile`：**
    *   将 `Dockerfile` 中的 `CMD` 指令替换为以下内容：

    ```dockerfile
    COPY entrypoint.sh /entrypoint.sh
    ENTRYPOINT ["/entrypoint.sh"]
    ```

3.  **测试：**
    *   构建 Docker 镜像：`docker build -t your-image-name .`
    *   运行 Docker 容器：`docker run -it your-image-name`
    *   观察容器输出，确保数据库迁移和应用程序都成功启动。

## Mermaid 图

```mermaid
sequenceDiagram
    participant Dockerfile
    participant entrypoint.sh
    participant Database Migration
    participant Application

    Dockerfile->>entrypoint.sh: 设置入口点
    entrypoint.sh->>Database Migration: 执行数据库迁移 (bun run migrate)
    Database Migration-->>entrypoint.sh: 迁移完成
    entrypoint.sh->>Application: 启动应用程序 (bun ./dist/server/entry.mjs)
    Application-->>User: 应用程序运行
