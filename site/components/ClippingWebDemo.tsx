import { useEffect, useState } from "react";
import { ClippingDetail as ProductionClippingDetail } from "@/components/memos/ClippingDetail";
import { createClippingWebDemoModel } from "@/lib/clipping-web-demo";
import {
  getDefaultWebDemoState,
  getWebDemoState,
  recordWebDemoMutation,
  WEB_DEMO_ACTION_EVENT,
  WEB_DEMO_STATE_EVENT,
  type WebDemoActionDetail,
  type WebDemoState,
} from "@/lib/web-demo-runtime";

/** Only a runtime adapter: the official route, heading and reader remain production components. */
export function ClippingDetail(props: Parameters<typeof ProductionClippingDetail>[0]) {
  const [model] = useState(() =>
    createClippingWebDemoModel(
      getDefaultWebDemoState(`/memos/${props.slug}`),
      recordWebDemoMutation
    )
  );
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const sync = (state: WebDemoState) => {
      model.setState(state);
      setRevision((current) => current + 1);
    };
    const stateChanged = (event: Event) => {
      const next = (event as CustomEvent<{ state: WebDemoState }>).detail?.state;
      if (next) sync(next);
    };
    const locationChanged = () => sync(getWebDemoState(window.location, "public"));
    const action = (event: Event) => {
      const detail = (event as CustomEvent<WebDemoActionDetail>).detail;
      if (detail?.action === "reset-state") model.reset(getWebDemoState(window.location, "public"));
      if (detail?.action === "simulate-save") model.simulateSave();
      if (
        detail?.action === "reset-state" ||
        detail?.action === "refresh-data" ||
        detail?.action === "simulate-save"
      )
        locationChanged();
    };
    locationChanged();
    window.addEventListener(WEB_DEMO_STATE_EVENT, stateChanged);
    window.addEventListener(WEB_DEMO_ACTION_EVENT, action);
    window.addEventListener("popstate", locationChanged);
    return () => {
      window.removeEventListener(WEB_DEMO_STATE_EVENT, stateChanged);
      window.removeEventListener(WEB_DEMO_ACTION_EVENT, action);
      window.removeEventListener("popstate", locationChanged);
    };
  }, [model]);
  const article = model.getArticle();
  return (
    <ProductionClippingDetail
      {...props}
      key={revision}
      live
      transport={model.transport}
      initialArticle={article}
      initialCanDiscuss={Boolean(article.canDiscuss)}
    />
  );
}
