'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Eye, EyeOff } from '@/lib/icons'

interface PasswordInputProps {
  id: string
  label: string
  /** Optional element rendered at the right of the label row (e.g. a forgot-password link). */
  labelAction?: React.ReactNode
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  required?: boolean
  /** Field-level error, shown directly under the input. */
  error?: string | null
}

/**
 * Password field with a visible label and a show/hide toggle.
 * The toggle is a 44px target with an aria-label, presentation only:
 * it flips the input type and nothing else.
 */
export function PasswordInput({
  id,
  label,
  labelAction,
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  error,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium text-charcoal">
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="pr-12"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-neutral-500 transition-colors hover:text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AC244D]/40"
        >
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
