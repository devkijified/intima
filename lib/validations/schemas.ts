import { z } from "zod"

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  role: z.enum(['model', 'client']),
})

export type SignupSchema = z.infer<typeof signupSchema>
