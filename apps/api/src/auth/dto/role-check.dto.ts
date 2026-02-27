import { ArrayMaxSize, IsArray, IsIn, IsOptional } from 'class-validator';

export class RoleCheckDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsIn(['PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN', 'DELIVERY'], { each: true })
  allowedRoles?: Array<'PARENT' | 'YOUNGSTER' | 'ADMIN' | 'KITCHEN' | 'DELIVERY'>;
}
