import PageLayout from "@/components/common/PageLayout";
import Icon from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

export default function TagsIndexPage() {
  return (
    <PageLayout>
      <section className="px-3 sm:px-4 md:px-6 py-6 md:py-8 mx-auto max-w-4xl">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="tabler:tag" className="w-6 h-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold">标签</h1>
        </div>
        <p className="text-base-content/70">标签索引页尚在完善中。后续会展示热门标签与标签云。</p>
      </section>
    </PageLayout>
  );
}
