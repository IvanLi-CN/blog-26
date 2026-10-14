import PlaybookPage from "@/components/playbook/PlaybookPage";
import type { loadplaybookDetail } from "../../lib/page-data/playbookDetail";
export default function playbookDetailPage(data: Awaited<ReturnType<typeof loadplaybookDetail>>) {
  const { edition, path, versioned } = data;

  return <PlaybookPage edition={edition} path={path} versioned={versioned} />;
}
