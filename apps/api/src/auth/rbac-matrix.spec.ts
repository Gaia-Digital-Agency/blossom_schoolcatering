import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from './roles.decorator';
import { AuthController } from './auth.controller';
import { CoreController } from '../core/core.controller';

function getMethodRoles(controller: any, methodName: string): string[] {
  const method = controller.prototype[methodName];
  return Reflect.getMetadata(ROLES_KEY, method) || [];
}

function getMethodPath(controller: any, methodName: string): string {
  const method = controller.prototype[methodName];
  return String(Reflect.getMetadata(PATH_METADATA, method) || '');
}

function getHttpMethod(controller: any, methodName: string): string {
  const method = controller.prototype[methodName];
  return String(Reflect.getMetadata(METHOD_METADATA, method) || '');
}

describe('RBAC Matrix', () => {
  it('enforces explicit role matrix for critical CoreController methods', () => {
    const expected: Record<string, string[]> = {
      createSchool: ['ADMIN'],
      updateSchoolActive: ['ADMIN'],
      deleteSchool: ['ADMIN'],
      getAdminBilling: ['ADMIN'],
      verifyBilling: ['ADMIN'],
      generateBillingReceipt: ['ADMIN'],
      getAdminAuditLogs: ['ADMIN'],
      createAdminMenuItem: ['ADMIN'],
      updateAdminMenuItem: ['ADMIN'],
      deleteAdminMenuItem: ['ADMIN'],
      createDeliveryUser: ['ADMIN'],
      updateDeliveryUser: ['ADMIN'],
      deactivateDeliveryUser: ['ADMIN'],
      deleteDeliveryUser: ['ADMIN'],
      autoAssignDelivery: ['ADMIN'],
      assignDelivery: ['ADMIN'],
      getDeliveryAssignments: ['ADMIN', 'DELIVERY'],
      confirmDelivery: ['DELIVERY'],
      toggleDeliveryCompletion: ['DELIVERY'],
      getParentConsolidatedBilling: ['PARENT'],
      uploadBillingProof: ['PARENT'],
      uploadBillingProofBatch: ['PARENT'],
    };

    for (const [methodName, roles] of Object.entries(expected)) {
      expect(getMethodRoles(CoreController, methodName)).toEqual(roles);
    }
  });

  it('ensures /admin* routes are ADMIN-only in CoreController', () => {
    const methods = Object.getOwnPropertyNames(CoreController.prototype).filter((name) => name !== 'constructor');
    for (const methodName of methods) {
      const path = getMethodPath(CoreController, methodName);
      if (!path.startsWith('admin')) continue;
      expect(getMethodRoles(CoreController, methodName)).toEqual(['ADMIN']);
    }
  });

  it('keeps auth admin endpoint ADMIN-only and avoids accidental public mutation endpoints', () => {
    expect(getMethodRoles(AuthController, 'adminPing')).toEqual(['ADMIN']);

    const authMethods = Object.getOwnPropertyNames(AuthController.prototype).filter((name) => name !== 'constructor');
    for (const methodName of authMethods) {
      const path = getMethodPath(AuthController, methodName);
      const method = getHttpMethod(AuthController, methodName);
      if (!path || !method || method === '0') continue;
      if (path.startsWith('admin')) {
        expect(getMethodRoles(AuthController, methodName)).toEqual(['ADMIN']);
      }
    }
  });
});
