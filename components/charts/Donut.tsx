"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { TipCard } from "./shared";

export interface Slice {
  name: string;
  value: number;
  color: string;
  detail?: string;
}

/** True while rendering for a static export (slides): charts draw in their final state, without animation. */
export const StaticCharts = createContext(false);

export function Donut({ data, size = 200, center, thickness = 26 }: { data: Slice[]; size?: number; center?: ReactNode; thickness?: number }) {
  const still = useContext(StaticCharts);
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie isAnimationActive={!still} data={data} dataKey="value" nameKey="name" innerRadius={size / 2 - thickness} outerRadius={size / 2 - 2} paddingAngle={2} startAngle={90} endAngle={-270} stroke="none" cornerRadius={6} animationDuration={700}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Slice;
              return <TipCard title={p.name} rows={[{ label: "Share", value: `${((p.value / total) * 100).toFixed(1)}%`, color: p.color }, ...(p.detail ? [{ label: "Volume", value: p.detail }] : [])]} />;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {center && <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">{center}</div>}
    </div>
  );
}
