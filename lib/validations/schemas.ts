import { z } from "zod"

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  role: z.enum(['model', 'client']),
})

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const modelProfileSchema = z.object({
  displayName: z.string().min(2, 'Display name is required'),
  age: z.number().min(18, 'Must be at least 18').max(99),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  ratePerHour: z.number().min(1000, 'Rate must be at least ₦1,000'),
  bio: z.string().max(500, 'Bio must be less than 500 characters'),
  services: z.array(z.string()),
})

export type SignupSchema = z.infer<typeof signupSchema>
export type LoginSchema = z.infer<typeof loginSchema>
export type ModelProfileSchema = z.infer<typeof modelProfileSchema>
