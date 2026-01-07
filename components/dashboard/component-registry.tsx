"use client";

import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Types
import { DashboardSpec } from "@/lib/spec/dashboardSpec";

export type ComponentProps = {
  component: any; // Using any for component schema temporarily
  state: Record<string, any>;
  onEvent: (eventName: string, args?: any) => void;
  renderChildren?: (children: any[]) => React.ReactNode;
};

// 1. Component Implementation
const ButtonComponent = ({ component, onEvent }: ComponentProps) => {
  return (
    <Button 
      onClick={() => onEvent("onClick")}
      disabled={component.properties?.disabled}
      className={component.properties?.className}
    >
      {component.label || "Button"}
    </Button>
  );
};

const TextComponent = ({ component, state }: ComponentProps) => {
  let content = String(component.properties?.content || component.label || "");
  // Resolve bindings {{state.foo}}
  content = content.replace(/{{(.*?)}}/g, (_, key) => {
    const val = state[key.trim()];
    return val !== undefined ? String(val) : "";
  });

  return (
    <div className="prose dark:prose-invert">
      {content}
    </div>
  );
};

const InputComponent = ({ component, state, onEvent }: ComponentProps) => {
  const bindKey = component.dataSource?.type === "state" ? component.dataSource.value : undefined;
  const value = bindKey ? state[bindKey] || "" : "";

  return (
    <div className="space-y-2">
      {component.label && <label className="text-sm font-medium">{component.label}</label>}
      <Input
        placeholder={component.properties?.placeholder}
        value={value}
        onChange={(e) => onEvent("onChange", { value: e.target.value, bindKey })}
      />
    </div>
  );
};

const SelectComponent = ({ component, state, onEvent }: ComponentProps) => {
  const bindKey = component.dataSource?.type === "state" ? component.dataSource.value : undefined;
  const value = bindKey ? state[bindKey] || "" : undefined;
  const options = component.properties?.options || [];

  return (
    <div className="space-y-2">
      {component.label && <label className="text-sm font-medium">{component.label}</label>}
      <Select 
        value={value} 
        onValueChange={(val: string) => onEvent("onChange", { value: val, bindKey })}
      >
        <SelectTrigger>
          <SelectValue placeholder={component.properties?.placeholder || "Select option"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt: any) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

const TableComponent = ({ component, state }: ComponentProps) => {
  const bindKey = component.dataSource?.type === "state" ? component.dataSource.value : undefined;
  const data = bindKey ? state[bindKey] : [];
  const rows = Array.isArray(data) ? data : [];

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium">{component.label || "Table"}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[400px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {rows.length > 0 ? (
                  Object.keys(rows[0]).slice(0, 6).map((key) => (
                    <TableHead key={key}>{key}</TableHead>
                  ))
                ) : (
                  <TableHead>Data</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? (
                rows.slice(0, 50).map((row: any, i: number) => (
                  <TableRow key={i}>
                    {Object.keys(row).slice(0, 6).map((key) => (
                      <TableCell key={key}>
                        {typeof row[key] === "object" ? JSON.stringify(row[key]) : String(row[key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                    No data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

const ContainerComponent = ({ component, renderChildren }: ComponentProps) => {
  return (
    <div className={`grid gap-4 ${component.layoutMode === 'stack' ? 'flex flex-col' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'}`}>
      {renderChildren && renderChildren(component.children || [])}
    </div>
  );
};

// 2. Registry Definition
export const COMPONENT_REGISTRY: Record<string, React.FC<ComponentProps>> = {
  button: ButtonComponent,
  text: TextComponent,
  input: InputComponent,
  select: SelectComponent,
  table: TableComponent,
  container: ContainerComponent,
  form: ContainerComponent, // Map form to container for now
  modal: ContainerComponent, // Map modal to container for now
  status: TextComponent, // Map status to text for now
  // Fallback for older types mapping to new components
  metric: TextComponent, 
  chart: TextComponent, // Placeholder
};

export function getComponent(type: string) {
  const Comp = COMPONENT_REGISTRY[type.toLowerCase()];
  if (!Comp) {
    throw new Error(`Component type "${type}" is not registered in COMPONENT_REGISTRY`);
  }
  return Comp;
}
