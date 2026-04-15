import { z } from "zod";
export declare const RoleSchema: z.ZodEnum<["PARENT", "YOUNGSTER", "ADMIN", "KITCHEN", "DELIVERY"]>;
export type Role = z.infer<typeof RoleSchema>;
export declare const SessionTypeSchema: z.ZodEnum<["LUNCH", "SNACK", "BREAKFAST"]>;
export type SessionType = z.infer<typeof SessionTypeSchema>;
export declare const LoginSchema: z.ZodObject<{
    identifier: z.ZodString;
    password: z.ZodString;
    role: z.ZodOptional<z.ZodEnum<["PARENT", "YOUNGSTER", "ADMIN", "KITCHEN", "DELIVERY"]>>;
}, "strip", z.ZodTypeAny, {
    identifier: string;
    password: string;
    role?: "PARENT" | "YOUNGSTER" | "ADMIN" | "KITCHEN" | "DELIVERY" | undefined;
}, {
    identifier: string;
    password: string;
    role?: "PARENT" | "YOUNGSTER" | "ADMIN" | "KITCHEN" | "DELIVERY" | undefined;
}>;
export type LoginDto = z.infer<typeof LoginSchema>;
export declare const RegisterSchema: z.ZodObject<{
    role: z.ZodEnum<["PARENT", "YOUNGSTER", "ADMIN", "KITCHEN", "DELIVERY"]>;
    username: z.ZodString;
    password: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    phoneNumber: z.ZodString;
    email: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodString>;
    allergies: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    password: string;
    role: "PARENT" | "YOUNGSTER" | "ADMIN" | "KITCHEN" | "DELIVERY";
    username: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email?: string | undefined;
    address?: string | undefined;
    allergies?: string | undefined;
}, {
    password: string;
    role: "PARENT" | "YOUNGSTER" | "ADMIN" | "KITCHEN" | "DELIVERY";
    username: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email?: string | undefined;
    address?: string | undefined;
    allergies?: string | undefined;
}>;
export type RegisterDto = z.infer<typeof RegisterSchema>;
export declare const RefreshSchema: z.ZodObject<{
    refreshToken: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    refreshToken?: string | undefined;
}, {
    refreshToken?: string | undefined;
}>;
export type RefreshDto = z.infer<typeof RefreshSchema>;
export declare const ChangePasswordSchema: z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    currentPassword: string;
    newPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
}>;
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
export declare const ForgotPasswordSchema: z.ZodObject<{
    identifier: z.ZodString;
}, "strip", z.ZodTypeAny, {
    identifier: string;
}, {
    identifier: string;
}>;
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;
export declare const ResetPasswordWithTokenSchema: z.ZodObject<{
    token: z.ZodString;
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    newPassword: string;
    token: string;
}, {
    newPassword: string;
    token: string;
}>;
export type ResetPasswordWithTokenDto = z.infer<typeof ResetPasswordWithTokenSchema>;
export declare const CreateSchoolSchema: z.ZodObject<{
    name: z.ZodString;
    shortName: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodString>;
    active: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    address?: string | undefined;
    shortName?: string | undefined;
    active?: boolean | undefined;
}, {
    name: string;
    address?: string | undefined;
    shortName?: string | undefined;
    active?: boolean | undefined;
}>;
export type CreateSchoolDto = z.infer<typeof CreateSchoolSchema>;
export declare const CreateMenuItemSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    session: z.ZodEnum<["LUNCH", "SNACK", "BREAKFAST"]>;
    serviceDate: z.ZodString;
    price: z.ZodNumber;
    imageUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    session: "LUNCH" | "SNACK" | "BREAKFAST";
    serviceDate: string;
    price: number;
    description?: string | undefined;
    imageUrl?: string | undefined;
}, {
    name: string;
    session: "LUNCH" | "SNACK" | "BREAKFAST";
    serviceDate: string;
    price: number;
    description?: string | undefined;
    imageUrl?: string | undefined;
}>;
export type CreateMenuItemDto = z.infer<typeof CreateMenuItemSchema>;
export declare const CartItemSchema: z.ZodObject<{
    menuItemId: z.ZodString;
    quantity: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    menuItemId: string;
    quantity: number;
}, {
    menuItemId: string;
    quantity: number;
}>;
export type CartItem = z.infer<typeof CartItemSchema>;
export declare const CreateCartSchema: z.ZodObject<{
    childId: z.ZodString;
    session: z.ZodEnum<["LUNCH", "SNACK", "BREAKFAST"]>;
    serviceDate: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        menuItemId: z.ZodString;
        quantity: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        menuItemId: string;
        quantity: number;
    }, {
        menuItemId: string;
        quantity: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    session: "LUNCH" | "SNACK" | "BREAKFAST";
    serviceDate: string;
    childId: string;
    items: {
        menuItemId: string;
        quantity: number;
    }[];
}, {
    session: "LUNCH" | "SNACK" | "BREAKFAST";
    serviceDate: string;
    childId: string;
    items: {
        menuItemId: string;
        quantity: number;
    }[];
}>;
export type CreateCartDto = z.infer<typeof CreateCartSchema>;
