import * as fs from 'fs';
import * as path from 'path';
import { CoreService } from './core.service';

/**
 * Regression guard for the CoreService public surface.
 *
 * Purpose: during the refactor that splits core.service.ts into smaller
 * sub-services behind a CoreService facade, every public method listed in
 * core.service.public-surface.json must still exist on CoreService.prototype
 * with the same name. Controllers (core, public, archived) call these
 * methods directly; removing or renaming any of them silently breaks an
 * endpoint.
 *
 * If you INTENTIONALLY add, rename, or remove a public method, regenerate
 * the snapshot:
 *
 *   node -e "const fs=require('fs'),src=fs.readFileSync('apps/api/src/core/core.service.ts','utf8'),lines=src.split('\\n'),m=[];for(const l of lines){const r=l.match(/^  (async )?([a-zA-Z_][a-zA-Z0-9_]*)\\(/);if(r&&!['constructor','if','for','while','switch','return','catch'].includes(r[2]))m.push(r[2])}const s=new Set(),u=m.filter(n=>{if(s.has(n))return false;s.add(n);return true});fs.writeFileSync('apps/api/src/core/core.service.public-surface.json',JSON.stringify(u.sort(),null,2)+'\\n')"
 *
 * And update the controller-caller manifest:
 *
 *   node -e "const fs=require('fs'),c={},f=['apps/api/src/core/core.controller.ts','apps/api/src/core/public.controller.ts','apps/api/src/core/archived.controller.ts'];for(const p of f){const s=fs.readFileSync(p,'utf8');for(const m of s.matchAll(/this\\.coreService\\.([a-zA-Z_][a-zA-Z0-9_]*)/g)){const n=m[1];if(!c[n])c[n]=new Set();c[n].add(p.split('/').pop())}}fs.writeFileSync('apps/api/src/core/core.service.controller-callers.json',JSON.stringify(Object.keys(c).sort().map(k=>({name:k,controllers:[...c[k]].sort()})),null,2)+'\\n')"
 */

const surfacePath = path.resolve(__dirname, 'core.service.public-surface.json');
const callersPath = path.resolve(__dirname, 'core.service.controller-callers.json');

const expectedSurface: string[] = JSON.parse(fs.readFileSync(surfacePath, 'utf8'));
const controllerCallers: Array<{ name: string; controllers: string[] }> = JSON.parse(
  fs.readFileSync(callersPath, 'utf8'),
);

function getCoreServiceMethodNames(): string[] {
  const proto = CoreService.prototype as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor')
    .filter((name) => typeof proto[name] === 'function')
    .sort();
}

describe('CoreService public surface (refactor guard)', () => {
  const actualMethods = getCoreServiceMethodNames();
  const actualSet = new Set(actualMethods);

  it('keeps every snapshotted method on CoreService.prototype', () => {
    const missing = expectedSurface.filter((name) => !actualSet.has(name));
    if (missing.length > 0) {
      throw new Error(
        `CoreService is missing ${missing.length} method(s) that controllers or the snapshot expect:\n  - ${missing.join(
          '\n  - ',
        )}\n\nIf this is intentional (rename/removal), regenerate the snapshot — see the header comment of this file.`,
      );
    }
  });

  it('keeps every controller-called method callable on CoreService', () => {
    const broken = controllerCallers.filter(({ name }) => !actualSet.has(name));
    if (broken.length > 0) {
      const lines = broken.map((b) => `  - ${b.name}  (called by: ${b.controllers.join(', ')})`);
      throw new Error(
        `CoreService is missing ${broken.length} method(s) still referenced by controllers:\n${lines.join(
          '\n',
        )}\n\nControllers will throw TypeError at runtime. Add the method back or update the controllers.`,
      );
    }
  });

  it('snapshot contains the expected count (guard against accidental snapshot truncation)', () => {
    expect(expectedSurface.length).toBeGreaterThanOrEqual(132);
  });

  it('controller-caller manifest contains the expected count', () => {
    expect(controllerCallers.length).toBeGreaterThanOrEqual(127);
  });
});
