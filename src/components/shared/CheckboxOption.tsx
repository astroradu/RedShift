import { Icon } from '../icons/Icon';

interface CheckboxOptionProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}

export function CheckboxOption({ checked, onChange, title, description }: CheckboxOptionProps) {
  return (
    <label className="galaxy-toggle-row">
      <input
        type="checkbox"
        className="galaxy-toggle-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="galaxy-toggle-box" aria-hidden="true">
        {checked && <Icon name="check" size={11}/>}
      </span>
      <span className="galaxy-toggle-text">
        <span className="gt-title">{title}</span>
        <span className="gt-sub">{description}</span>
      </span>
    </label>
  );
}
