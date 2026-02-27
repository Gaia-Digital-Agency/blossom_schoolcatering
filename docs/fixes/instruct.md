# Implementation Instructions

## Item 1 — class-validator DTOs (status: pending)

### What
Replace all inline `@Body()` anonymous types across `core.controller.ts` and
`auth.controller.ts` with proper DTO classes decorated with `class-validator`.
Wire `ValidationPipe` globally so NestJS validates every request body before
the handler is called.

### Why
- Every body field is currently typed `?` (optional) — presence/type checks are
  scattered as ~30 imperative guards inside `core.service.ts`
- Inconsistent error shapes (`'name is required'` vs `'CART_ITEM_LIMIT_EXCEEDED'`)
- Type coercion (string → number for `price`, `caloriesKcal`) done manually
- Service should only contain business logic, not shape validation

### Dependencies to add (apps/api)
```
npm install class-validator class-transformer
```

### main.ts change
Add after `NestFactory.create(AppModule)`:
```typescript
import { ValidationPipe } from '@nestjs/common';

app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
}));
```

### DTO file layout
```
apps/api/src/auth/dto/
  login.dto.ts
  register.dto.ts
  register-youngster-with-parent.dto.ts
  change-password.dto.ts
  onboarding.dto.ts
  role-check.dto.ts

apps/api/src/core/dto/
  create-school.dto.ts
  update-school.dto.ts
  update-session-setting.dto.ts
  register-youngster.dto.ts
  update-parent.dto.ts
  update-youngster.dto.ts
  reset-password.dto.ts
  create-blackout-day.dto.ts
  create-ingredient.dto.ts
  update-ingredient.dto.ts
  create-menu-item.dto.ts
  update-menu-item.dto.ts
  create-favourite.dto.ts
  quick-reorder.dto.ts
  meal-plan-wizard.dto.ts
  apply-favourite.dto.ts
  upload-billing-proof.dto.ts
  verify-billing.dto.ts
  create-delivery-user.dto.ts
  update-delivery-user.dto.ts
  upsert-delivery-assignment.dto.ts
  auto-assign.dto.ts
  assign-delivery.dto.ts
  replace-cart-items.dto.ts
  create-cart.dto.ts
  update-order.dto.ts
```

### Key decorator patterns
```typescript
import {
  IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean,
  IsArray, IsUUID, IsEmail, IsDateString, IsIn,
  MinLength, MaxLength, Min, Max, ArrayMaxSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// Required string
@IsString() @IsNotEmpty()
name: string;

// Optional string
@IsOptional() @IsString()
description?: string;

// Number (JSON sends strings for query; body usually sends number but use Transform to be safe)
@IsNumber() @Min(0)
@Transform(({ value }) => Number(value))
price: number;

// Boolean
@IsBoolean()
@Transform(({ value }) => value === true || value === 'true')
isActive: boolean;

// UUID
@IsUUID('4')
schoolId: string;

// Array of UUIDs, max 20
@IsArray() @IsUUID('4', { each: true }) @ArrayMaxSize(20)
ingredientIds: string[];

// Date string YYYY-MM-DD (further validated in service for business rules)
@IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
serviceDate: string;

// Enum/union
@IsIn(['BREAKFAST', 'LUNCH', 'DINNER'])
session: string;

// Password
@IsString() @MinLength(8) @MaxLength(100)
password: string;
```

### Controller change pattern
```typescript
// BEFORE
import { CartItemInput } from './core.types';
@Post('admin/menu-items')
createAdminMenuItem(@Body() body: {
  serviceDate?: string;
  name?: string;
  price?: number;
  // ...
}) { ... }

// AFTER
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
@Post('admin/menu-items')
createAdminMenuItem(@Body() body: CreateMenuItemDto) { ... }
```

### Service cleanup
After each DTO is wired, delete the corresponding presence/type guards from
`core.service.ts`. Keep only business-logic checks (school exists, session
active, blackout conflicts, etc.). Remove shape checks like:
- `if (!name) throw new BadRequestException('name is required')`
- `if (isNaN(price)) throw new BadRequestException('Invalid price')`
- `if (typeof isActive !== 'boolean') throw new BadRequestException(...)`
- `if (!Array.isArray(ingredientIds)) ...`

Do NOT remove guards like:
- `assertValidUuid()` calls (SQL injection defence — keep even if UUID is
  already validated by DTO, defence in depth)
- Business rule checks (school not found, order window closed, etc.)

### Notes
- `auth.controller.ts` already has local `type` aliases (LoginBody etc.) —
  replace them entirely with the DTO class; delete the type aliases
- `createBlackoutDay` body accepts both `blackoutDate` and `blackout_date` —
  use `@Transform` to normalise to camelCase in the DTO
- `CartItemInput` (used in replaceCartItems / updateOrder) is already defined
  in `core.types.ts` — convert it to a class with decorators and re-export
- `whitelist: true` in ValidationPipe strips unknown properties, which is
  safe but means any field not declared in the DTO will be silently dropped

### Size estimate
- ~32 new DTO files (~8–25 lines each) → ~500 lines added
- `main.ts`: +4 lines
- `core.controller.ts`: replace ~30 inline body types → net neutral
- `auth.controller.ts`: replace 8 type aliases → -40 lines
- `core.service.ts`: remove ~30 shape guards → -40 lines
- Net: ~+430 lines across ~35 files. Low risk, no business logic changes.
