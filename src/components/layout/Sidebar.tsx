import { Icon } from '../icons/Icon';
import type { Tool } from '../../types';
import { STRINGS } from '../../lib/strings';

interface SidebarProps {
  active: string;
  setActive: (id: string) => void;
  tools: Tool[];
}

export function Sidebar({ active, setActive, tools }: SidebarProps) {
  const exportTool = tools.find(t => t.id === 'export');
  const mainTools  = tools.filter(t => t.id !== 'export');

  return (
    <aside className="sidebar">
      {mainTools.map(t => (
        <button
          key={t.id}
          className={'tool-btn' + (active === t.id ? ' active' : '')}
          onClick={() => setActive(t.id)}
          aria-label={t.label}
        >
          <Icon name={t.icon} size={18}/>
          <span className="tip">{t.label}</span>
        </button>
      ))}
      {exportTool && (
        <>
          <div className="sidebar-divider"/>
          <button
            className={'tool-btn' + (active === 'export' ? ' active' : '')}
            onClick={() => setActive('export')}
            aria-label={STRINGS.SIDEBAR.EXPORT_ARIA}
          >
            <Icon name="export" size={18}/>
            <span className="tip">{STRINGS.SIDEBAR.EXPORT}</span>
          </button>
        </>
      )}
      <div className="sidebar-foot">
        <button
          className={'tool-btn' + (active === '__docs' ? ' active' : '')}
          onClick={() => setActive('__docs')}
          aria-label={STRINGS.SIDEBAR.DOCS_ARIA}
        >
          <Icon name="info" size={18}/>
          <span className="tip">{STRINGS.SIDEBAR.DOCS}</span>
        </button>
      </div>
    </aside>
  );
}
