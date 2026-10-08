import { type ComponentType, lazy, Suspense } from "react";

const modules = import.meta.glob<{ default: ComponentType }>("../content/projects/*.mdx", {
  query: "?public-react-mdx",
});
const bodies = Object.fromEntries(
  Object.entries(modules).map(([path, load]) => [path, lazy(load)])
);

/** The same route-specific MDX module renders on the server and in the browser. */
export default function ProjectBody({ slug }: { slug: string }) {
  const Body = bodies[`../content/projects/${slug}.mdx`];
  return Body ? (
    <Suspense
      fallback={
        <p role="status" data-public-body-pending>
          正在加载正文…
        </p>
      }
    >
      <Body />
    </Suspense>
  ) : null;
}
