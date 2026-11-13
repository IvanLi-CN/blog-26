"use client";

import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import "@xyflow/react/dist/style.css";
import "./IsolapurrArchitectureFlow.css";

type FlowNodeData = {
  label: string;
  detail?: string;
  tone?: "external" | "domain" | "security" | "power";
};
type Diagram = {
  id: string;
  label: string;
  description: string;
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
};
type DiagramId = "isolation" | "power" | "control";

const node = (
  id: string,
  label: string,
  position: { x: number; y: number },
  tone: FlowNodeData["tone"],
  detail?: string
): Node<FlowNodeData> => ({
  id,
  position,
  data: { label, detail, tone },
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  type: "isola",
});

const diagrams: Diagram[] = [
  {
    id: "isolation",
    label: "电气隔离域",
    description: "上游端口与一路 USB-C 下行属于非隔离域；USB-A 与 USB-C PD 下行位于隔离域。",
    nodes: [
      node("host", "电脑 / USB Host", { x: 0, y: 160 }, "external", "外部主机"),
      node("upstream", "USB-C 上游端口", { x: 240, y: 80 }, "domain", "上游口，属于非隔离域"),
      node("local", "非隔离 USB-C 下行", { x: 240, y: 250 }, "domain", "与电脑共用电气域"),
      node("ch318", "CH318T 数据隔离", { x: 500, y: 160 }, "security", "USB 2.0 数据边界"),
      node("hub", "隔离域 Hub", { x: 760, y: 160 }, "domain", "独立参考地"),
      node("usb-a", "USB-A 下行", { x: 1010, y: 60 }, "domain", "隔离域端口"),
      node("usb-c", "USB-C PD 下行", { x: 1010, y: 250 }, "domain", "隔离域端口"),
      node("input", "DC5525 / USB-C PD 输入", { x: 760, y: 380 }, "power", "隔离域独立供电"),
    ],
    edges: [
      {
        id: "host-upstream",
        source: "host",
        target: "upstream",
        targetHandle: "target-left",
        label: "USB-C",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "upstream-local",
        source: "upstream",
        target: "local",
        sourceHandle: "source-bottom",
        targetHandle: "target-top",
        label: "同一电气域",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "upstream-ch318",
        source: "upstream",
        target: "ch318",
        label: "USB 2.0 数据",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "ch318-hub",
        source: "ch318",
        target: "hub",
        label: "隔离后数据",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "hub-a",
        source: "hub",
        target: "usb-a",
        label: "",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "hub-c",
        source: "hub",
        target: "usb-c",
        label: "",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "input-hub",
        source: "input",
        target: "hub",
        sourceHandle: "source-top",
        targetHandle: "target-bottom",
        label: "独立供电",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
    ],
  },
  {
    id: "power",
    label: "电源与端口限流",
    description: "非隔离下行由主机 VBUS 供电；隔离域由独立输入和 TPS55288 生成可调输出。",
    nodes: [
      node("host-vbus", "主机 VBUS", { x: 0, y: 150 }, "external", "5V 输入"),
      node("husb305", "HUSB305-01", { x: 250, y: 150 }, "security", "R21=330kΩ，约 1.8A 档"),
      node("local-out", "非隔离 USB-C 下行", { x: 250, y: 320 }, "domain", "与主机共用电气域"),
      node("iso-input", "DC5525 / USB-C PD", { x: 620, y: 150 }, "external", "9–28V 独立输入"),
      node("tps", "TPS55288", { x: 890, y: 150 }, "power", "3–21V，系统目标 ≤5A"),
      node(
        "iso-out",
        "隔离域下行与可调输出",
        { x: 890, y: 320 },
        "domain",
        "USB-A / USB-C PD / 香蕉插座"
      ),
    ],
    edges: [
      {
        id: "vbus-husb",
        source: "host-vbus",
        target: "husb305",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "husb-local",
        source: "husb305",
        target: "local-out",
        sourceHandle: "source-bottom",
        targetHandle: "target-top",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "input-tps",
        source: "iso-input",
        target: "tps",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "tps-output",
        source: "tps",
        target: "iso-out",
        sourceHandle: "source-bottom",
        targetHandle: "target-top",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
    ],
  },
  {
    id: "control",
    label: "控制与诊断平面",
    description: "LAN、Web Serial 和 Local USB 汇聚到统一的设备身份、能力与确认状态模型。",
    nodes: [
      node("lan", "Wi‑Fi / LAN", { x: 0, y: 40 }, "external", "局域网控制"),
      node("serial", "Web Serial", { x: 0, y: 180 }, "external", "浏览器直连"),
      node("local-usb", "Local USB", { x: 0, y: 320 }, "external", "devd / CLI"),
      node("console", "Web 控制台", { x: 280, y: 180 }, "external", "状态、端口、维护动作"),
      node(
        "model",
        "设备身份与能力模型",
        { x: 570, y: 180 },
        "domain",
        "device_id / variant / capabilities"
      ),
      node("state", "确认状态与诊断", { x: 860, y: 80 }, "security", "电源、端口、温度、过流"),
      node("hardware", "IsolaPurr 硬件", { x: 860, y: 280 }, "security", "校验后执行控制"),
    ],
    edges: [
      {
        id: "lan-console",
        source: "lan",
        target: "console",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "serial-console",
        source: "serial",
        target: "console",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "local-console",
        source: "local-usb",
        target: "console",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "console-model",
        source: "console",
        target: "model",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "model-state",
        source: "model",
        target: "state",
        label: "读取 / 合并状态",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "model-hardware",
        source: "model",
        target: "hardware",
        sourceHandle: "source-bottom",
        targetHandle: "target-top",
        label: "校验后执行",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
      {
        id: "hardware-state",
        source: "hardware",
        target: "state",
        sourceHandle: "source-top",
        targetHandle: "target-bottom",
        label: "遥测与确认结果",
        markerEnd: { type: MarkerType.ArrowClosed },
      },
    ],
  },
];

function DiagramNode({ data }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div className={`isolapurr-flow-node isolapurr-flow-node-${data.tone ?? "domain"}`}>
      <Handle type="target" position={Position.Left} id="target-left" />
      <Handle type="target" position={Position.Top} id="target-top" />
      <Handle type="target" position={Position.Bottom} id="target-bottom" />
      <Handle type="source" position={Position.Right} id="source-right" />
      <Handle type="source" position={Position.Top} id="source-top" />
      <Handle type="source" position={Position.Bottom} id="source-bottom" />
      <strong>{data.label}</strong>
      {data.detail ? <small>{data.detail}</small> : null}
    </div>
  );
}

const nodeTypes = { isola: DiagramNode };

export function IsolapurrArchitectureFlow({ diagramId }: { diagramId?: DiagramId }) {
  const [activeId, setActiveId] = useState<DiagramId>(diagramId ?? "isolation");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const active = useMemo(
    () => diagrams.find((diagram) => diagram.id === (diagramId ?? activeId)) ?? diagrams[0],
    [activeId, diagramId]
  );

  useEffect(() => {
    const readTheme = () =>
      setTheme(document.documentElement.dataset.uiTheme === "dark" ? "dark" : "light");
    readTheme();
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ui-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className={`isolapurr-flow-shell isolapurr-flow-shell-${theme}`}
      aria-label="IsolaPurr 架构图"
    >
      <header className="isolapurr-flow-header">
        <div className="isolapurr-flow-heading">
          <div className="isolapurr-flow-title-row">
            <h3>{diagramId ? active.label : "交互式架构图"}</h3>
            <span className="isolapurr-flow-hint">拖动节点 · 滚轮缩放 · 控件适配视图</span>
          </div>
          <p>{active.description}</p>
        </div>
      </header>
      {!diagramId ? (
        <div className="isolapurr-flow-tabs" role="tablist" aria-label="架构图视图">
          {diagrams.map((diagram) => (
            <button
              key={diagram.id}
              type="button"
              role="tab"
              aria-selected={active.id === diagram.id}
              className={active.id === diagram.id ? "active" : ""}
              onClick={() => setActiveId(diagram.id as DiagramId)}
            >
              {diagram.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="isolapurr-flow-canvas">
        <ReactFlow
          key={active.id}
          nodes={active.nodes}
          edges={active.edges}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          nodeTypes={nodeTypes}
          nodesDraggable
          nodesConnectable={false}
          panOnDrag
          zoomOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  );
}
