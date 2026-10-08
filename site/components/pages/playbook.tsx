import PlaybookPage from "@/components/playbook/PlaybookPage";
import type { loadplaybook } from "../../lib/page-data/playbook";
export default function playbookPage(data: Awaited<ReturnType<typeof loadplaybook>>) {
  const { edition } = data;

  return <PlaybookPage edition={edition} path="" />;
}
