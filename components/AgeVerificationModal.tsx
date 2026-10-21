'use client'

import { useState } from 'react'
import { X, ShieldAlert } from '@/lib/icons'

interface AgeVerificationModalProps {
  isOpen: boolean
  onClose: () => void
  onVerify: (age: number) => void
}

export function AgeVerificationModal({ isOpen, onClose, onVerify }: AgeVerificationModalProps) {
  const [age, setAge] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleVerify = () => {
    const ageNum = parseInt(age)
    if (!age || isNaN(ageNum)) {
      setError('Please enter a valid age')
      return
    }
    if (ageNum < 18) {
      setError('You must be 18 or older to access this site')
      return
    }
    if (ageNum > 120) {
      setError('Please enter a valid age')
      return
    }
    onVerify(ageNum)
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center md:items-center md:p-4">
      <div className="bg-white rounded-t-3xl md:rounded-3xl max-w-md w-full px-8 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-2xl animate-sheet-up md:animate-none">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-charcoal">Adult Content Warning</h2>
            <p className="text-gray-500 text-sm mt-1">Please confirm you are 18 or older</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-2 -mt-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-gray-400 hover:text-gray-600">
            <X aria-hidden className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-primary-muted p-4 rounded-xl text-sm text-gray-700">
            <p className="font-medium flex items-center gap-2">
              <ShieldAlert aria-hidden className="w-4 h-4 text-primary" />
              Why we ask
            </p>
            <p>Intima is an adult platform. It contains adult companionship content, including nudity and sexually explicit material. If you are under 18, or under the age of majority where you live, do not enter.</p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Your Age
            </label>
            <input
              type="number"
              value={age}
              onChange={(e) => {
                setAge(e.target.value)
                setError('')
              }}
              className="min-h-[48px] w-full px-4 py-3 text-base md:text-sm border border-gray-300 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
              placeholder="Enter your age..."
              min="18"
              max="120"
            />
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
          </div>

          <button
            onClick={handleVerify}
            className="min-h-[48px] w-full bg-primary text-white py-3 rounded-xl font-medium 
                     hover:bg-primary-dark transition-all duration-300"
          >
            Verify & Continue
          </button>

          <p className="text-xs text-gray-400 text-center">
            By tapping Verify & Continue, you confirm you are an adult and agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  )
}
