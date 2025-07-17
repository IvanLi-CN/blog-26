import type { VectorizationProgress } from '~/lib/vectorizer';

export interface Task {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: VectorizationProgress;
  createdAt: number;
  updatedAt: number;
}

const tasks = new Map<string, Task>();

const TASK_TTL = 1000 * 60 * 30; // 30 minutes

function cleanupOldTasks() {
  const now = Date.now();
  for (const [id, task] of tasks.entries()) {
    if (now - task.updatedAt > TASK_TTL) {
      tasks.delete(id);
    }
  }
}

setInterval(cleanupOldTasks, 1000 * 60 * 5); // Clean up every 5 minutes

export const taskManager = {
  create(id: string): Task {
    const task: Task = {
      id,
      status: 'pending',
      progress: {
        stage: 'info',
        message: '任务已创建，等待开始...',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    tasks.set(id, task);
    return task;
  },

  update(id: string, status: Task['status'], progress: VectorizationProgress): Task | undefined {
    const task = tasks.get(id);
    if (task) {
      task.status = status;
      task.progress = progress;
      task.updatedAt = Date.now();
      return task;
    }
    return undefined;
  },

  get(id: string): Task | undefined {
    return tasks.get(id);
  },

  remove(id: string): boolean {
    return tasks.delete(id);
  },
};
