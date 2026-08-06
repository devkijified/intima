'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-charcoal">Age Verification</h2>
            <p className="text-gray-500 text-sm mt-1">Please confirm you are 18 or older</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-primary-muted p-4 rounded-xl text-sm text-gray-700">
            <p className="font-medium">🔞 Age Restriction</p>
            <p>This platform is strictly for adults aged 18 and above.</p>
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
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
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
            className="w-full bg-primary text-white py-3 rounded-xl font-medium 
                     hover:bg-primary-dark transition-all duration-300"
          >
            Verify & Continue
          </button>

          <p className="text-xs text-gray-400 text-center">
            By proceeding, you agree to our Privacy Policy and Terms of Service
          </p>
        </div>
      </div>
    </div>
  )
}
