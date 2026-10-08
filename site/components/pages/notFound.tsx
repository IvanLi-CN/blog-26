import { toPublicSitePath } from "../../lib/runtime-urls";
export default function notFoundPage() {
  return (
    <section className="nature-container px-2 py-14 sm:px-6 sm:py-24">
      <div className="nature-empty mx-auto max-w-2xl">
        <h1 className="nature-title text-4xl sm:text-5xl">404</h1>
        <p className="nature-muted mt-4 text-base sm:text-lg">
          这片叶子不在这里了，试试回到首页继续逛逛吧。
        </p>
        <div className="mt-6 flex justify-center">
          <a href={toPublicSitePath("/")} className="nature-button nature-button-primary">
            返回首页
          </a>
        </div>
      </div>
    </section>
  );
}
