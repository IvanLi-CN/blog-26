"use client";

import { useRouter } from "next/navigation";
import { useTopLoader } from "nextjs-toploader";

/**
 * 进度条演示组件
 *
 * 展示如何使用 nextjs-toploader 的高级功能：
 * 1. 编程式控制进度条
 * 2. 手动设置进度
 * 3. 与路由导航结合使用
 */
export default function ProgressBarDemo() {
  const loader = useTopLoader();
  const router = useRouter();

  // 手动控制进度条
  const handleStart = () => {
    loader.start();
  };

  const handleSetProgress = (progress: number) => {
    loader.setProgress(progress);
  };

  const handleFinish = () => {
    loader.done();
  };

  // 模拟异步操作的进度条
  const handleAsyncOperation = async () => {
    loader.start();

    try {
      // 模拟步骤1
      loader.setProgress(0.2);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 模拟步骤2
      loader.setProgress(0.5);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 模拟步骤3
      loader.setProgress(0.8);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 完成
      loader.done();
      alert("异步操作完成！");
    } catch (_error) {
      loader.done();
      alert("操作失败！");
    }
  };

  // 带进度条的页面导航
  const handleNavigateWithProgress = (url: string) => {
    loader.start();
    router.push(url);
    // 注意：路由切换完成后，nextjs-toploader 会自动调用 done()
  };

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">🚀 进度条功能演示</h2>
        <p className="text-base-content/70">这个组件展示了如何使用 nextjs-toploader 的高级功能</p>

        <div className="divider">基础控制</div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={handleStart}>
            开始进度条
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleSetProgress(0.3)}
          >
            设置30%
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleSetProgress(0.6)}
          >
            设置60%
          </button>

          <button type="button" className="btn btn-success btn-sm" onClick={handleFinish}>
            完成进度条
          </button>
        </div>

        <div className="divider">高级功能</div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-accent btn-sm" onClick={handleAsyncOperation}>
            模拟异步操作
          </button>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => handleNavigateWithProgress("/posts")}
          >
            导航到文章页
          </button>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => handleNavigateWithProgress("/memos")}
          >
            导航到闪念页
          </button>
        </div>

        <div className="alert alert-info mt-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            className="stroke-current shrink-0 w-6 h-6"
          >
            <title>信息图标</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
          <div>
            <h3 className="font-bold">提示</h3>
            <div className="text-xs">
              进度条会自动在路由切换时显示。你也可以使用上面的按钮手动控制进度条的行为。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
