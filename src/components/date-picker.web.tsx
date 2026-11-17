import { Label } from './ui';

function dateValue(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function fromDateValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export default function DatePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date;
  onChange: (value: Date) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Label>{label}</Label>
      <input
        aria-label={label}
        type="date"
        value={dateValue(value)}
        onChange={(event) => {
          if (event.currentTarget.value) onChange(fromDateValue(event.currentTarget.value));
        }}
        style={{
          minHeight: 52,
          boxSizing: 'border-box',
          border: '1px solid #cbd5e1',
          borderRadius: 14,
          backgroundColor: '#ffffff',
          color: '#1e293b',
          padding: '0 14px',
          fontSize: 16,
          textAlign: 'right',
          direction: 'rtl',
        }}
      />
    </div>
  );
}
