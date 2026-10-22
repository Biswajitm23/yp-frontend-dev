import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, PlusCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
}

/** Accent for the "add a custom entry" row — matches Autocomplete's. */
const ADD_OPTION_ACCENT = "#20BDFF";

/** Cap on a typed custom entry, mirroring Autocomplete's customAddon limit.
 *  Without it an arbitrarily long string overflows both the dropdown row and
 *  the chip it becomes. */
const DEFAULT_MAX_CUSTOM_LENGTH = 50;

interface MultiSelectDropdownProps {
  options?: Option[];
  selectedItems?: Option[];
  onChange?: (items: Option[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  maxSelections?: number | null;
  customAddon?: boolean;
  /** Optional node rendered beside the placeholder text (e.g. an info icon). */
  placeholderInfo?: React.ReactNode;
  /** Headline shown when the search matches nothing, e.g. "No skills found". */
  noResultsText?: string;
  /** Noun completing `Tap to add "X" as ___`, e.g. "custom skill". */
  addCustomLabel?: string;
  /** Max length of a typed custom entry. */
  maxCustomLength?: number;
}

const MultiSelectDropdown = ({
  options: externalOptions = [],
  selectedItems = [],
  onChange = () => {},
  placeholder = "Select items...",
  searchPlaceholder = "Search...",
  disabled = false,
  maxSelections = null,
  customAddon = false,
  placeholderInfo = null,
  noResultsText = "No results found",
  addCustomLabel = "custom entry",
  maxCustomLength = DEFAULT_MAX_CUSTOM_LENGTH,
}: MultiSelectDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // const [internalOptions, setInternalOptions] = useState(externalOptions);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const normalize = (value: string) => value.trim().toLowerCase();

  // Sync internal options with external options and merge with custom options from selectedItems
  // useEffect(() => {
  //   // Get custom options (ones that are selected but not in external options)
  //   const customOptions = selectedItems.filter(
  //     (item) => !externalOptions.some((opt) => opt.value === item.value)
  //   );

  //   // Merge external options with custom options
  //   const mergedOptions = [...externalOptions, ...customOptions];

  //   // Remove duplicates based on value
  //   const uniqueOptions = mergedOptions.filter(
  //     (option, index, self) =>
  //       index === self.findIndex((t) => t.value === option.value)
  //   );

  //   setInternalOptions(uniqueOptions);
  // }, [externalOptions, selectedItems]);

  // const filteredOptions = internalOptions.filter((option) =>
  //   option.label.toLowerCase().includes(searchTerm.toLowerCase()),
  // );

  const filteredOptions = externalOptions.filter((option) =>
    normalize(option.label).includes(normalize(searchTerm)),
  );

  // const canAddCustom =
  //   customAddon &&
  //   searchTerm.trim().length > 0 &&
  //   !internalOptions.some(
  //     (opt) => opt.label.toLowerCase() === searchTerm.trim().toLowerCase(),
  //   );

  const canAddCustom =
    customAddon &&
    searchTerm.trim().length > 0 &&
    !selectedItems.some(
      (item) => normalize(item.label) === normalize(searchTerm),
    ) &&
    !externalOptions.some(
      (opt) => normalize(opt.label) === normalize(searchTerm),
    );

  // const handleAddCustom = () => {
  //   const value = searchTerm.trim();
  //   if (!value) return;

  //   if (maxSelections && selectedItems.length >= maxSelections) return;

  //   const newOption: Option = {
  //     value: value, // Using the trimmed value as the unique identifier
  //     label: value,
  //   };

  //   // Add to selectedItems
  //   const updatedItems = [...selectedItems, newOption];
  //   onChange(updatedItems);
  //   setSearchTerm("");
  // };

  const handleAddCustom = () => {
    const trimmed = searchTerm.trim();
    if (!trimmed) return;

    if (maxSelections && selectedItems.length >= maxSelections) return;

    const alreadyExists =
      selectedItems.some(
        (item) => normalize(item.label) === normalize(trimmed),
      ) ||
      externalOptions.some(
        (opt) => normalize(opt.label) === normalize(trimmed),
      );

    if (alreadyExists) {
      setSearchTerm("");
      return;
    }

    const newOption: Option = {
      value: trimmed,
      label: trimmed,
    };

    const updatedItems = [...selectedItems, newOption];
    onChange(updatedItems);
    setSearchTerm("");
  };

  const handleSelect = (option: Option) => {
    const exists = selectedItems.some((item) => item.value === option.value);

    if (exists) {
      const updatedItems = selectedItems.filter(
        (item) => item.value !== option.value,
      );
      onChange(updatedItems);
    } else {
      if (maxSelections && selectedItems.length >= maxSelections) return;
      const updatedItems = [...selectedItems, option];
      onChange(updatedItems);
    }

    setSearchTerm("");
  };

  const handleRemove = (value: string) => {
    const updatedItems = selectedItems.filter((item) => item.value !== value);
    onChange(updatedItems);
  };

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
      if (!isOpen) {
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="w-full relative">
      <div
        className={cn(
          "min-h-10 px-3 py-2 border rounded-lg bg-white cursor-pointer flex items-center justify-between gap-2 transition-colors multi-dropdown",
          disabled
            ? "bg-gray-100 cursor-not-allowed opacity-60"
            : "hover:border-gray-400",
        )}
        onClick={handleToggle}
      >
        {/* min-w-0 lets this flex child shrink below its content width, so a
            long chip label can ellipsis instead of pushing the field wider. */}
        <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
          {selectedItems.length === 0 ? (
            <span className="text-[#a0aec0] text-[16px] inline-flex items-center gap-2">
              {placeholder}
              {placeholderInfo && (
                <span
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center"
                >
                  {placeholderInfo}
                </span>
              )}
            </span>
          ) : (
            selectedItems.map((item) => (
              <span
                key={item.value}
                className={cn(
                  "text-sm px-2 py-1 rounded-full flex items-center gap-1 max-w-full min-w-0 multi-select-dropdown-chip",
                )}
              >
                <span className="truncate" title={item.label}>
                  {item.label}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(item.value);
                  }}
                  className="text-gray-400 hover:text-gray-600 rounded-full p-0.5 transition-colors cursor-pointer shrink-0"
                  aria-label={`Remove ${item.label}`}
                >
                  <X size={14} />
                </button>
              </span>
            ))
          )}
        </div>
        <ChevronDown
          size={20}
          className={cn(
            "text-[#A0AEC0] shrink-0 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </div>

      {isOpen && (
        <div
          className={cn(
            "absolute z-10 w-full bottom-full mb-1 bg-white border border-gray-300 rounded-lg shadow-lg dropdowm-select-bg",
          )}
        >
          <div className="p-2 border-b border-gray-200 ">
            <input
              ref={searchInputRef}
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => {
                // Hard cap typed custom entries — an unbounded string overflows
                // the add-row below and the chip it turns into.
                if (customAddon && e.target.value.length > maxCustomLength)
                  return;
                setSearchTerm(e.target.value);
              }}
              className={cn(
                "w-full px-3 py-2 border border-gray-300 rounded-md h-[34px] multi-select-search-input",
              )}
            />

            {customAddon && searchTerm.length > 0 && (
              <p
                className={cn(
                  "text-xs mt-1 text-right",
                  searchTerm.length > maxCustomLength - 5
                    ? "text-red-400"
                    : "text-gray-400",
                )}
              >
                {searchTerm.length}/{maxCustomLength}
              </p>
            )}
          </div>

          <ul className="max-h-[180px] overflow-y-auto multi-select-dropdown-main">
            {filteredOptions.length === 0 && !canAddCustom ? (
              <li className="px-3 py-2 text-gray-500 text-sm">
                {searchTerm ? noResultsText : "No options available"}
              </li>
            ) : (
              filteredOptions.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => handleSelect(option)}
                    className={cn(
                      "w-full text-left px-3 py-2 transition-colors truncate",
                      selectedItems.some((item) => item.value === option.value)
                        ? "bg-[#356FEE] text-white hover:bg-[#356FEE] dark:bg-[#146d9c] dark:hover:bg-[#146d9c]"
                        : "hover:bg-blue-50",
                    )}
                  >
                    {option.label}
                  </button>
                </li>
              ))
            )}

            {/* Custom entry row — same two-line treatment as the Location
                autocomplete: circled "+", headline, then the hint. */}
            {canAddCustom && (
              <li>
                <button
                  type="button"
                  onClick={handleAddCustom}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[#e0f2fe] dark:hover:bg-[#FFFFFF1A]",
                    filteredOptions.length > 0 &&
                      "border-t border-gray-200 dark:border-white/10",
                  )}
                >
                  <PlusCircle
                    className="w-6 h-6 shrink-0"
                    strokeWidth={1.5}
                    color={ADD_OPTION_ACCENT}
                  />
                  <span className="flex flex-col min-w-0">
                    <span
                      className="text-[15px] font-medium leading-snug truncate"
                      style={{ color: ADD_OPTION_ACCENT }}
                    >
                      {filteredOptions.length > 0
                        ? `Add “${searchTerm}”`
                        : noResultsText}
                    </span>
                    <span className="text-[13px] leading-snug text-gray-500 dark:text-white/70 truncate">
                      Tap to add “{searchTerm}” as {addCustomLabel}
                    </span>
                  </span>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default MultiSelectDropdown;
