export type VectorizationStatus = 'Correct' | 'Mismatch' | 'NotVectorized';

export interface VectorizationInfo {
  status: VectorizationStatus;
  details: string;
}

/**
 * 获取文章的向量化状态
 * 在SSG构建时返回默认状态，在运行时通过客户端JavaScript动态加载
 * @param _slug 文章的 slug (未使用，保留用于兼容性)
 * @returns 向量化状态信息
 */
export async function getVectorizationStatus(_slug: string): Promise<VectorizationInfo> {
  // 在SSG构建时，返回默认的未向量化状态
  // 实际的向量化状态将通过客户端JavaScript动态加载
  return {
    status: 'NotVectorized',
    details: '未向量化',
  };
}
