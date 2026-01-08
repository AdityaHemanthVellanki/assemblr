
import * as React from "react";
import { ComponentProps } from "./component-registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type HeatmapDataPoint = {
  day: string | number; // e.g., "Mon", 0
  hour: string | number; // e.g., "10am", 10
  value: number;
};

export const HeatmapComponent = ({ component, state }: ComponentProps) => {
  const bindKey = component.dataSource?.type === "state" ? component.dataSource.value : undefined;
  const rawData = bindKey ? state[bindKey] : (component.properties?.data || []);
  
  // Normalize data
  const data: HeatmapDataPoint[] = React.useMemo(() => {
    if (!Array.isArray(rawData)) return [];
    return rawData.map(d => ({
      day: d.day ?? d.x ?? 0,
      hour: d.hour ?? d.y ?? 0,
      value: Number(d.value ?? d.count ?? 0)
    }));
  }, [rawData]);

  const label = component.label || "Heatmap";
  
  // Loading state (if bindKey exists but data is undefined)
  if (bindKey && state[bindKey] === undefined) {
      return (
          <Card className="h-full min-h-[300px] animate-pulse">
              <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
              <CardContent><div className="h-[200px] bg-muted rounded-md" /></CardContent>
          </Card>
      );
  }

  // Empty state
  if (data.length === 0) {
      return (
          <Card className="h-full min-h-[300px]">
              <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-center h-[200px] text-muted-foreground">
                  No data available
              </CardContent>
          </Card>
      );
  }

  // Grid logic
  // Assuming days (Y) x hours (X) for typical contribution/activity view
  // Or generic X/Y. Let's try to infer or default to 7 days x 24 hours if data looks like it.
  // For simplicity, we'll find unique X and Y values and sort them.
  
  const xValues = Array.from(new Set(data.map(d => d.hour))).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  const yValues = Array.from(new Set(data.map(d => d.day))).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  
  const maxValue = Math.max(...data.map(d => d.value), 1);

  const getColor = (val: number) => {
      const intensity = val / maxValue;
      // Green scale similar to GitHub
      if (intensity === 0) return "bg-muted";
      if (intensity < 0.25) return "bg-green-200 dark:bg-green-900";
      if (intensity < 0.5) return "bg-green-400 dark:bg-green-700";
      if (intensity < 0.75) return "bg-green-600 dark:bg-green-500";
      return "bg-green-800 dark:bg-green-300";
  };

  return (
    <Card className="h-full overflow-auto">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1">
            {/* X Axis Labels */}
            <div className="flex gap-1 ml-16">
                {xValues.map(x => (
                    <div key={x} className="w-8 text-xs text-center text-muted-foreground truncate" title={String(x)}>
                        {x}
                    </div>
                ))}
            </div>

            {/* Rows */}
            {yValues.map(y => (
                <div key={y} className="flex gap-1 items-center">
                    {/* Y Axis Label */}
                    <div className="w-16 text-xs text-right text-muted-foreground pr-2 truncate" title={String(y)}>
                        {y}
                    </div>
                    {/* Cells */}
                    {xValues.map(x => {
                        const point = data.find(d => d.day === y && d.hour === x);
                        const val = point?.value || 0;
                        return (
                            <div 
                                key={`${y}-${x}`}
                                className={`w-8 h-8 rounded-sm transition-colors ${getColor(val)}`}
                                title={`${val} events on ${y}, ${x}`}
                            />
                        );
                    })}
                </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
};

export const validateHeatmapProps = (props: any) => {
    // Basic validation logic
    if (props.data && !Array.isArray(props.data)) {
        throw new Error("Heatmap data must be an array");
    }
};
