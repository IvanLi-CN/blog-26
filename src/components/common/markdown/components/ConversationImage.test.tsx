import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  externalImages,
  imageResourceCases,
} from "../../../../../tests/fixtures/assistant-markdown";
import type { ConversationImageProps } from "../../conversation/types";
import { ConversationImage } from "./ConversationImage";

if (!GlobalRegistrator.isRegistered)
  GlobalRegistrator.register({ url: "https://chat.example.invalid/private/conversation" });

const sources = [...externalImages.message.content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(
  (match) => match[1]!
);
const props: ConversationImageProps = {
  ...externalImages.message,
  src: sources[0]!,
  alt: "外部图片 A",
};
afterEach(cleanup);

function expectNoImageEntry(container: HTMLElement) {
  expect(
    container.querySelector(
      "img, source, picture, iframe, video, object, embed, link, [src], [srcset], [style]"
    )
  ).toBeNull();
}

describe("ConversationImage request gate (component DOM, not browser network acceptance)", () => {
  test("does not fetch or probe waiting images imperatively", () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        () => {
          throw new Error("Unexpected image probe");
        },
        { preconnect: () => {} }
      )
    );
    try {
      const view = render(<ConversationImage {...props} />);
      expectNoImageEntry(view.container);
      view.rerender(<ConversationImage {...props} src={sources[1]!} />);
      expectNoImageEntry(view.container);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
  test("SSR and initial mount expose alt/domain and explicit actions without a resource entry", () => {
    const html = renderToStaticMarkup(<ConversationImage {...props} />);
    expect(html).not.toMatch(/<img|srcset=|\ssrc=|rel="preload|rel="preconnect|rel="prefetch/);
    const view = render(<ConversationImage {...props} />);
    expectNoImageEntry(view.container);
    expect(view.getByText(props.alt)).toBeTruthy();
    expect(view.getByText("images.example.invalid")).toBeTruthy();
    const link = view.getByRole("link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(props.src);
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");
    // Suppress navigation in this DOM test; opening a link never grants embedded-load consent.
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expectNoImageEntry(view.container);
    expect(view.getByRole("button").textContent).toBe("加载图片");
  });

  test("click creates only the selected exact URL, never a sibling or another presentation", () => {
    const view = render(
      <>
        <ConversationImage {...props} />
        <ConversationImage {...props} src={sources[1]!} alt="外部图片 B" />
        <ConversationImage {...props} presentationId="drawer" />
      </>
    );
    expectNoImageEntry(view.container);
    fireEvent.click(view.getAllByRole("button")[0]!);
    const images = view.container.querySelectorAll("img");
    expect(images.length).toBe(1);
    expect(images[0]!.getAttribute("src")).toBe(props.src);
    expect(images[0]!.hasAttribute("srcset")).toBe(false);
    expect(images[0]!.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(view.getAllByRole("button").length).toBe(2);
    fireEvent.load(images[0]!);
    expect(view.getByText("图片已加载")).toBeTruthy();
    expect(view.container.querySelectorAll("img").length).toBe(1);
    expect(view.getAllByText(props.alt).length).toBe(2);
  });

  test("every exact URL, query, hash, message and presentation change resets consent, including A→B→A", () => {
    const view = render(<ConversationImage {...props} />);
    for (const next of [
      { ...props, src: sources[1]! },
      props,
      { ...props, src: `${props.src}&other=2` },
      { ...props, src: `${props.src}#detail` },
      { ...props, messageId: "other-message" },
      { ...props, presentationId: "other-presentation" },
    ]) {
      fireEvent.click(view.getByRole("button"));
      expect(view.container.querySelectorAll("img").length).toBe(1);
      view.rerender(<ConversationImage {...next} />);
      expectNoImageEntry(view.container);
      expect(view.getByRole("button").textContent).toBe("加载图片");
    }
  });

  test("failure preserves readable alt and requires explicit retry of the same URL", () => {
    const view = render(<ConversationImage {...props} src={sources[2]!} />);
    fireEvent.click(view.getByRole("button"));
    const first = view.container.querySelector("img")!;
    fireEvent.error(first);
    expectNoImageEntry(view.container);
    expect(view.getByText(props.alt)).toBeTruthy();
    expect(view.getByRole("status").textContent).toContain("图片加载失败");
    fireEvent.click(view.getByRole("button", { name: "重试加载图片" }));
    const retry = view.container.querySelector("img")!;
    expect(retry).not.toBe(first);
    expect(retry.getAttribute("src")).toBe(sources[2]!);
    fireEvent.load(retry);
    expect(view.getByRole("status").textContent).toBe("图片已加载");
  });

  test("uses trusted facade bindings and removes image access immediately when context is revoked", () => {
    const authorized = imageResourceCases[0]!;
    const view = render(<ConversationImage {...authorized.input} />);
    expect(view.container.querySelector("img")!.getAttribute("src")).toBe(
      authorized.expectedResolution
    );
    expect(view.queryByRole("button")).toBeNull();
    fireEvent.error(view.container.querySelector("img")!);
    expect(view.getByRole("button").textContent).toBe("重试加载图片");
    view.rerender(<ConversationImage {...authorized.input} resourceContext={undefined} />);
    expectNoImageEntry(view.container);
    expect(view.getByRole("status").textContent).toContain("缺少已授权资源上下文");
    for (const fixture of imageResourceCases.slice(1)) {
      view.rerender(<ConversationImage {...fixture.input} />);
      expectNoImageEntry(view.container);
      expect(view.queryByRole("button")).toBeNull();
    }
  });

  test("never infers same-origin authorization or trusts unsafe resolver output", () => {
    const view = render(
      <ConversationImage {...props} src="https://chat.example.invalid/api/files/private.png" />
    );
    expectNoImageEntry(view.container);
    expect(view.getByRole("button").textContent).toBe("加载图片");
    const resolver = mock(() => ({ src: "/safe.png" }));
    for (const src of [
      "javascript:alert(1)",
      "data:image/png;base64,AAA",
      "https://u:p@images.example.invalid/a.png",
      "//images.example.invalid/a.png",
    ]) {
      view.rerender(
        <ConversationImage
          {...props}
          src={src}
          resourceContext={{ resolveAuthorizedImage: resolver }}
        />
      );
      expectNoImageEntry(view.container);
      expect(view.queryByRole("link")).toBeNull();
    }
    expect(resolver).not.toHaveBeenCalled();
    view.rerender(
      <ConversationImage
        {...props}
        resourceContext={{ resolveAuthorizedImage: () => ({ src: "javascript:alert(1)" }) }}
      />
    );
    expectNoImageEntry(view.container);
    expect(view.getByRole("status").textContent).toContain("不安全");
  });

  test("resolver exceptions are local and do not prevent adjacent content or another image", () => {
    const view = render(
      <>
        <ConversationImage
          {...props}
          resourceContext={{
            resolveAuthorizedImage: () => {
              throw new Error("denied");
            },
          }}
        />
        <p>图片之外的说明始终可读。</p>
        <ConversationImage {...props} src={sources[1]!} />
      </>
    );
    expect(view.getByText("图片之外的说明始终可读。")).toBeTruthy();
    expectNoImageEntry(view.container);
    expect(view.getAllByRole("button").length).toBe(1);
    fireEvent.click(view.getByRole("button"));
    expect(view.container.querySelector("img")!.getAttribute("src")).toBe(sources[1]!);
  });
});
