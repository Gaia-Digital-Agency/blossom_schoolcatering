import { z } from "zod";

// === Enums ===

export const RoleSchema = z.enum([
  "PARENT",
  "YOUNGSTER",
  "ADMIN",
  "KITCHEN",
  "DELIVERY",
]);
export type Role = z.infer<typeof RoleSchema>;

export const SessionTypeSchema = z.enum(["LUNCH", "SNACK", "BREAKFAST"]);
export type SessionType = z.infer<typeof SessionTypeSchema>;

// === Auth Schemas ===

export const LoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
  role: RoleSchema.optional(),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const RegisterSchema = z.object({
  role: RoleSchema,
  username: z.string().min(1),
  password: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phoneNumber: z.string().min(1),
  email: z.string().email().optional(),
  address: z.string().optional(),
  allergies: z.string().optional(),
});
export type RegisterDto = z.infer<typeof RegisterSchema>;

export const RefreshSchema = z.object({
  refreshToken: z.string().optional(),
});
export type RefreshDto = z.infer<typeof RefreshSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;

export const ForgotPasswordSchema = z.object({
  identifier: z.string().min(1),
});
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordWithTokenSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(1),
});
export type ResetPasswordWithTokenDto = z.infer<
  typeof ResetPasswordWithTokenSchema
>;

// === Core Schemas ===

export const CreateSchoolSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().optional(),
  address: z.string().optional(),
  active: z.boolean().optional(),
});
export type CreateSchoolDto = z.infer<typeof CreateSchoolSchema>;

export const CreateMenuItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  session: SessionTypeSchema,
  serviceDate: z.string().min(1),
  price: z.number().nonnegative(),
  imageUrl: z.string().url().optional(),
});
export type CreateMenuItemDto = z.infer<typeof CreateMenuItemSchema>;

export const CartItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
});
export type CartItem = z.infer<typeof CartItemSchema>;

export const CreateCartSchema = z.object({
  childId: z.string().uuid(),
  session: SessionTypeSchema,
  serviceDate: z.string().min(1),
  items: z.array(CartItemSchema).min(1),
});
export type CreateCartDto = z.infer<typeof CreateCartSchema>;
