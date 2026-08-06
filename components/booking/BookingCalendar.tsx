'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface BookingCalendarProps {
  onDateSelect: (date: Date) => void
  selectedDate?: Date
  availableSlots?: string[]
}

export function BookingCalendar({ onDateSelect, selectedDate, availableSlots = [] }: BookingCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selected, setSelected] = useState<Date | undefined>(selectedDate)

  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0
  ).getDate()

  const firstDayOfMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1
  ).getDay()

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const handleDateClick = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    setSelected(date)
    onDateSelect(date)
  }

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-charcoal">
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={handlePrevMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-500" />
          </button>
          <button
            onClick={handleNextMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Day Names */}
      <div className="grid grid-cols-7 gap-1 mb-3">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
          <div key={day} className="text-center text-xs font-medium text-gray-400 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
          const isSelected = selected?.toDateString() === date.toDateString()
          const isToday = new Date().toDateString() === date.toDateString()
          const isPast = date < new Date() && date.toDateString() !== new Date().toDateString()
          const isAvailable = availableSlots.length > 0

          return (
            <button
              key={day}
              onClick={() => !isPast && handleDateClick(day)}
              disabled={isPast}
              className={`
                aspect-square flex items-center justify-center rounded-full text-sm font-medium
                transition-all duration-200
                ${isPast ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-primary/10 cursor-pointer'}
                ${isSelected ? 'bg-primary text-white hover:bg-primary-dark' : ''}
                ${isToday && !isSelected ? 'border-2 border-primary text-primary' : ''}
                ${isAvailable && !isSelected && !isPast ? 'bg-green-50 text-green-700' : ''}
              `}
            >
              {day}
            </button>
          )
        })}
      </div>

      {/* Available Slots */}
      {selected && availableSlots.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Available Times for {selected.toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric',
              year: 'numeric' 
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            {availableSlots.map((slot, idx) => (
              <button
                key={idx}
                className="px-4 py-2 bg-primary/5 text-primary rounded-full text-sm 
                         hover:bg-primary hover:text-white transition-all duration-200"
              >
                {slot}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
