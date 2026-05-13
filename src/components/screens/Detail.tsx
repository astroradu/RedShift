import { useState, useEffect } from 'react';
import { Sidebar } from '../layout/Sidebar';
import { ConstellationPlanner } from '../features/planner/ConstellationPlanner';
import { GalaxyPlanner } from '../features/planner/GalaxyPlanner';
import { Documentation } from '../features/docs/Documentation';
import { ToolPlaceholder } from '../features/ToolPlaceholder';
import { useApiQuery } from '../../hooks/useApiQuery';
import type { Feature, Tool } from '../../types';

interface ToolsResponse { tools: Tool[]; default_tool_id: string }

interface DetailProps {
  feature: Feature;
}

export function Detail({ feature }: DetailProps) {
  const { data } = useApiQuery<ToolsResponse>(`/api/tools/${encodeURIComponent(feature.id)}`, [feature.id]);
  const tools = data?.tools ?? [];
  const defaultToolId = data?.default_tool_id ?? 'select';
  const [tool, setTool] = useState<string>(defaultToolId);

  useEffect(() => {
    setTool(defaultToolId);
  }, [feature.id, defaultToolId]);

  if (tools.length === 0) {
    return <div className="detail fade-enter fade-in" />;
  }

  const activeTool = tools.find(t => t.id === tool) ?? tools[0];

  return (
    <div className="detail fade-enter fade-in">
      <Sidebar active={tool} setActive={setTool} tools={tools}/>
      <main className="main">
        {tool === '__docs' ? (
          <Documentation feature={feature}/>
        ) : feature.id === 'planner' && tool === 'constellation' ? (
          <ConstellationPlanner feature={feature}/>
        ) : feature.id === 'planner' && tool === 'galaxy' ? (
          <GalaxyPlanner feature={feature}/>
        ) : (
          <ToolPlaceholder tool={activeTool}/>
        )}
      </main>
    </div>
  );
}
