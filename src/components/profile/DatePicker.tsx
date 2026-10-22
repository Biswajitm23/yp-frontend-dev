"use client"

import * as React from "react"
import { format, parse } from "date-fns"
import { CalendarIcon, X } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface DatePickerProps {
  value?: Date | string
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  minDate?: Date
  maxDate?: Date
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled = false,
  className,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(() => {
    if (!value) return undefined
    
    if (value instanceof Date) return value
    
    // Handle string format: DD-MM-YYYY
    if (typeof value === "string" && value.trim()) {
      try {
        const parsed = parse(value, "dd-MM-yyyy", new Date())
        // Validate the parsed date
        if (!isNaN(parsed.getTime())) {
          return parsed
        }
      } catch (e) {
        console.error("Error parsing date:", e)
      }
    }
    
    return undefined
  })

  React.useEffect(() => {
    if (value) {
      let parsedDate: Date | undefined
      
      if (value instanceof Date) {
        parsedDate = value
      } else if (typeof value === "string" && value.trim()) {
        try {
          parsedDate = parse(value, "dd-MM-yyyy", new Date())
          if (isNaN(parsedDate.getTime())) {
            parsedDate = undefined
          }
        } catch (e) {
          console.error("Error parsing date string:", value, e)
          parsedDate = undefined
        }
      }
      
      setDate(parsedDate)
    } else {
      setDate(undefined)
    }
  }, [value])

  const handleDateChange = (newDate: Date | undefined) => {
    setDate(newDate)
    onChange?.(newDate)
  }

  const isDateDisabled = (testDate: Date) => {
    if (minDate && testDate < minDate) return true
    if (maxDate && testDate > maxDate) return true
    return false
  }

  // Bound the year dropdown to a sensible range. When a maxDate is supplied
  // (e.g. DOB's 14-years-ago cap), the range ends there and spans 100 years
  // back, so the year <select> covers every realistic birth year.
  const today = new Date()
  const endBound = maxDate ?? new Date(today.getFullYear() + 10, 11, 31)
  const startBound = minDate ?? new Date(endBound.getFullYear() - 100, 0, 1)

  return (
    <Popover>
      <div className="relative w-full">
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal h-12 rounded-full px-6",
              "bg-[#f9fafb] border-[#d1d5db] dark:bg-[#ffffff0d] dark:border-[#ffffff3b]",
              "text-[#1a1a2e] dark:text-white",
              !date && "text-[#6b7280] dark:text-[#a0aec0]",
              disabled && "opacity-50 cursor-not-allowed",
              // Reserve room on the right for the clear button.
              date && !disabled && "pr-12",
              className
            )}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">
              {date ? format(date, "dd-MM-yyyy") : placeholder}
            </span>
          </Button>
        </PopoverTrigger>

        {/* Clear button — sits above the trigger so clicking it erases the date
            instead of opening the calendar. Shown only when a date is set. */}
        {date && !disabled && (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => handleDateChange(undefined)}
            className={cn(
              "absolute right-3 top-1/2 z-10 -translate-y-1/2",
              "flex h-6 w-6 items-center justify-center rounded-full",
              "text-[#6b7280] transition-colors dark:text-[#a0aec0]",
              "hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-white/10 dark:hover:text-white"
            )}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <PopoverContent
        className={cn(
          "w-auto p-0",
          "bg-white border-gray-200 dark:bg-black dark:border-gray-700",
          "shadow-2xl"
        )}
        align="start"
      >
        <div className="bg-white dark:bg-black profile-navbar rounded-lg overflow-hidden">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={date}
            onSelect={handleDateChange}
            disabled={isDateDisabled}
            autoFocus
            defaultMonth={date ?? maxDate ?? new Date()}
            startMonth={startBound}
            endMonth={endBound}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}