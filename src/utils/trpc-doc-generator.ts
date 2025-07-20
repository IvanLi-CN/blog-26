import type { AnyProcedure, AnyRouter } from '@trpc/server';
import { appRouter } from '~/server/router';

/**
 * 自动提取 tRPC 路由器信息的工具
 * 可以作为手动文档的补充，确保不遗漏任何 API
 */

interface ExtractedProcedure {
  path: string;
  type: 'query' | 'mutation' | 'subscription';
  hasInput: boolean;
  middlewares: string[];
}

/**
 * 从 tRPC 路由器中提取所有过程信息
 */
export function extractProceduresFromRouter(router: AnyRouter, prefix = ''): ExtractedProcedure[] {
  const procedures: ExtractedProcedure[] = [];

  // 提取当前级别的过程
  if (router._def.procedures) {
    for (const [key, value] of Object.entries(router._def.procedures)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && '_def' in value) {
        const procedure = value as AnyProcedure;
        const def = procedure._def;

        procedures.push({
          path: fullPath,
          type: (def.type || 'query') as 'query' | 'mutation' | 'subscription',
          hasInput: def.inputs && def.inputs.length > 0,
          middlewares: (def as any).middlewares?.map((m: any) => m.toString()) || [],
        });
      }
    }
  }

  // 递归处理嵌套路由器
  if (router._def.router) {
    for (const [key, value] of Object.entries(router._def.router)) {
      if (value && typeof value === 'object' && '_def' in value) {
        const nestedPath = prefix ? `${prefix}.${key}` : key;
        procedures.push(...extractProceduresFromRouter(value as AnyRouter, nestedPath));
      }
    }
  }

  return procedures;
}

/**
 * 检查手动文档是否遗漏了任何 API
 */
export function validateDocumentationCompleteness(manualDocs: Record<string, any[]>) {
  const extractedProcedures = extractProceduresFromRouter(appRouter);
  const documentedPaths = new Set<string>();

  // 收集所有已文档化的路径
  Object.values(manualDocs).forEach((category) => {
    category.forEach((proc) => {
      documentedPaths.add(proc.path);
    });
  });

  // 找出遗漏的 API
  const missingProcedures = extractedProcedures.filter((proc) => !documentedPaths.has(proc.path));

  // 找出多余的文档（可能是过时的）
  const extraDocs = Array.from(documentedPaths).filter(
    (path) => !extractedProcedures.some((proc) => proc.path === path)
  );

  return {
    total: extractedProcedures.length,
    documented: documentedPaths.size,
    missing: missingProcedures,
    extra: extraDocs,
    coverage: Math.round((documentedPaths.size / extractedProcedures.length) * 100),
  };
}

/**
 * 生成基础的文档模板
 * 可以用于快速创建新 API 的文档结构
 */
export function generateDocTemplate(procedure: ExtractedProcedure) {
  const authLevel = getAuthLevelFromMiddlewares(procedure.middlewares);
  const method = procedure.type === 'mutation' ? 'POST' : 'GET';

  return {
    path: procedure.path,
    type: procedure.type,
    method,
    auth: authLevel,
    description: `${procedure.path} 的描述`, // 需要手动填写
    input: procedure.hasInput ? '{ /* 需要定义输入参数 */ }' : null,
    output: '{ /* 需要定义返回类型 */ }', // 需要手动填写
    example: `trpc.${procedure.path}.use${procedure.type === 'mutation' ? 'Mutation' : 'Query'}()`,
  };
}

/**
 * 从中间件推断权限级别
 */
function getAuthLevelFromMiddlewares(middlewares: string[]): 'public' | 'protected' | 'admin' {
  const middlewareStr = middlewares.join(' ');

  if (middlewareStr.includes('enforceUserIsAdmin')) {
    return 'admin';
  }
  if (middlewareStr.includes('enforceUserIsAuthed')) {
    return 'protected';
  }
  return 'public';
}

/**
 * 开发时的辅助函数：打印所有提取的过程信息
 */
export function printAllProcedures() {
  const procedures = extractProceduresFromRouter(appRouter);
  console.log('=== 所有 tRPC 过程 ===');
  procedures.forEach((proc) => {
    console.log(`${proc.path} (${proc.type}) - ${getAuthLevelFromMiddlewares(proc.middlewares)}`);
  });
  console.log(`总计: ${procedures.length} 个过程`);
}

// 在开发环境中可以调用这个函数来检查
if (import.meta.env.DEV) {
  // printAllProcedures();
}
