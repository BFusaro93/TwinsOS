"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatPhoneNumber } from "@/lib/utils/phone";

interface PhoneInputProps extends Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, ...props }, ref) => {
    return (
      <Input
        {...props}
        ref={ref}
        type="tel"
        value={value}
        onChange={(e) => onChange(formatPhoneNumber(e.target.value))}
      />
    );
  }
);
PhoneInput.displayName = "PhoneInput";
