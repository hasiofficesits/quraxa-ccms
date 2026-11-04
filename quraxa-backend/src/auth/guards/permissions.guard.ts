import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        // What permissions does this route require?
        const required = this.reflector.getAllAndOverride<string[]>('permissions', [
            context.getHandler(),
            context.getClass(),
        ]);

        // No permission requirement = allow (as long as JWT guard passed)
        if (!required || required.length === 0) {
            return true;
        }

        const { user } = context.switchToHttp().getRequest();
        if (!user || !user.permissions) {
            throw new ForbiddenException('No permissions found');
        }

        // User must have EVERY required permission
        const hasAll = required.every((p) => user.permissions.includes(p));
        if (!hasAll) {
            throw new ForbiddenException('Insufficient permissions');
        }

        return true;
    }
}