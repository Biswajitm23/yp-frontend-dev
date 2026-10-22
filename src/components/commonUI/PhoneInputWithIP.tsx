
"use client";

import React, { useState } from "react";
import PhoneInput from "react-phone-number-input";
// import "react-phone-number-input/style.css";
import { isValidPhoneNumber, parsePhoneNumber } from "libphonenumber-js";

// True when the value holds only a country calling code and no national digits.
export const isCallingCodeOnly = (phoneValue: string): boolean => {
  try {
    const parsed = parsePhoneNumber(phoneValue);
    if (parsed) return parsed.nationalNumber.length === 0;
  } catch {
    // parsePhoneNumber throws for "+91"-style inputs that are too short to parse
  }
  // Fallback: "+" followed by at most 3 digits is just a calling code
  return /^\+\d{0,3}$/.test(phoneValue.replace(/\s/g, ""));
};

interface PhoneInputWithIPProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  clearError?: () => void;
  onValidationChange?: (isValid: boolean) => void;
  onBlur?: () => void;
  placeholder?: string;
}

export default function PhoneInputWithIP({
  value,
  onChange,
  disabled = false,
  error,
  clearError,
  onValidationChange,
  onBlur,
  placeholder = "Mobile number (optional)",
}: PhoneInputWithIPProps) {
  // Default country is fixed to GB. When a value is pre-filled the underlying
  // PhoneInput component honors the value's country prefix automatically;
  // defaultCountry / country only kick in when the input is empty.
  const defaultCountry = "GB";
  const [selectedCountry, setSelectedCountry] = useState<string>("GB");
  const [validationError, setValidationError] = useState<string>("");

  // Validate phone number using libphonenumber-js
  const validatePhoneNumber = (phoneValue: string): string => {
    if (!phoneValue) {
      return ""; // Optional field
    }

    // After switching country the library resets the value to just the new
    // calling code (e.g. "+91"). Treat that as "nothing typed yet" so we don't
    // show an error before the user has entered any digits.
    if (isCallingCodeOnly(phoneValue)) {
      return "";
    }

    try {
      // Validate phone number format and length for all countries
      if (!isValidPhoneNumber(phoneValue)) {
        return "Please enter a valid phone number";
      }

      return ""; // Valid
    } catch (err) {
      return "Please enter a valid phone number";
    }
  };

  // Handle change
  const handleChange = (v: string | undefined) => {
    const newValue = v || "";
    onChange(newValue);

    // Validate
    const validationMsg = validatePhoneNumber(newValue);
    setValidationError(validationMsg);

    // Notify parent component if validation state changed
    if (onValidationChange) {
      onValidationChange(!validationMsg && newValue.length > 0);
    }

    // Clear external error
    if (clearError) clearError();
  };

  // Handle country change
  const handleCountryChange = (country: string | undefined) => {
    const newCountry = country || "GB";
    setSelectedCountry(newCountry);

    // Re-validate current phone number with new country
    if (value) {
      const validationMsg = validatePhoneNumber(value);
      setValidationError(validationMsg);

      if (onValidationChange) {
        onValidationChange(!validationMsg);
      }
    }
  };

  const displayError = error || validationError;

  return (
    <>
      <PhoneInput
        international
        defaultCountry={defaultCountry as any}
        country={selectedCountry as any}
        onCountryChange={handleCountryChange}
        countryCallingCodeEditable={false}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete="tel"
        onKeyDown={(e: React.KeyboardEvent) => {
          const digitsOnly = value.replace(/\D/g, "");
          const allowedKeys = [
            "Backspace",
            "Delete",
            "ArrowLeft",
            "ArrowRight",
            "Tab",
          ];

          // Limit input to 15 digits max
          if (
            digitsOnly.length >= 15 &&
            !allowedKeys.includes(e.key) &&
            /^\d$/.test(e.key)
          ) {
            e.preventDefault();
          }
        }}
      />

      {displayError && (
        <p className="error-message">{displayError}</p>
      )}
    </>
  );
}