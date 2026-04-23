import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { runSql } from '../../auth/db.util';
import { AccessUser } from '../core.types';
import { HelpersService } from './helpers.service';
import { SchemaService } from './schema.service';

type ChildRow = {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  school_id: string;
  school_name: string;
  school_short_name?: string;
  school_grade: string;
  registration_grade?: string;
  current_school_grade?: string | null;
  registration_date?: string;
  date_of_birth: string;
  gender: string;
  dietary_allergies?: string;
};

/**
 * UsersService (in progress — see Step 14 for full extraction)
 * ============
 *
 * Scope (eventual): parents/youngsters CRUD, password admin, family
 * linking/merging, youngster registration.
 *
 * Currently owned (bootstrapped so AdminReportsService can reference it
 * without a circular dependency):
 *   - getYoungsterMe (/youngsters/me/profile read)
 *
 * Dependencies: runSql, SchemaService, HelpersService.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly schema: SchemaService,
    private readonly helpers: HelpersService,
  ) {}

  async getYoungsterMe(actor: AccessUser) {
    if (actor.role !== 'YOUNGSTER') throw new ForbiddenException('Role not allowed');
    await this.schema.ensureSchoolShortNameColumn();
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id, c.user_id, u.first_name, u.last_name, c.school_id, s.name AS school_name, s.short_name AS school_short_name,
               c.school_grade AS registration_grade,
               c.current_school_grade,
               c.created_at::text AS registration_date,
               c.date_of_birth::text AS date_of_birth, c.gender::text AS gender,
               COALESCE((
                 SELECT cdr.restriction_details
                 FROM child_dietary_restrictions cdr
                 WHERE cdr.child_id = c.id
                   AND cdr.is_active = true
                   AND cdr.deleted_at IS NULL
                   AND upper(cdr.restriction_label) = 'ALLERGIES'
                 ORDER BY cdr.updated_at DESC NULLS LAST, cdr.created_at DESC
                 LIMIT 1
               ), 'No Allergies') AS dietary_allergies
        FROM children c
        JOIN users u ON u.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        WHERE c.user_id = $1
          AND c.is_active = true
          AND c.deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [actor.uid],
    );
    if (!out) throw new NotFoundException('Youngster profile not found');
    return this.helpers.withEffectiveGrade(this.helpers.parseJsonLine<ChildRow>(out));
  }
}
