"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

/* ---------- Types ---------- */
interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectDropdownProps {
  name: string;
  value: string;
  onChange: (e: { target: { name: string; value: string } }) => void;
  options: SelectOption[];
  placeholder?: string;
}

/* Gap between the field and the panel. */
const MARGIN = 8;
/* Tallest the panel ever gets; beyond this it scrolls. */
const MAX_HEIGHT = 280;
/* Floor for very short viewports — better a small scrollable panel than one
   collapsed to nothing. */
const MIN_HEIGHT = 120;

/* ---------- Component ---------- */
export default function CustomSelectDropdown({
  name,
  value,
  onChange,
  options,
  placeholder = "Select",
}: CustomSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] =
    useState<React.CSSProperties>({});

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  /* ---------- Close on outside click ---------- */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ---------- Measure & position (AUTO) BEFORE paint ----------
   * The panel is portalled to <body>, so it must be `position: fixed`:
   * getBoundingClientRect() is viewport-relative, but `absolute` resolves
   * against the document, which offset the panel by the scroll distance and
   * left it floating far from its field on a scrolled page.
   *
   * Placement prefers below the field, flips above when it doesn't fit, and
   * when neither side fits takes the roomier one — capping maxHeight to that
   * gap so the panel always stays attached to the field.
   */
  useLayoutEffect(() => {
    if (!isOpen) return;

    const position = () => {
      const button = buttonRef.current;
      const dropdown = dropdownRef.current;
      if (!button || !dropdown) return;

      const rect = button.getBoundingClientRect();
      // scrollHeight is the full content height, unaffected by the maxHeight a
      // previous pass may have applied.
      const naturalHeight = Math.min(dropdown.scrollHeight, MAX_HEIGHT);

      const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
      const spaceAbove = rect.top - MARGIN;

      const openBelow =
        naturalHeight <= spaceBelow || spaceBelow >= spaceAbove;
      const height = Math.max(
        MIN_HEIGHT,
        Math.min(naturalHeight, openBelow ? spaceBelow : spaceAbove)
      );

      setDropdownStyle({
        position: "fixed",
        top: openBelow ? rect.bottom + MARGIN : rect.top - height - MARGIN,
        left: rect.left,
        width: rect.width,
        maxHeight: height,
        zIndex: 9999,
      });
    };

    position();

    // Keep it pinned to the field while the page moves. `true` captures scroll
    // on any ancestor, not just the window.
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [isOpen]);

  const toggleDropdown = () => {
    // Seed the geometry before the panel mounts so the first measuring pass
    // wraps its text at the final width.
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + MARGIN,
        left: rect.left,
        width: rect.width,
        maxHeight: MAX_HEIGHT,
        zIndex: 9999,
      });
    }
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (value: string) => {
    onChange({ target: { name, value } });
    setIsOpen(false);
  };

  const selectedLabel =
    options.find((o) => o.value === value)?.label || placeholder;

  /* ---------- Portal Dropdown ---------- */
  const dropdown =
    isOpen &&
    createPortal(
      <div
        ref={dropdownRef}
        style={dropdownStyle}
        /* Position and maxHeight both come from dropdownStyle — a stray
           `absolute` / `max-h` class here would override the measured values. */
        className="dropdowm-select-bg overflow-auto"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSelect(option.value)}
            className={`w-full text-left p-2.5 text-base text-white
              hover:bg-[#e0f2fe] dark:hover:bg-[#146d9c]
              ${
                value === option.value
                  ? "bg-[#e0f2fe] dark:bg-[#146d9c] text-white"
                  : "text-[#A0AEC0]"
              }

            `}
          >
            {option.label}
          </button>
        ))}
      </div>,
      document.body
    );

  /* ---------- Render ---------- */
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleDropdown}
        className="custom-select-btn group w-full flex items-center justify-between text-base"
      >
        <span className={value ? "text-white" : "text-[#A0AEC0]"} style={{lineHeight: "12px"}}>
          {selectedLabel}
        </span>
        <ChevronDown
          className={`w-5 h-5 transition-all duration-200 text-[#A0AEC0] group-hover:text-white ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {dropdown}
    </>
  );
}
