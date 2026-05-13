import { Icon } from '../icons/Icon';
import { PanelHeader } from '../shared/PanelHeader';
import type { Tool } from '../../types';
import { STRINGS } from '../../lib/strings';

interface ToolPlaceholderProps {
  tool: Tool;
}

export function ToolPlaceholder({ tool }: ToolPlaceholderProps) {
  return (
    <>
      <PanelHeader
        title={tool.label}
        subtitle={STRINGS.TOOL_PLACEHOLDER.subtitle(tool.label)}
        capitalize
      />
      <div className="empty-tool">
        <div style={{ width: 64, height: 64, border: '1px solid var(--hairline-strong)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
          <Icon name={tool.icon} size={28}/>
        </div>
        <div className="et-title">{tool.label}</div>
        <div className="et-sub">{STRINGS.TOOL_PLACEHOLDER.bodyBefore(tool.label)}<span className="kbd">{STRINGS.TOOL_PLACEHOLDER.KBD_V}</span>{STRINGS.TOOL_PLACEHOLDER.bodyAfter}</div>
      </div>
    </>
  );
}
