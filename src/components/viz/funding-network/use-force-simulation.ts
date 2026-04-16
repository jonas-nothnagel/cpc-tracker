import { useEffect, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
} from "d3-force";
import type { NetworkNode, NetworkLink } from "./use-cluster-network-data";

// Cluster anchors arranged in a ring so each funding-source cluster has a
// "home" region. Nodes are pulled toward their cluster anchor AND toward
// aligned neighbors — alignment becomes proximity within/between clusters.
function computeClusterAnchors(
  clusterIds: string[],
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const anchors = new Map<string, { x: number; y: number }>();
  const n = clusterIds.length;
  if (n === 0) return anchors;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.38;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    anchors.set(clusterIds[i], {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  }
  return anchors;
}

interface UseForceSimulationProps {
  nodes: NetworkNode[];
  links: NetworkLink[];
  clusterTargets: Map<string, NetworkNode[]>;
  width: number;
  height: number;
}

export function useForceSimulation({
  nodes,
  links,
  clusterTargets,
  width,
  height,
}: UseForceSimulationProps) {
  const simRef = useRef<Simulation<NetworkNode, SimulationLinkDatum<NetworkNode>> | null>(null);
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (width === 0 || height === 0 || nodes.length === 0) return;

    const clusterIds = [...clusterTargets.keys()];
    const anchors = computeClusterAnchors(clusterIds, width, height);

    // Seed each node near its cluster anchor so the first frame doesn't show
    // every node piled at (0,0) before forces kick in.
    for (const [clusterId, group] of clusterTargets) {
      const anchor = anchors.get(clusterId);
      if (!anchor) continue;
      for (let i = 0; i < group.length; i++) {
        const a = (i / group.length) * 2 * Math.PI;
        const r = 10 + Math.random() * 25;
        group[i].x = anchor.x + Math.cos(a) * r;
        group[i].y = anchor.y + Math.sin(a) * r;
        group[i].vx = 0;
        group[i].vy = 0;
      }
    }

    interface SimLink extends SimulationLinkDatum<NetworkNode> {
      alignStrength: number;
    }
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const simLinks: SimLink[] = [];
    for (const l of links) {
      const src = nodeById.get(l.source);
      const tgt = nodeById.get(l.target);
      if (src && tgt) {
        simLinks.push({ source: src, target: tgt, alignStrength: l.strength });
      }
    }

    // Hybrid simulation:
    //   - link force: aligned targets attract → alignment becomes proximity
    //   - cluster force (forceX/Y): nodes pulled toward funding-source anchor
    //   - charge: mild repulsion to prevent overlap
    // Cluster force dominates so funding groups stay distinct.
    const sim = forceSimulation(nodes)
      .force(
        "link",
        forceLink<NetworkNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((l) => 120 - l.alignStrength * 80)
          .strength((l) => 0.005 + l.alignStrength * 0.012),
      )
      .force(
        "clusterX",
        forceX<NetworkNode>(
          (d) => anchors.get(d.clusterId)?.x ?? width / 2,
        ).strength(0.25),
      )
      .force(
        "clusterY",
        forceY<NetworkNode>(
          (d) => anchors.get(d.clusterId)?.y ?? height / 2,
        ).strength(0.25),
      )
      .force("charge", forceManyBody().strength(-30))
      .force("center", forceCenter(width / 2, height / 2).strength(0.008))
      .force("collide", forceCollide<NetworkNode>((d) => d.radius + 2.5).strength(0.8))
      .alphaDecay(0.018)
      .velocityDecay(0.35);

    let frame = 0;
    sim.on("tick", () => {
      for (const n of nodes) {
        n.x = Math.max(n.radius + 5, Math.min(width - n.radius - 5, n.x));
        n.y = Math.max(n.radius + 5, Math.min(height - n.radius - 5, n.y));
      }
      frame++;
      if (frame % 3 === 0) setTick((t) => t + 1);
    });

    sim.on("end", () => {
      setSettled(true);
      setTick((t) => t + 1);
    });

    simRef.current = sim;

    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [nodes, links, clusterTargets, width, height]);

  return { tick, settled };
}
