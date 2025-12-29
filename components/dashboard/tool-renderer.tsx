"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DashboardSpec } from "@/lib/spec/dashboardSpec";

// Deterministic mock data generator
function getMockData(table: string) {
  const seed = table.length;
  return Array.from({ length: 7 }).map((_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - i));
    return {
      date: day.toLocaleDateString("en-US", { weekday: "short" }),
      value: Math.floor(Math.abs(Math.sin(i + seed) * 100)) + 10,
      amount: Math.floor(Math.abs(Math.cos(i + seed) * 5000)) + 1000,
      users: Math.floor(Math.abs(Math.sin(i * 2 + seed) * 50)) + 5,
    };
  });
}

interface ToolRendererProps {
  spec: DashboardSpec;
}

export function ToolRenderer({ spec }: ToolRendererProps) {
  if (!spec) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No tool specification found. Start chatting to build one.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-muted/5 p-6">
      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{spec.title}</h1>
        {spec.description && (
          <p className="text-muted-foreground">{spec.description}</p>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {spec.views
          .filter((v) => v.type === "metric")
          .map((view) => {
            const metric = spec.metrics.find((m) => m.id === view.metricId);
            if (!metric) return null;
            return (
              <Card key={view.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {metric.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {metric.type === "count" ? "1,234" : "$45,231.89"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    +20.1% from last month
                  </p>
                </CardContent>
              </Card>
            );
          })}
      </div>

      {/* Charts & Tables */}
      <div className="grid gap-4 md:grid-cols-2">
        {spec.views
          .filter((v) => v.type !== "metric")
          .map((view) => {
            const metric = spec.metrics.find((m) => m.id === view.metricId);
            const data = getMockData(view.table || metric?.table || "default");

            if (view.type === "table") {
              return (
                <Card key={view.id} className="col-span-2">
                  <CardHeader>
                    <CardTitle>Data: {view.table}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Users</TableHead>
                          <TableHead>Revenue</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell>{row.date}</TableCell>
                            <TableCell>{row.users}</TableCell>
                            <TableCell>${row.amount}</TableCell>
                            <TableCell>Active</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            }

            if (!metric) return null;

            return (
              <Card key={view.id} className="col-span-1">
                <CardHeader>
                  <CardTitle>{metric.label}</CardTitle>
                </CardHeader>
                <CardContent className="pl-2">
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      {view.type === "bar_chart" ? (
                        <BarChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="date"
                            stroke="#888888"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="#888888"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `$${value}`}
                          />
                          <Tooltip />
                          <Bar
                            dataKey={metric.type === "sum" ? "amount" : "value"}
                            fill="currentColor"
                            radius={[4, 4, 0, 0]}
                            className="fill-primary"
                          />
                        </BarChart>
                      ) : (
                        <LineChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="date"
                            stroke="#888888"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="#888888"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `$${value}`}
                          />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey={metric.type === "sum" ? "amount" : "value"}
                            stroke="currentColor"
                            strokeWidth={2}
                            dot={false}
                            className="stroke-primary"
                          />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}
