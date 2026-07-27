import { model, Schema, Types, type HydratedDocument } from 'mongoose';

export interface UserDocument {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  email: string;
  passwordHash: string;
  status: 'active' | 'locked' | 'inactive';
  tokenVersion: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRecord = HydratedDocument<UserDocument>;

const userSchema = new Schema<UserDocument>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: ['active', 'locked', 'inactive'],
      default: 'active',
      required: true,
    },
    tokenVersion: { type: Number, required: true, default: 0 },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const User = model<UserDocument>('User', userSchema);
