import {
  permissionCodes,
  roleCodes,
  scopeTypes,
  type PermissionCode,
  type RoleCode,
  type ScopeType,
} from '@gnomon/shared';
import { model, Schema, Types } from 'mongoose';

export interface RoleDocument {
  _id: Types.ObjectId;
  code: RoleCode;
  name: string;
  permissions: PermissionCode[];
  isSystem: boolean;
}

const roleSchema = new Schema<RoleDocument>(
  {
    code: { type: String, enum: roleCodes, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    permissions: [{ type: String, enum: permissionCodes, required: true }],
    isSystem: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

export const Role = model<RoleDocument>('Role', roleSchema);

export interface RoleAssignmentDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  roleId: Types.ObjectId;
  scopeType: ScopeType;
  scopeIds: Types.ObjectId[];
  validFrom: Date;
  validUntil: Date | null;
  grantedBy: Types.ObjectId | null;
}

const roleAssignmentSchema = new Schema<RoleAssignmentDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    scopeType: { type: String, enum: scopeTypes, required: true },
    scopeIds: [{ type: Schema.Types.ObjectId }],
    validFrom: { type: Date, required: true, default: Date.now },
    validUntil: { type: Date, default: null },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

roleAssignmentSchema.index({ userId: 1, roleId: 1, scopeType: 1 });
roleAssignmentSchema.index({ userId: 1, validFrom: 1, validUntil: 1 });

export const RoleAssignment = model<RoleAssignmentDocument>('RoleAssignment', roleAssignmentSchema);
