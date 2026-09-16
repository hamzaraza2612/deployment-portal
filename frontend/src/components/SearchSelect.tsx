import { useEffect, useRef, useState } from "react";

interface SearchSelectProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * A search-as-you-type picker that renders its own dropdown list instead of relying on the
 * browser's native <datalist> popup — that popup's rendering is inconsistent across browsers,
 * zoom levels, and multi-monitor/external-display setups, to the point of sometimes not
 * appearing at all. This renders as plain DOM, so it behaves the same everywhere.
 */
export function SearchSelect({ options, value, onChange, placeholder, disabled }: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = value
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase()))
    : options;

  function selectOption(opt: string) {
    onChange(opt);
    setOpen(false);
  }

  return (
    <div className="search-select" ref={containerRef}>
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <div className="search-select-list">
          {filtered.slice(0, 300).map((opt) => (
            <div key={opt} className="search-select-option" onMouseDown={() => selectOption(opt)}>
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
