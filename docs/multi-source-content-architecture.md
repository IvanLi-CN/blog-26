# 多源内容数据源架构设计文档

## 1. 需求分析

### 1.1 背景

当前项目已实现本地文件系统和WebDAV两种内容数据源，但存在以下问题：

- 缺乏统一的抽象接口，代码耦合度高
- 扩展新数据源需要修改多处代码
- 不同数据源的操作逻辑分散在不同文件中
- 没有统一的多源管理和冲突解决机制

### 1.2 目标

1. **统一接口**：抽象出通用的内容数据源接口
2. **易于扩展**：支持轻松添加新的数据源类型
3. **多源管理**：统一管理多个数据源，支持优先级和策略配置
4. **向后兼容**：保持现有API的兼容性
5. **性能优化**：支持缓存、批量操作等性能优化

### 1.3 功能需求

#### 1.3.1 核心操作需求

- **内容读取**：获取单个内容、列表、索引、搜索
- **内容写入**：创建、更新、删除内容
- **文件管理**：上传、下载、重命名、移动文件
- **目录管理**：创建、删除、列出目录
- **缓存同步**：智能缓存刷新和变更检测

#### 1.3.2 数据源类型

- **本地文件系统**：基于本地文件的内容管理
- **WebDAV**：远程WebDAV服务器的内容管理
- **扩展支持**：Git、数据库等其他数据源

#### 1.3.3 多源策略

- **读取策略**：优先级、合并、第一可用
- **写入策略**：指定数据源或默认可写数据源
- **冲突解决**：基于优先级、手动解决、智能合并

## 2. 概要设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    应用层 (tRPC/Pages)                      │
├─────────────────────────────────────────────────────────────┤
│                 多源内容管理器                               │
│  ┌─────────────────┬─────────────────┬─────────────────┐    │
│  │   读取策略      │   写入策略      │   冲突解决      │    │
│  └─────────────────┴─────────────────┴─────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│                    数据源工厂                               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┬─────────────────┬─────────────────┐    │
│  │ 本地文件系统    │   WebDAV数据源  │  未来扩展数据源  │    │
│  │   数据源        │                 │                 │    │
│  └─────────────────┴─────────────────┴─────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│                   内容缓存层                                │
│                 (SQLite数据库)                              │
├─────────────────────────────────────────────────────────────┤
│                   配置管理                                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件

#### 2.2.1 ContentDataSource 接口

定义所有数据源必须实现的统一接口，包括读取、写入、管理等操作。

#### 2.2.2 MultiSourceContentManager 类

多源内容管理器，负责：

- 管理多个数据源实例
- 实现读写策略
- 处理冲突解决
- 提供统一的API接口

#### 2.2.3 ContentSourceFactory 工厂类

负责根据配置创建不同类型的数据源实例。

#### 2.2.4 具体数据源实现

- LocalFileSystemDataSource：本地文件系统实现
- WebDAVDataSource：WebDAV远程存储实现

### 2.3 数据流程

```
请求 → 多源管理器 → 策略选择 → 数据源操作 → 缓存更新 → 响应
```

## 3. 详细设计

### 3.1 核心接口定义

#### 3.1.1 ContentDataSource 接口

```typescript
interface ContentDataSource {
  // 基本属性
  readonly name: string;
  readonly type: DataSourceType;
  readonly priority: number;
  readonly capabilities: ContentSourceCapabilities;
  
  // 生命周期
  initialize(): Promise<void>;
  isAvailable(): Promise<boolean>;
  dispose?(): Promise<void>;
  
  // 内容读取
  getContent(id: string): Promise<ContentItem | null>;
  getContentBySlug(slug: string, type?: ContentType): Promise<ContentItem | null>;
  listContent(options?: ListContentOptions): Promise<ContentItem[]>;
  getContentIndex(): Promise<ContentIndex[]>;
  
  // 内容写入（可选）
  createContent?(input: CreateContentInput): Promise<ContentItem>;
  updateContent?(id: string, input: UpdateContentInput): Promise<ContentItem>;
  deleteContent?(id: string): Promise<void>;
  
  // 文件操作（可选）
  uploadFile?(path: string, content: Buffer | string): Promise<string>;
  downloadFile?(path: string): Promise<Buffer>;
  renameFile?(oldPath: string, newPath: string): Promise<void>;
  
  // 目录操作（可选）
  createDirectory?(path: string): Promise<void>;
  deleteDirectory?(path: string): Promise<void>;
  listDirectories?(path?: string): Promise<DirectoryInfo[]>;
  
  // 批量操作（可选）
  batchCreateContent?(inputs: CreateContentInput[]): Promise<ContentItem[]>;
  batchUpdateContent?(updates: BatchUpdateInput[]): Promise<ContentItem[]>;
  batchDeleteContent?(ids: string[]): Promise<void>;
  
  // 搜索功能（可选）
  searchContent?(query: string, options?: SearchOptions): Promise<ContentItem[]>;
  
  // 缓存和同步
  refreshIndex?(): Promise<void>;
  getLastModified?(id: string): Promise<Date | null>;
  checkChanges?(since?: Date): Promise<ChangeInfo[]>;
}
```

#### 3.1.2 能力标识接口

```typescript
interface ContentSourceCapabilities {
  read: boolean;              // 支持读取
  write: boolean;             // 支持写入
  delete: boolean;            // 支持删除
  createDirectory: boolean;   // 支持创建目录
  uploadFile: boolean;        // 支持文件上传
  downloadFile: boolean;      // 支持文件下载
  renameFile: boolean;        // 支持文件重命名
  batchOperations: boolean;   // 支持批量操作
  search: boolean;            // 支持搜索
  watch: boolean;             // 支持文件监听
  etag: boolean;              // 支持ETag
  versioning: boolean;        // 支持版本控制
}
```

#### 3.1.3 配置接口

```typescript
interface DataSourceConfig {
  name: string;
  type: DataSourceType;
  enabled: boolean;
  priority: number;
  config: Record<string, any>;
  capabilities?: Partial<ContentSourceCapabilities>;
}

interface MultiSourceConfig {
  dataSources: DataSourceConfig[];
  strategies: {
    read: 'priority' | 'merge' | 'first-available';
    write: string; // 指定默认写入数据源名称
    conflict: 'priority' | 'manual' | 'merge';
  };
  cache: {
    enabled: boolean;
    ttl: number;
    refreshInterval: number;
  };
}
```

### 3.2 多源管理器设计

#### 3.2.1 MultiSourceContentManager 类

```typescript
class MultiSourceContentManager {
  private dataSources: Map<string, ContentDataSource> = new Map();
  private config: MultiSourceConfig;
  private cache: ContentCache;
  
  constructor(config: MultiSourceConfig) {
    this.config = config;
    this.cache = new ContentCache(config.cache);
  }
  
  // 数据源管理
  async registerDataSource(source: ContentDataSource): Promise<void> {
    await source.initialize();
    this.dataSources.set(source.name, source);
  }
  
  unregisterDataSource(name: string): void {
    const source = this.dataSources.get(name);
    if (source?.dispose) {
      source.dispose();
    }
    this.dataSources.delete(name);
  }
  
  // 读取操作 - 实现策略模式
  async getContent(id: string): Promise<ContentItem | null> {
    switch (this.config.strategies.read) {
      case 'priority':
        return this.getContentByPriority(id);
      case 'merge':
        return this.getContentByMerge(id);
      case 'first-available':
        return this.getContentFirstAvailable(id);
      default:
        throw new Error(`Unknown read strategy: ${this.config.strategies.read}`);
    }
  }
  
  async listContent(options?: ListContentOptions): Promise<ContentItem[]> {
    const results: ContentItem[] = [];
    const seenIds = new Set<string>();
    
    // 按优先级获取内容
    const sortedSources = this.getSortedDataSources();
    for (const source of sortedSources) {
      if (source.capabilities.read) {
        const items = await source.listContent(options);
        for (const item of items) {
          if (!seenIds.has(item.id)) {
            results.push(item);
            seenIds.add(item.id);
          }
        }
      }
    }
    
    return results;
  }
  
  // 写入操作
  async createContent(input: CreateContentInput, targetSource?: string): Promise<ContentItem> {
    const source = this.getWritableDataSource(targetSource);
    if (!source.createContent) {
      throw new Error(`Data source ${source.name} does not support content creation`);
    }
    
    const result = await source.createContent(input);
    
    // 触发缓存刷新
    this.cache.invalidate();
    
    return result;
  }
  
  async updateContent(id: string, input: UpdateContentInput): Promise<ContentItem> {
    // 找到包含该内容的数据源
    const source = await this.findContentSource(id);
    if (!source?.updateContent) {
      throw new Error(`Cannot update content ${id}: source not found or not writable`);
    }
    
    const result = await source.updateContent(id, input);
    
    // 触发缓存刷新
    this.cache.invalidate();
    
    return result;
  }
  
  // 同步操作
  async syncContent(options?: SyncOptions): Promise<SyncResult> {
    const results: SyncResult = {
      updated: 0,
      created: 0,
      deleted: 0,
      errors: []
    };
    
    for (const source of this.dataSources.values()) {
      try {
        if (source.refreshIndex) {
          await source.refreshIndex();
        }
        
        if (source.checkChanges) {
          const changes = await source.checkChanges(options?.since);
          // 处理变更...
        }
      } catch (error) {
        results.errors.push({
          source: source.name,
          error: error.message
        });
      }
    }
    
    return results;
  }
  
  // 私有辅助方法
  private getSortedDataSources(): ContentDataSource[] {
    return Array.from(this.dataSources.values())
      .sort((a, b) => a.priority - b.priority);
  }
  
  private getWritableDataSource(targetSource?: string): ContentDataSource {
    if (targetSource) {
      const source = this.dataSources.get(targetSource);
      if (!source) {
        throw new Error(`Data source ${targetSource} not found`);
      }
      if (!source.capabilities.write) {
        throw new Error(`Data source ${targetSource} is not writable`);
      }
      return source;
    }
    
    // 使用默认写入数据源
    const defaultSource = this.dataSources.get(this.config.strategies.write);
    if (!defaultSource) {
      throw new Error(`Default write data source ${this.config.strategies.write} not found`);
    }
    
    return defaultSource;
  }
  
  private async findContentSource(id: string): Promise<ContentDataSource | null> {
    for (const source of this.getSortedDataSources()) {
      if (source.capabilities.read) {
        const content = await source.getContent(id);
        if (content) {
          return source;
        }
      }
    }
    return null;
  }
}
```

### 3.3 工厂模式设计

#### 3.3.1 ContentSourceFactory 类

```typescript
class ContentSourceFactory {
  private static readonly sourceTypes = new Map<DataSourceType, typeof ContentDataSource>();
  
  static registerSourceType(type: DataSourceType, sourceClass: typeof ContentDataSource): void {
    this.sourceTypes.set(type, sourceClass);
  }
  
  static async createDataSource(config: DataSourceConfig): Promise<ContentDataSource> {
    const SourceClass = this.sourceTypes.get(config.type);
    if (!SourceClass) {
      throw new Error(`Unsupported data source type: ${config.type}`);
    }
    
    const source = new SourceClass(config);
    return source;
  }
  
  static async createMultiSourceManager(config: MultiSourceConfig): Promise<MultiSourceContentManager> {
    const manager = new MultiSourceContentManager(config);
    
    // 按优先级排序并初始化数据源
    const sortedConfigs = config.dataSources
      .filter(c => c.enabled)
      .sort((a, b) => a.priority - b.priority);
    
    for (const sourceConfig of sortedConfigs) {
      try {
        const source = await this.createDataSource(sourceConfig);
        await manager.registerDataSource(source);
        console.log(`✅ 已注册数据源: ${source.name} (${source.type})`);
      } catch (error) {
        console.warn(`⚠️ 数据源初始化失败: ${sourceConfig.name}`, error);
        if (sourceConfig.required) {
          throw error;
        }
      }
    }
    
    return manager;
  }
}

// 注册内置数据源类型
ContentSourceFactory.registerSourceType('local', LocalFileSystemDataSource);
ContentSourceFactory.registerSourceType('webdav', WebDAVDataSource);
```

### 3.4 具体数据源实现

#### 3.4.1 抽象基类

```typescript
abstract class BaseContentDataSource implements ContentDataSource {
  readonly name: string;
  readonly type: DataSourceType;
  readonly priority: number;
  readonly capabilities: ContentSourceCapabilities;
  
  protected config: DataSourceConfig;
  protected initialized: boolean = false;
  
  constructor(config: DataSourceConfig) {
    this.config = config;
    this.name = config.name;
    this.type = config.type;
    this.priority = config.priority;
    this.capabilities = this.getDefaultCapabilities();
  }
  
  abstract initialize(): Promise<void>;
  abstract isAvailable(): Promise<boolean>;
  abstract getContent(id: string): Promise<ContentItem | null>;
  abstract listContent(options?: ListContentOptions): Promise<ContentItem[]>;
  abstract getContentIndex(): Promise<ContentIndex[]>;
  
  protected abstract getDefaultCapabilities(): ContentSourceCapabilities;
  
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`Data source ${this.name} is not initialized`);
    }
  }
  
  protected validateCapability(capability: keyof ContentSourceCapabilities): void {
    if (!this.capabilities[capability]) {
      throw new Error(`Data source ${this.name} does not support ${capability}`);
    }
  }
}
```

#### 3.4.2 WebDAV数据源实现

```typescript
class WebDAVDataSource extends BaseContentDataSource {
  private client: WebDAVClient;
  
  protected getDefaultCapabilities(): ContentSourceCapabilities {
    return {
      read: true,
      write: true,
      delete: true,
      createDirectory: true,
      uploadFile: true,
      downloadFile: true,
      renameFile: true,
      batchOperations: false,
      search: false,
      watch: false,
      etag: true,
      versioning: false,
    };
  }
  
  async initialize(): Promise<void> {
    this.client = new WebDAVClient(this.config.config);
    await this.client.initialize();
    this.initialized = true;
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      return await this.client.testConnection();
    } catch {
      return false;
    }
  }
  
  async getContent(id: string): Promise<ContentItem | null> {
    this.ensureInitialized();
    // 实现WebDAV内容获取逻辑
    // 复用现有的WebDAVClient逻辑
  }
  
  async createContent(input: CreateContentInput): Promise<ContentItem> {
    this.validateCapability('write');
    this.ensureInitialized();
    // 实现WebDAV内容创建逻辑
  }
  
  // ... 其他方法实现
}
```

#### 3.4.3 本地文件系统数据源实现

```typescript
class LocalFileSystemDataSource extends BaseContentDataSource {
  private basePath: string;
  private watcher?: FSWatcher;
  
  protected getDefaultCapabilities(): ContentSourceCapabilities {
    return {
      read: true,
      write: true,
      delete: true,
      createDirectory: true,
      uploadFile: true,
      downloadFile: true,
      renameFile: true,
      batchOperations: true,
      search: true,
      watch: true,
      etag: false,
      versioning: false,
    };
  }
  
  async initialize(): Promise<void> {
    this.basePath = this.config.config.basePath || './src/content';
    
    // 设置文件监听（如果支持）
    if (this.config.config.watchChanges && this.capabilities.watch) {
      this.setupFileWatcher();
    }
    
    this.initialized = true;
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      await fs.access(this.basePath);
      return true;
    } catch {
      return false;
    }
  }
  
  // ... 其他方法实现
}
```

## 4. 配置管理

### 4.1 配置文件结构

```yaml
# config.yaml
content:
  dataSources:
    - name: "local"
      type: "local"
      enabled: true
      priority: 1
      required: false
      config:
        basePath: "./src/content"
        watchChanges: true
        includePatterns: ["**/*.md", "**/*.mdx"]
        excludePatterns: ["**/.*", "**/_*"]
    
    - name: "webdav-primary"
      type: "webdav"
      enabled: true
      priority: 2
      required: false
      config:
        url: "${WEBDAV_URL}"
        username: "${WEBDAV_USERNAME}"
        password: "${WEBDAV_PASSWORD}"
        projectsPath: "/projects"
        memosPath: "/Memos"
        excludePaths: ["/.git", "/.vscode"]
        timeout: 30000
        retryAttempts: 3
  
  strategies:
    read: "priority"      # priority | merge | first-available
    write: "webdav-primary" # 指定默认写入数据源
    conflict: "priority"  # priority | manual | merge
  
  cache:
    enabled: true
    ttl: 600000          # 10分钟
    refreshInterval: 600000 # 10分钟
    maxSize: 1000        # 最大缓存项数
```

### 4.2 环境变量配置

```typescript
const envSchema = z.object({
  // 现有配置...
  
  // 多源配置
  CONTENT_READ_STRATEGY: z.enum(['priority', 'merge', 'first-available']).default('priority'),
  CONTENT_WRITE_SOURCE: z.string().default('webdav-primary'),
  CONTENT_CONFLICT_STRATEGY: z.enum(['priority', 'manual', 'merge']).default('priority'),
  
  // 缓存配置
  CONTENT_CACHE_ENABLED: z.boolean().default(true),
  CONTENT_CACHE_TTL: z.coerce.number().default(600000),
  CONTENT_CACHE_REFRESH_INTERVAL: z.coerce.number().default(600000),
});
```

## 5. 实施计划

### 5.1 第一阶段：核心接口和抽象层

- [ ] 定义核心接口和类型
- [ ] 实现抽象基类
- [ ] 创建工厂类和多源管理器
- [ ] 编写单元测试

### 5.2 第二阶段：现有实现重构

- [ ] 将现有WebDAV逻辑重构为WebDAVDataSource
- [ ] 将本地文件系统逻辑重构为LocalFileSystemDataSource
- [ ] 保持现有API兼容性
- [ ] 集成测试

### 5.3 第三阶段：集成和迁移

- [ ] 更新配置系统
- [ ] 逐步迁移现有调用代码
- [ ] 更新缓存系统以支持多源
- [ ] 性能测试和优化

### 5.4 第四阶段：增强功能

- [ ] 实现内容同步机制
- [ ] 添加冲突解决策略
- [ ] 支持实时监听和更新
- [ ] 添加监控和日志

## 6. 风险评估

### 6.1 技术风险

- **性能影响**：多源查询可能影响性能
- **数据一致性**：多源间数据同步复杂
- **错误处理**：需要处理各种数据源故障

### 6.2 迁移风险

- **API兼容性**：需要保持现有API不变
- **数据迁移**：现有数据需要平滑迁移
- **测试覆盖**：需要全面的测试覆盖

### 6.3 缓解措施

- 分阶段实施，逐步迁移
- 保持向后兼容性
- 完善的错误处理和降级机制
- 全面的测试和监控

## 7. 总结

本设计提供了一个完整的多源内容数据源架构，具有以下优势：

1. **统一接口**：通过抽象接口统一不同数据源的操作
2. **灵活配置**：支持多种读写策略和冲突解决机制
3. **易于扩展**：新增数据源只需实现接口即可
4. **性能优化**：支持缓存、批量操作等优化
5. **向后兼容**：保持现有API的兼容性

该架构为项目的长期发展提供了坚实的基础，支持未来添加更多类型的数据源和功能扩展。
